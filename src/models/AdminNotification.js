const mongoose = require('mongoose');

const adminNotificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['new_seller', 'new_order', 'new_product', 'new_review', 'system'],
      default: 'system',
      index: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

adminNotificationSchema.index({ read: 1, createdAt: -1 });

module.exports = mongoose.model('AdminNotification', adminNotificationSchema);