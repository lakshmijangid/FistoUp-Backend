const mongoose = require('mongoose');


const dealSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },

    kind: { type: String, enum: ['public', 'targeted'], default: 'public' },
    placement: {
      type: String,
      enum: ['deal_of_the_day', 'sale'],
      default: 'deal_of_the_day',
    },
    sale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },
    targetUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

   
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


dealSchema.statics.liveForUser = function liveForUser(userId, opts = {}) {
  const now = new Date();
  const visibility = [];
 
  const pub = { kind: 'public' };
  if (opts.placement) pub.placement = opts.placement;
  visibility.push(pub);
 
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
