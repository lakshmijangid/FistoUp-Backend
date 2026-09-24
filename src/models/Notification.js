const mongoose = require('mongoose');


const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: ['order', 'payment', 'offer', 'info'],
      default: 'info',
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
    audience: {
      type: String,
      enum: ['all_users', 'all_sellers', 'specific_users', 'specific_sellers'],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', notificationSchema);
