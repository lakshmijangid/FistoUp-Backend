const router = require('express').Router();
const jwt = require('jsonwebtoken');
const twilio = require('twilio');
const User = require('../models/User');
const Admin = require('../models/Admin');
const AdminNotification = require('../models/AdminNotification');
const { sendVerificationEmail } = require('../config/resend');
const { normalizePhone } = require('../utils/phone');
const { protect, modelForRole } = require('../middleware/auth');

const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);


const otpCache = new Map();

const OTP_TTL_MS = 5 * 60 * 1000;


const emailOtpCache = new Map();

const EMAIL_OTP_TTL_MS = 10 * 60 * 1000; 

const signToken = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '7d' });


function businessShape(account) {
  if (!account || account.role !== 'seller') return undefined;
  return {
    name: account.name, 
    type: account.type,
    category: account.category,
    gstin: account.gstin,
    fssaiLicense: account.fssaiLicense,
    address: account.address,
    phone: account.phone,
    description: account.description,
    bank: account.bank,
  };
}


function accountShape(account) {
  return {
    id: account._id,
    name: account.role === 'seller' ? account.ownerName : account.name,
    email: account.email,
    emailVerified: account.emailVerified,
    phone: account.phone,
    role: account.role,

    isVerified: account.isVerified,
    addresses: account.addresses,
    business: businessShape(account),
  };
}


router.post('/send-otp', async (req, res) => {
  try {
    const { role, mode = 'login' } = req.body;
    const phone = normalizePhone(req.body.phone);
    if (!phone) return res.status(400).json({ message: 'Phone is required' });

    const resolvedRole = role === 'seller' ? 'seller' : 'buyer';
    const Model = modelForRole(resolvedRole);

    if (mode === 'login') {
      const account = await Model.findOne({ phone });
      if (!account) {
        return res.status(404).json({ code: 'NO_ACCOUNT', message: 'No account found. Please sign up.' });
      }
     
      if (account.isBanned) {
        return res.status(403).json({
          code: 'BANNED',
          message: 'This account has been banned. Please contact support.',
        });
      }
     
      if (resolvedRole === 'seller' && !account.isVerified) {
        return res.status(403).json({
          code: 'PENDING_APPROVAL',
          message: 'Your account is pending admin approval. Please try again later.',
        });
      }
    } else if (mode === 'signup') {
      const existing = await Model.findOne({ phone });
      if (existing) {
        return res.status(409).json({ code: 'ACCOUNT_EXISTS', message: 'An account already exists. Please log in.' });
      }
    }

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
      
      console.warn(`OTP SMS failed (${smsErr.message}); falling back to dev mode`);
    }


    const devMode = !delivered || process.env.NODE_ENV !== 'production';
    res.json({
      success: true,
      message: delivered ? 'OTP sent' : 'OTP generated (dev mode)',
      ...(devMode ? { devOtp: otp } : {}),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.post('/verify-otp', async (req, res) => {
  try {
    const { otp, role, mode = 'login' } = req.body;
    const phone = normalizePhone(req.body.phone);
    if (!phone || !otp) return res.status(400).json({ message: 'Phone and OTP are required' });

    const cached = otpCache.get(phone);
    if (!cached || cached.otp !== otp || Date.now() > cached.expiresAt) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    otpCache.delete(phone);


    const resolvedRole = role === 'seller' ? 'seller' : 'buyer';
    const Model = modelForRole(resolvedRole);

    let account = await Model.findOne({ phone });
    let isNew = false;
    if (!account) {

      if (mode === 'login') {
        return res.status(404).json({
          code: 'NO_ACCOUNT',
          message: 'No account found. Please sign up.',
        });
      }
      isNew = true;
      account = await Model.create(
        resolvedRole === 'seller' ? { phone, ownerName: '' } : { phone, name: '' }
      );
    }

    res.json({
      token: signToken(account._id, account.role),
      isNew,
      user: accountShape(account),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.post('/update-profile', protect, async (req, res) => {
  try {
    const { name, email, business } = req.body;
    const Model = modelForRole(req.user.role);
    const account = await Model.findById(req.user._id);
    if (!account) return res.status(404).json({ message: 'Account not found' });

    if (email !== undefined) {
      
      if (account.email !== email) account.emailVerified = false;
      account.email = email;
    }
    if (name !== undefined) {

      if (account.role === 'seller') account.ownerName = name;
      else account.name = name;
    }


    if (account.role === 'seller' && business && typeof business === 'object') {
      const { bank, ...rest } = business;
      for (const [key, val] of Object.entries(rest)) {
        if (val !== undefined) account[key] = val;
      }
      if (bank && typeof bank === 'object') {
        const currentBank = account.bank
          ? account.bank.toObject
            ? account.bank.toObject()
            : account.bank
          : {};
        account.bank = { ...currentBank, ...bank };
      }
    }

    await account.save();

    if (account.role === 'seller' && business && account.name) {
      try {
        await AdminNotification.create({
          type: 'new_seller',
          title: 'New seller registered',
          message: `${account.name} has submitted business details and is awaiting approval.`,
          metadata: { sellerId: account._id },
        });
      } catch (e) {
        console.error('Admin notification error:', e.message);
      }
    }

    res.json({ user: accountShape(account) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;
    const phone = normalizePhone(req.body.phone);
    if (!phone || !password) {
      return res.status(400).json({ message: 'Phone and password are required' });
    }

    const account = await Admin.findOne({ phone }).select('+password');
    if (!account) {
      return res.status(404).json({ message: 'No account found with this phone number' });
    }

    if (!account.password) {
      return res.status(400).json({ message: 'This account uses OTP login. Please use the OTP method.' });
    }

    const isMatch = await account.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid password' });
    }

    res.json({
      token: signToken(account._id, account.role),
      user: accountShape(account),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.get('/me', protect, async (req, res) => {
  res.json({ user: accountShape(req.user) });
});


router.post('/send-email-otp', protect, async (req, res) => {
  try {
    const email = String(req.body.email || req.user.email || '').trim();
    if (!email) return res.status(400).json({ message: 'No email address to verify. Add one first.' });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    emailOtpCache.set(String(req.user._id), { code, email, expiresAt: Date.now() + EMAIL_OTP_TTL_MS });

    let delivered = false;
    try {
      const result = await sendVerificationEmail(email, code);
      if (result && result.error) throw new Error(result.error.message || 'Email provider error');
      delivered = true;
    } catch (mailErr) {
      console.warn(`Email code send failed (${mailErr.message})`);
    }


    const isProd = process.env.NODE_ENV === 'production';
    if (isProd && !delivered) {
      return res.status(502).json({ message: 'Could not send the verification email right now. Please try again.' });
    }

    res.json({
      success: true,
      message: delivered ? 'Verification code sent' : 'Code generated (dev mode)',
      ...(isProd ? {} : { devCode: code }),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.post('/verify-email', protect, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: 'Code is required' });

    const cached = emailOtpCache.get(String(req.user._id));
    if (!cached || cached.code !== code || Date.now() > cached.expiresAt) {
      return res.status(400).json({ message: 'Invalid or expired code' });
    }
    emailOtpCache.delete(String(req.user._id));

    const Model = modelForRole(req.user.role);
    const account = await Model.findById(req.user._id);
    if (!account) return res.status(404).json({ message: 'Account not found' });


    if (cached.email) account.email = cached.email;
    account.emailVerified = true;
    await account.save();

    res.json({ user: accountShape(account) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


function applyDefault(user, addr) {
  if (addr && addr.isDefault) {
    user.addresses.forEach((a) => {
      if (a !== addr) a.isDefault = false;
    });
  }

  if (user.addresses.length && !user.addresses.some((a) => a.isDefault)) {
    user.addresses[0].isDefault = true;
  }
}


router.get('/addresses', protect, async (req, res) => {
  res.json({ addresses: req.user.addresses || [] });
});


router.post('/addresses', protect, async (req, res) => {
  try {
    const user = await modelForRole(req.user.role).findById(req.user._id);
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


router.put('/addresses/:id', protect, async (req, res) => {
  try {
    const user = await modelForRole(req.user.role).findById(req.user._id);
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


router.delete('/addresses/:id', protect, async (req, res) => {
  try {
    const user = await modelForRole(req.user.role).findById(req.user._id);
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
