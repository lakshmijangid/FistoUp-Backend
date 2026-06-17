const mongoose = require('mongoose');

// A discount coupon. `percent` coupons take discountValue as a %, `flat`
// coupons as a rupee amount, `shipping` waives delivery.
const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String, default: '' },
    discountType: { type: String, enum: ['percent', 'flat', 'shipping'], default: 'percent' },
    discountValue: { type: Number, default: 0, min: 0 },
    minOrder: { type: Number, default: 0, min: 0 },
    expiresAt: { type: Date },
    isActive: { type: Boolean, default: true },
    maxUses: { type: Number, default: 0, min: 0 },   // 0 = unlimited
    usedCount: { type: Number, default: 0, min: 0 },
    // Empty arrays = public coupon for everyone
    // Non-empty = targeted at specific users/sellers only
    targetUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    targetSellers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Coupon', couponSchema);