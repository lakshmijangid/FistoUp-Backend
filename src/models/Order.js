const mongoose = require('mongoose');

async function generateOrderNumber() {
  const count = await mongoose.model('Order').countDocuments();
  return String((count + 1) % 1000000).padStart(6, '0');
}

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true },
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: [orderItemSchema],
    totalAmount: { type: Number, required: true },
    shippingCharge: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'returned'],
      default: 'pending',
    },
    isBulkOrder: { type: Boolean, default: false },
    paymentMethod: { type: String, enum: ['cod', 'upi'], required: true },
    paymentStatus: { type: String, enum: ['pending', 'paid'], default: 'pending' },
    razorpayOrderId: { type: String },
    shippingAddress: {
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      pincode: { type: String, required: true },
    },
  },
  { timestamps: true }
);

orderSchema.pre('save', async function (next) {
  if (!this.orderNumber) {
    this.orderNumber = await generateOrderNumber();
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);
