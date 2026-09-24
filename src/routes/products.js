const router = require('express').Router();
const jwt = require('jsonwebtoken');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Category = require('../models/Category');
const Deal = require('../models/Deal');
const Sale = require('../models/Sale');
const { protect, requireRole } = require('../middleware/auth');


function optionalUser(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(header.split(' ')[1], process.env.JWT_SECRET).id;
  } catch {
    return null;
  }
}


function dealToCard(deal) {
  const p = deal.product;
  if (!p) return null;
  const obj = p.toObject ? p.toObject() : p;
  return { ...obj, dealPrice: deal.dealPrice, dealEndsAt: deal.endsAt };
}


router.get('/deals', async (req, res) => {
  try {
    const userId = optionalUser(req);
    const deals = await Deal.liveForUser(userId, { placement: 'deal_of_the_day' })
      .populate('product')
      .sort({ endsAt: 1 });
    const products = deals
      .filter((d) => d.product && d.product.isActive && d.product.stock > 0)
      .map(dealToCard)
      .filter(Boolean);
    res.json({ products });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.get('/sales', async (req, res) => {
  try {
    const now = new Date();
    const sales = await Sale.find({
      isActive: true,
      $and: [
        { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
        { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
      ],
    }).sort({ endsAt: 1 });

    const result = await Promise.all(
      sales.map(async (sale) => {
        const deals = await Deal.find({
          kind: 'public',
          placement: 'sale',
          sale: sale._id,
          status: 'accepted',
        }).populate('product');
        const products = deals
          .filter((d) => d.product && d.product.isActive && d.product.stock > 0)
          .map(dealToCard)
          .filter(Boolean);
        return { ...sale.toObject(), products };
      }),
    );

    
    res.json({ sales: result.filter((s) => s.products.length > 0) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.get('/categories', async (req, res) => {
  try {
    const counts = await Product.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    // Attach the admin-set image/colour (matched on lowercase name).
    const metas = await Category.find({});
    const metaByName = {};
    metas.forEach((m) => { metaByName[m.name] = m; });
    const categories = counts.map((c) => {
      const meta = metaByName[String(c._id).toLowerCase()];
      return {
        name: c._id,
        count: c.count,
        image: meta?.image || '',
        color: meta?.color || '',
      };
    });
    res.json({ categories });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.get('/', async (req, res) => {
  try {
    const { category, search, page = 1, limit = 20 } = req.query;
    const query = { isActive: true };

    if (category) query.category = category;
    if (search) {
      const re = new RegExp(search, 'i');
      query.$or = [{ name: re }, { description: re }, { producerName: re }];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [products, total] = await Promise.all([
      Product.find(query)
        .select('name price mrp category images stock unit producerName producerVillage location pinCode address isActive')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Product.countDocuments(query),
    ]);

    res.json({
      products,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.get('/search', async (req, res) => {
  try {
    const { q, category, pinCode, minPrice, maxPrice, page = 1, limit = 20 } = req.query;
    const query = { isActive: true };

    if (q) {
      const re = new RegExp(q, 'i');
      query.$or = [
        { name: re },
        { description: re },
        { producerName: re },
        { location: re },
        { address: re },
      ];
    }

    if (category) query.category = category;
    if (pinCode) query.pinCode = pinCode;

    if (minPrice != null || maxPrice != null) {
      query.price = {};
      if (minPrice != null) query.price.$gte = Number(minPrice);
      if (maxPrice != null) query.price.$lte = Number(maxPrice);
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [products, total] = await Promise.all([
      Product.find(query)
        .select('name price mrp category images stock unit producerName producerVillage location pinCode address isActive')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Product.countDocuments(query),
    ]);

    res.json({
      products,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product || !product.isActive) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json({ product });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.get('/:id/can-review', protect, async (req, res) => {
  try {
    const bought = await Order.exists({ buyer: req.user._id, 'items.product': req.params.id });
    const product = await Product.findById(req.params.id).select('reviews');
    const hasReviewed = !!product?.reviews?.some((rv) => String(rv.user) === String(req.user._id));
    res.json({ canReview: !!bought, hasReviewed });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.post('/:id/reviews', protect, async (req, res) => {
  try {
    const rating = Number(req.body.rating);
    const comment = (req.body.comment || '').trim();
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'A rating between 1 and 5 is required' });
    }

    const product = await Product.findById(req.params.id);
    if (!product || !product.isActive) {
      return res.status(404).json({ message: 'Product not found' });
    }

   
    const bought = await Order.exists({ buyer: req.user._id, 'items.product': product._id });
    if (!bought) {
      return res.status(403).json({
        code: 'NOT_PURCHASED',
        message: 'You can review a product only after buying it.',
      });
    }

    
    const existing = product.reviews.find((rv) => String(rv.user) === String(req.user._id));
    if (existing) {
      existing.rating = rating;
      existing.comment = comment;
      existing.name = req.user.name || existing.name;
      existing.createdAt = new Date();
    } else {
      product.reviews.push({
        user: req.user._id,
        name: req.user.name || 'Customer',
        rating,
        comment,
      });
    }

    await product.save();
    res.status(201).json({ reviews: product.reviews });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.post('/', protect, requireRole('admin'), async (req, res) => {
  try {
    const { name, price, category, stock } = req.body;
    if (!name || price == null || !category || stock == null) {
      return res.status(400).json({ message: 'name, price, category and stock are required' });
    }
    const product = await Product.create(req.body);
    res.status(201).json({ product });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});


router.put('/:id', protect, requireRole('admin'), async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json({ product });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
