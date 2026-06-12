const mongoose = require('mongoose');

const producerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    village: { type: String, required: true },
    district: { type: String, default: 'Churu' },
    phone: { type: String, required: true },
    photo: { type: String },
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Producer', producerSchema);
