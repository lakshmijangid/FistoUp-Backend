const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');


const addressSchema = new mongoose.Schema(
  {
    label: { type: String, default: 'Home', trim: true }, 
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


function identityFields() {
  return {
    phone: { type: String, required: true, unique: true },
    email: { type: String, trim: true, lowercase: true },

    emailVerified: { type: Boolean, default: false },

    isBanned: { type: Boolean, default: false },
    password: { type: String },
    addresses: { type: [addressSchema], default: [] },
    otp: { type: String },
    otpExpiry: { type: Date },
  };
}


function applyIdentity(schema) {
  schema.pre('save', async function (next) {
    if (this.isModified('password') && this.password) {
      this.password = await bcrypt.hash(this.password, 10);
    }
    next();
  });

  schema.methods.comparePassword = function (plain) {
    return bcrypt.compare(plain, this.password);
  };

  schema.set('toJSON', { virtuals: true });
}

module.exports = { addressSchema, identityFields, applyIdentity };
