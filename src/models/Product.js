const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    // The seller who owns this listing (lives in the `sellers` collection).
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', index: true },
    name: { type: String, required: true, trim: true },
    sku: { type: String, trim: true, index: true },
    description: { type: String },
    price: { type: Number, required: true, min: 0 },
    mrp: { type: Number, min: 0 },
    // Free-form so both the rural marketplace categories and the seller-app
    // categories (Electronics, Sports, Audio, …) are accepted.
    category: { type: String, required: true, trim: true },
    images: [{ type: String }],
    // Optional seller-defined sizes (free-form names, any count). Empty = the
    // product has no sizes.
    sizes: { type: [String], default: [] },
    stock: { type: Number, default: 0, min: 0 },
    // Target / max capacity — used by the seller inventory bar (units / maxUnits).
    maxStock: { type: Number, default: 0, min: 0 },
    unit: { type: String, default: 'piece' },
    // Optional bulk (B2B) pricing — referenced by the bulk routes.
    bulkPrice: { type: Number, min: 0 },
    bulkMinQty: { type: Number, min: 1 },
    producerName: { type: String },
    producerVillage: { type: String },
    location: { type: String },
    pinCode: { type: String },
    address: { type: String },
    reviews: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        name: { type: String }, // denormalised reviewer name for display
        rating: { type: Number, min: 1, max: 5 },
        comment: { type: String },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Derived stock status for the seller inventory UI.
productSchema.virtual('stockStatus').get(function () {
  if (this.stock <= 0) return 'OUT_OF_STOCK';
  const threshold = Math.max(5, Math.round((this.maxStock || 0) * 0.2));
  if (this.stock <= threshold) return 'LOW_STOCK';
  return 'IN_STOCK';
});

productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Product', productSchema);
