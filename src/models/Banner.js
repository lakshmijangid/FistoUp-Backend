const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    image: { type: String, required: true },       
    publicId: { type: String },                     
    link: { type: String, default: '', trim: true }, 
    position: { type: String, enum: ['home_top', 'home_middle', 'home_bottom', 'offer', 'flash_sale'], default: 'home_top' },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    description: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Banner', bannerSchema);
