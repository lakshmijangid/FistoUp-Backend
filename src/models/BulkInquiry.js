const mongoose = require('mongoose');

const bulkInquirySchema = new mongoose.Schema(
  {
    businessName: { type: String, required: true, trim: true },
    contactPerson: { type: String, required: true, trim: true },
    phone: { type: String, required: true },
    productNeeded: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    city: { type: String, required: true, trim: true },
    message: { type: String },
    status: {
      type: String,
      enum: ['new', 'contacted', 'converted'],
      default: 'new',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('BulkInquiry', bulkInquirySchema);
