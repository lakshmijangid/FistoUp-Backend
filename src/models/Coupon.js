const mongoose = require('mongoose');


const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String, default: '' },
    discountType: { type: String, enum: ['percent', 'flat', 'shipping'], default: 'percent' },
    discountValue: { type: Number, default: 0, min: 0 },
    minOrder: { type: Number, default: 0, min: 0 },
    expiresAt: { type: Date },
    isActive: { type: Boolean, default: true },
    maxUses: { type: Number, default: 0, min: 0 },   
    usedCount: { type: Number, default: 0, min: 0 },

    targetUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    targetSellers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Seller' }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Coupon', couponSchema);
