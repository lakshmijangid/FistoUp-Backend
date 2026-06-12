const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String },
    price: { type: Number, required: true, min: 0 },
    mrp: { type: Number, required: true, min: 0 },
    category: {
      type: String,
      required: true,
      enum: ['Superfoods', 'Grains', 'Pickles', 'Spices', 'Snacks', 'Pulses', 'Handicrafts'],
    },
    images: [{ type: String }],
    stock: { type: Number, default: 0, min: 0 },
    unit: { type: String, enum: ['kg', 'g', 'piece'], default: 'piece' },
    producerName: { type: String, required: true },
    producerVillage: { type: String, required: true },
    fromChuru: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Product', productSchema);
