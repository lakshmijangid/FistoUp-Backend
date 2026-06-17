const router = require('express').Router();
const jwt = require('jsonwebtoken');
const Product = require('../models/Product');
const Deal = require('../models/Deal');
const Sale = require('../models/Sale');
const { protect, requireRole } = require('../middleware/auth');

// Best-effort: decode the bearer token if present, else continue as a guest.
// Lets /deals include offers targeted at the signed-in buyer without forcing auth.
function optionalUser(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(header.split(' ')[1], process.env.JWT_SECRET).id;
  } catch {
    return null;
  }
}

// Shape a live deal into a product card payload for the buyer apps.
function dealToCard(deal) {
  const p = deal.product;
  if (!p) return null;
  const obj = p.toObject ? p.toObject() : p;
  return { ...obj, dealPrice: deal.dealPrice, dealEndsAt: deal.endsAt };
}

// GET /api/products/deals — live Deal-of-the-Day + offers targeted at the caller
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

// GET /api/products/sales — live sales, each with their accepted in-window products
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

    // Only return sales that actually have live products.
    res.json({ sales: result.filter((s) => s.products.length > 0) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/products/categories  — must be before /:id
router.get('/categories', async (req, res) => {
  try {
    const counts = await Product.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    const categories = counts.map((c) => ({ name: c._id, count: c.count }));
    res.json({ categories });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/products
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

// GET /api/products/search?q=&category=&pinCode=&minPrice=&maxPrice=&page=&limit=
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

// GET /api/products/:id
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

// POST /api/products  — admin only
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

// PUT /api/products/:id  — admin only
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
