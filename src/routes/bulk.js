const router = require('express').Router();
const twilio = require('twilio');
const Product = require('../models/Product');
const Order = require('../models/Order');
const BulkInquiry = require('../models/BulkInquiry');
const { protect, requireRole } = require('../middleware/auth');

const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
const ADMIN_WHATSAPP = 'whatsapp:+916350557300';

// POST /api/bulk/inquiry
router.post('/inquiry', async (req, res) => {
  try {
    const { businessName, contactPerson, phone, productNeeded, quantity, city, message } = req.body;

    if (!businessName || !contactPerson || !phone || !productNeeded || !quantity || !city) {
      return res.status(400).json({
        message: 'businessName, contactPerson, phone, productNeeded, quantity and city are required',
      });
    }

    const inquiry = await BulkInquiry.create({
      businessName,
      contactPerson,
      phone,
      productNeeded,
      quantity,
      city,
      message,
    });

    const waMessage =
      `New B2B Inquiry!\n` +
      `Business: ${businessName}\n` +
      `Contact: ${contactPerson} - ${phone}\n` +
      `Product: ${productNeeded}\n` +
      `Quantity: ${quantity}kg\n` +
      `City: ${city}`;

    await twilioClient.messages.create({
      body: waMessage,
      from: `whatsapp:${process.env.TWILIO_PHONE}`,
      to: ADMIN_WHATSAPP,
    });

    res.status(201).json({
      success: true,
      message: 'We will contact you within 2 hours',
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/bulk/products  — list products that have bulk pricing
router.get('/products', async (req, res) => {
  try {
    const { category, page = 1, limit = 20 } = req.query;
    const query = { isActive: true, bulkPrice: { $exists: true, $ne: null } };
    if (category) query.category = category;

    const [products, total] = await Promise.all([
      Product.find(query)
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .sort({ bulkPrice: 1 }),
      Product.countDocuments(query),
    ]);

    res.json({ products, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/bulk/quote  — calculate bulk order total before placing
router.post('/quote', protect, async (req, res) => {
  try {
    const { items } = req.body;
    if (!items?.length) return res.status(400).json({ message: 'Items are required' });

    let totalAmount = 0;
    const breakdown = [];

    for (const item of items) {
      const product = await Product.findById(item.product).select('name price bulkPrice bulkMinQty unit');
      if (!product) return res.status(404).json({ message: `Product ${item.product} not found` });

      const isBulk = product.bulkPrice && item.quantity >= product.bulkMinQty;
      const unitPrice = isBulk ? product.bulkPrice : product.price;
      const lineTotal = unitPrice * item.quantity;
      totalAmount += lineTotal;

      breakdown.push({
        product: { id: product._id, name: product.name, unit: product.unit },
        quantity: item.quantity,
        unitPrice,
        isBulk,
        lineTotal,
        savings: isBulk ? (product.price - product.bulkPrice) * item.quantity : 0,
      });
    }

    res.json({ breakdown, totalAmount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/bulk/orders  — admin sees all bulk orders
router.get('/orders', protect, requireRole('admin'), async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const [orders, total] = await Promise.all([
      Order.find({ isBulkOrder: true })
        .populate('buyer', 'name phone')
        .populate('items.product', 'name')
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .sort({ createdAt: -1 }),
      Order.countDocuments({ isBulkOrder: true }),
    ]);
    res.json({ orders, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/bulk/orders  — place a bulk order directly (reuses orders logic, flagged as bulk)
router.post('/orders', protect, async (req, res) => {
  try {
    const { items, deliveryAddress, notes } = req.body;
    if (!items?.length) return res.status(400).json({ message: 'Items are required' });

    let totalAmount = 0;
    const resolvedItems = [];

    for (const item of items) {
      const product = await Product.findById(item.product);
      if (!product || !product.isActive) {
        return res.status(400).json({ message: `Product ${item.product} not available` });
      }
      if (!product.bulkPrice || item.quantity < product.bulkMinQty) {
        return res.status(400).json({
          message: `${product.name} requires a minimum of ${product.bulkMinQty} units for bulk ordering`,
        });
      }
      if (product.stock < item.quantity) {
        return res.status(400).json({ message: `Insufficient stock for ${product.name}` });
      }

      totalAmount += product.bulkPrice * item.quantity;
      resolvedItems.push({ product: item.product, quantity: item.quantity, price: product.bulkPrice });
    }

    const order = await Order.create({
      buyer: req.user._id,
      items: resolvedItems,
      totalAmount,
      shippingAddress: deliveryAddress,
      paymentMethod: 'cod',
    });

    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
