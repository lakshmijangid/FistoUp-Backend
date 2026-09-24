const mongoose = require('mongoose');
const { identityFields, applyIdentity } = require('./identity');


const sellerSchema = new mongoose.Schema(
  {

    ownerName: { type: String, default: '', trim: true },
    name: { type: String, trim: true },
   
    type: { type: String, trim: true },
   
    category: { type: [String], default: [] },
    gstin: { type: String, trim: true },
    
    fssaiLicense: { type: String, trim: true },
    address: { type: String, trim: true }, 
    description: { type: String, trim: true },
    bank: {
      accountName: String,
      accountNumber: String,
      ifsc: String,
      bankName: String,
      accountType: { type: String, enum: ['savings', 'current'] },
    },
    ...identityFields(),

    isVerified: { type: Boolean, default: false },
    role: { type: String, enum: ['seller'], default: 'seller' },
  },
  { timestamps: true }
);

applyIdentity(sellerSchema);

module.exports = mongoose.model('Seller', sellerSchema);
