const mongoose = require('mongoose');

// Dedicated seller business profile, linked 1:1 to a User (role 'seller').
// Keeps business/KYC data out of the lean User auth document.
const sellerSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    name: { type: String, trim: true }, // business / store name
    // Retail / Wholesale / Manufacturer / Distributor
    type: { type: String, trim: true },
    // One or more of: Food / Furniture / Fashion / Handicraft / Natural / Herbal
    category: { type: [String], default: [] },
    gstin: { type: String, trim: true },
    // Required for Food businesses (14-digit FSSAI number)
    fssaiLicense: { type: String, trim: true },
    address: { type: String, trim: true },
    phone: { type: String, trim: true },
    description: { type: String, trim: true },
    bank: {
      accountName: String,
      accountNumber: String,
      ifsc: String,
      accountType: { type: String, enum: ['savings', 'current'] },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Seller', sellerSchema);
