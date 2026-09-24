const mongoose = require('mongoose');

// Per-category presentation set by admins (image shown on the buyer home).
// Categories themselves are still derived from product listings; this just
// attaches an image/colour to a category name (stored lowercase for matching).
const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, lowercase: true },
    image: { type: String, default: '' },     // Cloudinary URL
    publicId: { type: String, default: '' },   // Cloudinary public id
    color: { type: String, default: '' },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Category', categorySchema);
