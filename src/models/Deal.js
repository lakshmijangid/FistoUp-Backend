const mongoose = require('mongoose');

// A single product promotion. Admin-initiated, seller-confirmed.
//
// Lifecycle: invited (admin created) → accepted (seller set dealPrice) → live
// while in window. Can also be declined / cancelled / expired.
//
//   kind 'public'   → shown to everyone; placement decides where:
//                       'deal_of_the_day' (buyer home deal strip) or
//                       'sale' (attached to a Sale campaign).
//   kind 'targeted' → shown only to the users in targetUsers.
const dealSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    kind: { type: String, enum: ['public', 'targeted'], default: 'public' },
    placement: {
      type: String,
      enum: ['deal_of_the_day', 'sale'],
      default: 'deal_of_the_day',
    },
    sale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },
    targetUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    // Admin's target price ("reduce to at most this"); seller confirms dealPrice.
    suggestedPrice: { type: Number, min: 0 },
    dealPrice: { type: Number, min: 0 },

    startsAt: { type: Date },
    endsAt: { type: Date },

    status: {
      type: String,
      enum: ['invited', 'accepted', 'declined', 'cancelled', 'expired'],
      default: 'invited',
      index: true,
    },
  },
  { timestamps: true }
);

dealSchema.virtual('isLive').get(function () {
  if (this.status !== 'accepted') return false;
  const now = Date.now();
  if (this.startsAt && this.startsAt.getTime() > now) return false;
  if (this.endsAt && this.endsAt.getTime() < now) return false;
  return true;
});

dealSchema.set('toJSON', { virtuals: true });
dealSchema.set('toObject', { virtuals: true });

// Accepted, in-window deals visible to a given user.
//   opts.placement — filter public deals to a placement ('deal_of_the_day'|'sale')
//   userId         — include targeted deals aimed at this user (may be null)
dealSchema.statics.liveForUser = function liveForUser(userId, opts = {}) {
  const now = new Date();
  const visibility = [];
  // Public deals (optionally constrained to a placement).
  const pub = { kind: 'public' };
  if (opts.placement) pub.placement = opts.placement;
  visibility.push(pub);
  // Targeted deals aimed at this user.
  if (userId) visibility.push({ kind: 'targeted', targetUsers: userId });

  return this.find({
    status: 'accepted',
    $or: visibility,
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    ],
  });
};

module.exports = mongoose.model('Deal', dealSchema);
