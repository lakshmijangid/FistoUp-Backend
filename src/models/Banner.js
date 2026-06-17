const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    image: { type: String, required: true },       // Cloudinary URL
    publicId: { type: String },                     // Cloudinary public ID (for deletion)
    link: { type: String, default: '', trim: true }, // Optional link to redirect
    position: { type: String, enum: ['home_top', 'home_middle', 'home_bottom', 'offer'], default: 'home_top' },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    description: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Banner', bannerSchema);