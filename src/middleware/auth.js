const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Seller = require('../models/Seller');
const Admin = require('../models/Admin');

// Each role lives in its own collection. The JWT carries the role so we know
// which collection to read; tokens issued before the split have no role and
// fall back to searching all three.
const MODEL_BY_ROLE = { buyer: User, seller: Seller, admin: Admin };

function modelForRole(role) {
  return MODEL_BY_ROLE[role] || null;
}

async function findAccount(id, role) {
  const fields = '-password -otp -otpExpiry';
  const model = modelForRole(role);
  if (model) return model.findById(id).select(fields);
  // Legacy token without a role — try each collection in turn.
  return (
    (await User.findById(id).select(fields)) ||
    (await Seller.findById(id).select(fields)) ||
    (await Admin.findById(id).select(fields))
  );
}

const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await findAccount(decoded.id, decoded.role);
    if (!req.user) return res.status(401).json({ message: 'User not found' });
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied' });
  }
  next();
};

module.exports = { protect, requireRole, modelForRole };
