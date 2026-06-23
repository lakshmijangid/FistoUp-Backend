const mongoose = require('mongoose');
const { identityFields, applyIdentity } = require('./identity');

// Buyers only. Sellers live in the `sellers` collection and admins in `admins`
// — each role is kept in its own collection (see ./identity.js).
const userSchema = new mongoose.Schema(
  {
    name: { type: String, default: '', trim: true },
    // Legacy single address — kept for back-compat. New code uses `addresses`.
    address: {
      street: String,
      city: String,
      state: String,
      pincode: String,
    },
    ...identityFields(),
    role: { type: String, enum: ['buyer'], default: 'buyer' },
  },
  { timestamps: true }
);

applyIdentity(userSchema);

module.exports = mongoose.model('User', userSchema);
