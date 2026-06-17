const mongoose = require('mongoose');

// A time-boxed sale campaign/event (e.g. "Summer Sale"). Products are attached
// to a sale via Deal documents with placement 'sale'.
const saleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    banner: { type: String }, // image url
    startsAt: { type: Date },
    endsAt: { type: Date },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// "Live" = active and within the (optional) window.
saleSchema.virtual('isLive').get(function () {
  if (!this.isActive) return false;
  const now = Date.now();
  if (this.startsAt && this.startsAt.getTime() > now) return false;
  if (this.endsAt && this.endsAt.getTime() < now) return false;
  return true;
});

saleSchema.set('toJSON', { virtuals: true });
saleSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Sale', saleSchema);
