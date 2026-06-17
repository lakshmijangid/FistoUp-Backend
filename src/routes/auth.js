const router = require('express').Router();
const jwt = require('jsonwebtoken');
const twilio = require('twilio');
const User = require('../models/User');
const Seller = require('../models/Seller');
const AdminNotification = require('../models/AdminNotification');
const { protect } = require('../middleware/auth');

const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);

// In-memory OTP cache: phone -> { otp, expiresAt }
const otpCache = new Map();

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });

// Shape the Seller doc into the `business` object the client expects.
function businessShape(seller) {
  if (!seller) return undefined;
  return {
    name: seller.name,
    type: seller.type,
    category: seller.category,
    gstin: seller.gstin,
    fssaiLicense: seller.fssaiLicense,
    address: seller.address,
    phone: seller.phone,
    description: seller.description,
    bank: seller.bank,
  };
}

async function getBusiness(userId) {
  return businessShape(await Seller.findOne({ user: userId }));
}

// POST /api/auth/send-otp
router.post('/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ message: 'Phone is required' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpCache.set(phone, { otp, expiresAt: Date.now() + OTP_TTL_MS });

    let delivered = false;
    try {
      await twilioClient.messages.create({
        body: `Your Fisto Up OTP is: ${otp}. Valid for 5 minutes.`,
        from: process.env.TWILIO_PHONE,
        to: phone,
      });
      delivered = true;
    } catch (smsErr) {
      // Twilio not configured / number unverified — fall back to dev mode below.
      console.warn(`OTP SMS failed (${smsErr.message}); falling back to dev mode`);
    }

    const devMode = !delivered || process.env.NODE_ENV !== 'production';
    res.json({
      success: true,
      message: delivered ? 'OTP sent' : 'OTP generated (dev mode)',
      // In dev the OTP is returned so the flow is testable without SMS.
      ...(devMode ? { devOtp: otp } : {}),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/verify-otp  { phone, otp, role?, mode? }
//   mode 'login'  (default): requires an existing account, else 404.
//   mode 'signup'          : creates the account if it doesn't exist.
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, otp, role, mode = 'login' } = req.body;
    if (!phone || !otp) return res.status(400).json({ message: 'Phone and OTP are required' });

    const cached = otpCache.get(phone);
    if (!cached || cached.otp !== otp || Date.now() > cached.expiresAt) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    otpCache.delete(phone);

    // Only buyer/seller may be self-assigned; 'admin' is never granted via signup.
    const requestedRole = role === 'seller' ? 'seller' : undefined;

    let user = await User.findOne({ phone });
    let isNew = false;
    if (!user) {
      // Login attempt for a phone with no account — tell the client to sign up.
      if (mode === 'login') {
        return res.status(404).json({
          code: 'NO_ACCOUNT',
          message: 'No account found. Please sign up.',
        });
      }
      isNew = true;
      user = await User.create({
        name: '',
        phone,
        role: requestedRole || 'buyer',
      });
    } else {
      if (requestedRole === 'seller' && user.role === 'buyer') user.role = 'seller';
      await user.save();
    }

    res.json({
      token: signToken(user._id),
      isNew,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        addresses: user.addresses,
        business: await getBusiness(user._id),
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/update-profile  — name, email and the seller business profile.
// The business profile lives in the dedicated `Seller` collection (1:1 with the
// user) and is deep-merged so a form that only touches some fields (e.g. just
// bank details) doesn't wipe the others (type, category, fssaiLicense, …).
router.post('/update-profile', protect, async (req, res) => {
  try {
    const { name, email, business } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (name !== undefined) user.name = name;
    if (email !== undefined) user.email = email;
    await user.save();

    if (business && typeof business === 'object') {
      // Upsert the seller profile and merge into it.
      let seller = await Seller.findOne({ user: user._id });
      if (!seller) seller = new Seller({ user: user._id });

      const { bank, ...rest } = business;
      for (const [key, val] of Object.entries(rest)) {
        if (val !== undefined) seller[key] = val;
      }
      if (bank && typeof bank === 'object') {
        const currentBank = seller.bank
          ? seller.bank.toObject
            ? seller.bank.toObject()
            : seller.bank
          : {};
        seller.bank = { ...currentBank, ...bank };
      }
      await seller.save();

      if (seller.name) {
        try {
          await AdminNotification.create({
            type: 'new_seller',
            title: 'New seller registered',
            message: `${seller.name} has submitted business details and is awaiting approval.`,
            metadata: { sellerId: seller._id },
          });
        } catch (e) {
          console.error('Admin notification error:', e.message);
        }
      }
    }

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        addresses: user.addresses,
        business: await getBusiness(user._id),
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/login  — password-based login for admin
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ message: 'Phone and password are required' });
    }

    const user = await User.findOne({ phone }).select('+password');
    if (!user) {
      return res.status(404).json({ message: 'No account found with this phone number' });
    }

    if (!user.password) {
      return res.status(400).json({ message: 'This account uses OTP login. Please use the OTP method.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid password' });
    }

    res.json({
      token: signToken(user._id),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        addresses: user.addresses,
        business: await getBusiness(user._id),
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/auth/me  — user + their seller business profile
router.get('/me', protect, async (req, res) => {
  res.json({
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      phone: req.user.phone,
      role: req.user.role,
      addresses: req.user.addresses,
      business: await getBusiness(req.user._id),
    },
  });
});

/* ──────────────────────── Shipping addresses ──────────────────────── */

// If the new address is flagged default, clear the flag on the others.
function applyDefault(user, addr) {
  if (addr && addr.isDefault) {
    user.addresses.forEach((a) => {
      if (a !== addr) a.isDefault = false;
    });
  }
  // Guarantee at least one default when any address exists.
  if (user.addresses.length && !user.addresses.some((a) => a.isDefault)) {
    user.addresses[0].isDefault = true;
  }
}

// GET /api/auth/addresses
router.get('/addresses', protect, async (req, res) => {
  res.json({ addresses: req.user.addresses || [] });
});

// POST /api/auth/addresses
router.post('/addresses', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { label, name, phone, street, city, state, pincode, isDefault } = req.body;
    if (!street || !city || !state || !pincode) {
      return res.status(400).json({ message: 'street, city, state and pincode are required' });
    }

    user.addresses.push({ label, name, phone, street, city, state, pincode, isDefault });
    applyDefault(user, user.addresses[user.addresses.length - 1]);
    await user.save();
    res.status(201).json({ addresses: user.addresses });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT /api/auth/addresses/:id
router.put('/addresses/:id', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const addr = user.addresses.id(req.params.id);
    if (!addr) return res.status(404).json({ message: 'Address not found' });

    const fields = ['label', 'name', 'phone', 'street', 'city', 'state', 'pincode', 'isDefault'];
    for (const f of fields) if (req.body[f] !== undefined) addr[f] = req.body[f];
    applyDefault(user, addr);
    await user.save();
    res.json({ addresses: user.addresses });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE /api/auth/addresses/:id
router.delete('/addresses/:id', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const addr = user.addresses.id(req.params.id);
    if (!addr) return res.status(404).json({ message: 'Address not found' });
    addr.deleteOne();
    applyDefault(user, null);
    await user.save();
    res.json({ addresses: user.addresses });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
