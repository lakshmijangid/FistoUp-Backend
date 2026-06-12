const router = require('express').Router();
const jwt = require('jsonwebtoken');
const twilio = require('twilio');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);

// In-memory OTP cache: phone -> { otp, expiresAt }
const otpCache = new Map();

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });

// POST /api/auth/send-otp
router.post('/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ message: 'Phone is required' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpCache.set(phone, { otp, expiresAt: Date.now() + OTP_TTL_MS });

    await twilioClient.messages.create({
      body: `Your Fisto Up OTP is: ${otp}. Valid for 5 minutes.`,
      from: process.env.TWILIO_PHONE,
      to: phone,
    });

    res.json({ success: true, message: 'OTP sent' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/verify-otp
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ message: 'Phone and OTP are required' });

    const cached = otpCache.get(phone);
    if (!cached || cached.otp !== otp || Date.now() > cached.expiresAt) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    otpCache.delete(phone);

    let user = await User.findOne({ phone });
    if (!user) {
      user = await User.create({ name: '', phone, isVerified: true });
    } else {
      user.isVerified = true;
      await user.save();
    }

    res.json({
      token: signToken(user._id),
      user: { name: user.name, phone: user.phone, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/update-profile
router.post('/update-profile', protect, async (req, res) => {
  try {
    const { name, email } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email;

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true }).select(
      '-password -otp -otpExpiry'
    );

    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/auth/me
router.get('/me', protect, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
