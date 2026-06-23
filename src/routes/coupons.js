const router = require('express').Router();
const Coupon = require('../models/Coupon');
const { protect, requireRole } = require('../middleware/auth');


router.get('/', async (req, res) => {
  try {
    const now = new Date();
    const coupons = await Coupon.find({
      isActive: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    }).sort({ createdAt: -1 });
    res.json({ coupons });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.post('/validate', protect, async (req, res) => {
  try {
    const { code, subtotal = 0 } = req.body;
    if (!code) return res.status(400).json({ message: 'code is required' });

    const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });
    if (!coupon) return res.status(404).json({ message: 'Invalid coupon code' });
    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      return res.status(400).json({ message: 'This coupon has expired' });
    }
    if (subtotal < coupon.minOrder) {
      return res.status(400).json({ message: `Minimum order of ₹${coupon.minOrder} required` });
    }

    let discount = 0;
    if (coupon.discountType === 'percent') discount = (subtotal * coupon.discountValue) / 100;
    else if (coupon.discountType === 'flat') discount = coupon.discountValue;
   
    discount = Math.min(Math.round(discount), subtotal);

    res.json({ valid: true, coupon, discount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.post('/', protect, requireRole('admin'), async (req, res) => {
  try {
    const coupon = await Coupon.create(req.body);
    res.status(201).json({ coupon });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
