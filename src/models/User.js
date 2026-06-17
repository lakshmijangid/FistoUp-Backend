const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// A saved shipping address. Buyers can keep several; one is the default.
const addressSchema = new mongoose.Schema(
  {
    label: { type: String, default: 'Home', trim: true }, // Home / Work / Other
    name: { type: String, trim: true },
    phone: { type: String, trim: true },
    street: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    pincode: { type: String, required: true, trim: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, default: '', trim: true },
    phone: { type: String, required: true, unique: true },
    email: { type: String, trim: true, lowercase: true },
    password: { type: String },
    // Legacy single address — kept for back-compat. New code uses `addresses`.
    address: {
      street: String,
      city: String,
      state: String,
      pincode: String,
    },
    addresses: { type: [addressSchema], default: [] },
    role: { type: String, enum: ['buyer', 'seller', 'admin'], default: 'buyer' },
    // The seller business profile lives in the dedicated `Seller` collection
    // (1:1 with this user), not embedded here.
    otp: { type: String },
    otpExpiry: { type: Date },
    isVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (this.isModified('password') && this.password) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

// Expose the `id` virtual (hex string of _id) in JSON so the client always
// receives a consistent `id` field across /me, /update-profile and /verify-otp.
userSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('User', userSchema);
