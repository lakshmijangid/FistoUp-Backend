const router = require('express').Router();
const PaymentMethod = require('../models/PaymentMethod');
const { protect } = require('../middleware/auth');


async function applyDefault(userId, makeDefaultId) {
  if (makeDefaultId) {
    await PaymentMethod.updateMany({ user: userId }, { isDefault: false });
    await PaymentMethod.findByIdAndUpdate(makeDefaultId, { isDefault: true });
  } else {
    const any = await PaymentMethod.findOne({ user: userId, isDefault: true });
    if (!any) {
      const first = await PaymentMethod.findOne({ user: userId }).sort({ createdAt: 1 });
      if (first) {
        first.isDefault = true;
        await first.save();
      }
    }
  }
}


router.get('/', protect, async (req, res) => {
  try {
    const methods = await PaymentMethod.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json({ methods });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.post('/', protect, async (req, res) => {
  try {
    const { type, brand, last4, holderName, expiry, upiId, isDefault } = req.body;
    const method = await PaymentMethod.create({
      user: req.user._id,
      type,
      brand,
      last4,
      holderName,
      expiry,
      upiId,
      isDefault,
    });
    if (isDefault) await applyDefault(req.user._id, method._id);
    else await applyDefault(req.user._id, null);
    res.status(201).json({ method });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});


router.patch('/:id/default', protect, async (req, res) => {
  try {
    const method = await PaymentMethod.findOne({ _id: req.params.id, user: req.user._id });
    if (!method) return res.status(404).json({ message: 'Payment method not found' });
    await applyDefault(req.user._id, method._id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});


router.delete('/:id', protect, async (req, res) => {
  try {
    const method = await PaymentMethod.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!method) return res.status(404).json({ message: 'Payment method not found' });
    await applyDefault(req.user._id, null);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
