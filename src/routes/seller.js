const router = require('express').Router();
const Product = require('../models/Product');
const Order = require('../models/Order');
const BulkInquiry = require('../models/BulkInquiry');
const Deal = require('../models/Deal');
const Notification = require('../models/Notification');
const cloudinary = require('../config/cloudinary');
const { protect, requireRole } = require('../middleware/auth');


const sellerOnly = [protect, requireRole('seller', 'admin')];


router.post('/upload', sellerOnly, async (req, res) => {
  try {
    const { image } = req.body;
    if (!image || typeof image !== 'string') {
      return res.status(400).json({ message: 'image (data URL) is required' });
    }
    const result = await cloudinary.uploader.upload(image, {
      folder: 'fisto/products',
    });
    res.status(201).json({ url: result.secure_url, publicId: result.public_id });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Upload failed' });
  }
});


router.get('/products', sellerOnly, async (req, res) => {
  try {
    const { status, category, search, page = 1, limit = 50 } = req.query;
    const query = { owner: req.user._id };

    if (category) query.category = category;
    if (search) {
      const re = new RegExp(search, 'i');
      query.$or = [{ name: re }, { sku: re }];
    }

    const skip = (Number(page) - 1) * Number(limit);
    let products = await Product.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

   
    if (status && status !== 'all') {
      const want = status.toUpperCase();
      products = products.filter((p) => p.stockStatus === want);
    }

    res.json({ products, total: products.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.get('/products/:id', sellerOnly, async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, owner: req.user._id });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json({ product });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.post('/products', sellerOnly, async (req, res) => {
  try {
    const { name, price, category } = req.body;
    if (!name || price == null || !category) {
      return res.status(400).json({ message: 'name, price and category are required' });
    }


    const product = await Product.create({
      ...req.body,
      owner: req.user._id,
      producerName: req.body.producerName || req.user.name || req.user.ownerName,
    });

    res.status(201).json({ product });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});


router.put('/products/:id', sellerOnly, async (req, res) => {
  try {
    
    const updates = { ...req.body };
    delete updates.owner;

    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id },
      updates,
      { new: true, runValidators: true }
    );
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json({ product });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});


router.patch('/products/:id/stock', sellerOnly, async (req, res) => {
  try {
    const { stock, delta } = req.body;
    const product = await Product.findOne({ _id: req.params.id, owner: req.user._id });
    if (!product) return res.status(404).json({ message: 'Product not found' });

    if (stock != null) product.stock = Math.max(0, Number(stock));
    else if (delta != null) product.stock = Math.max(0, product.stock + Number(delta));
    else return res.status(400).json({ message: 'Provide stock or delta' });

    await product.save();
    res.json({ product });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});


router.delete('/products/:id', sellerOnly, async (req, res) => {
  try {
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id },
      { isActive: false },
      { new: true }
    );
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


async function sellerProductIds(ownerId) {
  const ids = await Product.find({ owner: ownerId }).distinct('_id');
  return ids;
}


router.get('/orders', sellerOnly, async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const productIds = await sellerProductIds(req.user._id);

    const query = { 'items.product': { $in: productIds } };
    if (status && status !== 'all') query.status = status;

    const skip = (Number(page) - 1) * Number(limit);
    const orders = await Order.find(query)
      .populate('buyer', 'name phone')
      .populate('items.product', 'name images price unit owner')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    res.json({ orders, total: orders.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.patch('/orders/:id/status', sellerOnly, async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['confirmed', 'processing', 'shipped', 'delivered', 'returned'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: `status must be one of ${allowed.join(', ')}` });
    }

    const productIds = await sellerProductIds(req.user._id);
    const order = await Order.findOne({
      _id: req.params.id,
      'items.product': { $in: productIds },
    });
    if (!order) return res.status(404).json({ message: 'Order not found' });

    order.status = status;
    await order.save();
    res.json({ order });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});


router.get('/dashboard', sellerOnly, async (req, res) => {
  try {
    const productIds = await sellerProductIds(req.user._id);

    const [products, orders] = await Promise.all([
      Product.find({ owner: req.user._id }),
      Order.find({ 'items.product': { $in: productIds } })
        .populate('items.product', 'name owner price')
        .sort({ createdAt: -1 }),
    ]);

    const idSet = new Set(productIds.map((id) => id.toString()));

    
    let totalRevenue = 0;
    let unitsSold = 0;
    const revenueByProduct = {};
    const revenueByDay = {};
    const revenueByPayment = { upi: 0, cod: 0 };

    for (const order of orders) {
      let orderSellerRevenue = 0;
      for (const item of order.items) {
        const pid = (item.product?._id || item.product)?.toString();
        if (!pid || !idSet.has(pid)) continue;
        const line = item.price * item.quantity;
        totalRevenue += line;
        unitsSold += item.quantity;
        orderSellerRevenue += line;

        const name = item.product?.name || 'Product';
        revenueByProduct[name] = (revenueByProduct[name] || 0) + line;

        const day = new Date(order.createdAt).toISOString().slice(0, 10);
        revenueByDay[day] = (revenueByDay[day] || 0) + line;
      }
      
      const method = order.paymentMethod === 'upi' ? 'upi' : 'cod';
      revenueByPayment[method] += orderSellerRevenue;
    }

    const orderCount = orders.length;
    const avgOrderValue = orderCount ? totalRevenue / orderCount : 0;

    const topProducts = Object.entries(revenueByProduct)
      .map(([name, revenue]) => ({ name, revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    const trend = Object.entries(revenueByDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-7)
      .map(([date, revenue]) => ({ date, revenue }));

    const paymentTotal = revenueByPayment.upi + revenueByPayment.cod;
    const paymentBreakdown = [
      { method: 'upi', label: 'UPI / Online', amount: Math.round(revenueByPayment.upi) },
      { method: 'cod', label: 'Cash on Delivery', amount: Math.round(revenueByPayment.cod) },
    ].map((p) => ({
      ...p,
      pct: paymentTotal ? Math.round((p.amount / paymentTotal) * 100) : 0,
    }));

    const lowStock = products.filter((p) => p.stockStatus === 'LOW_STOCK').length;
    const outOfStock = products.filter((p) => p.stockStatus === 'OUT_OF_STOCK').length;
    const pendingOrders = orders.filter((o) =>
      ['pending', 'confirmed', 'processing'].includes(o.status)
    ).length;

    res.json({
      stats: {
        totalRevenue: Math.round(totalRevenue),
        orderCount,
        avgOrderValue: Math.round(avgOrderValue * 100) / 100,
        unitsSold,
        productCount: products.length,
        lowStock,
        outOfStock,
        pendingOrders,
      },
      topProducts,
      trend,
      paymentBreakdown,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.get('/inquiries', sellerOnly, async (req, res) => {
  try {
    const inquiries = await BulkInquiry.find().sort({ createdAt: -1 }).limit(100);
    res.json({ inquiries });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});




router.get('/deals', sellerOnly, async (req, res) => {
  try {
    const { status } = req.query;

 
    await Deal.updateMany(
      {
        seller: req.user._id,
        status: { $in: ['invited', 'accepted'] },
        endsAt: { $lt: new Date() },
      },
      { status: 'expired' },
    );

    const query = { seller: req.user._id };
    if (status && status !== 'all') query.status = status;

    const deals = await Deal.find(query)
      .populate('product', 'name images price stock')
      .populate('sale', 'title')
      .sort({ createdAt: -1 });
    res.json({ deals });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.patch('/deals/:id/accept', sellerOnly, async (req, res) => {
  try {
    const { dealPrice } = req.body;
    const deal = await Deal.findOne({ _id: req.params.id, seller: req.user._id }).populate(
      'product',
      'name price',
    );
    if (!deal) return res.status(404).json({ message: 'Deal not found' });
    if (deal.status !== 'invited') {
      return res.status(400).json({ message: `Deal is already ${deal.status}` });
    }

    const price = Number(dealPrice);
    if (!price || price <= 0) {
      return res.status(400).json({ message: 'Enter a valid deal price' });
    }
    if (deal.product && price >= deal.product.price) {
      return res.status(400).json({ message: 'Deal price must be below the product price' });
    }
    if (deal.suggestedPrice != null && price > deal.suggestedPrice) {
      return res.status(400).json({ message: `Deal price must be ₹${deal.suggestedPrice} or lower` });
    }

    deal.dealPrice = price;
    deal.status = 'accepted';
    await deal.save();

   
    if (deal.kind === 'targeted' && deal.targetUsers?.length) {
      await Notification.insertMany(
        deal.targetUsers.map((u) => ({
          user: u,
          type: 'offer',
          title: 'A special offer for you',
          message: `"${deal.product?.name ?? 'A product'}" is now available at a special price.`,
        })),
      );
    }

    res.json({ deal });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});


router.patch('/deals/:id/decline', sellerOnly, async (req, res) => {
  try {
    const deal = await Deal.findOneAndUpdate(
      { _id: req.params.id, seller: req.user._id, status: 'invited' },
      { status: 'declined' },
      { new: true },
    );
    if (!deal) return res.status(404).json({ message: 'Deal not found or not pending' });
    res.json({ deal });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
