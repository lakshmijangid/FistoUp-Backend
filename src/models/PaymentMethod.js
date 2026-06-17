const mongoose = require('mongoose');

// A buyer's saved payment instrument. Only non-sensitive metadata is stored
// (never full card numbers / CVV) — real charges go through Razorpay.
const paymentMethodSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['card', 'upi', 'netbanking', 'wallet'], default: 'card' },
    brand: { type: String, trim: true }, // Visa / Mastercard / Rupay / GPay …
    last4: { type: String, trim: true },
    holderName: { type: String, trim: true },
    expiry: { type: String, trim: true }, // MM/YY
    upiId: { type: String, trim: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PaymentMethod', paymentMethodSchema);
