const router = require('express').Router();
const crypto = require('crypto');
const Razorpay = require('razorpay');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Deal = require('../models/Deal');
const AdminNotification = require('../models/AdminNotification');
const { protect } = require('../middleware/auth');

// The price to charge for a product: an active deal price visible to this buyer,
// else the catalogue price.
async function effectivePrice(product, buyerId) {
  const now = new Date();
  const deal = await Deal.findOne({
    product: product._id,
    status: 'accepted',
    $or: [{ kind: 'public' }, { kind: 'targeted', targetUsers: buyerId }],
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    ],
  });
  if (deal && deal.dealPrice != null && deal.dealPrice < product.price) {
    return deal.dealPrice;
  }
  return product.price;
}

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const SHIPPING_THRESHOLD = 500;
const SHIPPING_FEE = 50;
const TAX_RATE = 0.05;

router.post('/create', protect, async (req, res) => {
  try {
    const { items, shippingAddress, paymentMethod } = req.body;

    if (!items?.length) return res.status(400).json({ message: 'items are required' });
    if (!shippingAddress) return res.status(400).json({ message: 'shippingAddress is required' });
    if (!['cod', 'upi'].includes(paymentMethod)) {
      return res.status(400).json({ message: 'paymentMethod must be cod or upi' });
    }

    let subtotal = 0;
    const resolvedItems = [];

    for (const item of items) {
      const product = await Product.findById(item.product);
      if (!product || !product.isActive) {
        return res.status(400).json({ message: `Product ${item.product} is not available` });
      }
      if (product.stock < item.quantity) {
        return res.status(400).json({ message: `Insufficient stock for ${product.name}` });
      }
      const price = await effectivePrice(product, req.user._id);
      subtotal += price * item.quantity;
      resolvedItems.push({ product: item.product, quantity: item.quantity, price });
    }

    const tax = parseFloat((subtotal * TAX_RATE).toFixed(2));
    const shippingCharge = subtotal >= SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
    const totalAmount = parseFloat((subtotal + tax + shippingCharge).toFixed(2));

    for (const item of resolvedItems) {
      await Product.findByIdAndUpdate(item.product, { $inc: { stock: -item.quantity } });
    }

    const order = await Order.create({
      buyer: req.user._id,
      items: resolvedItems,
      totalAmount,
      shippingCharge,
      tax,
      paymentMethod,
      shippingAddress,
      status: paymentMethod === 'cod' ? 'confirmed' : 'pending',
    });

    try {
      await AdminNotification.create({
        type: 'new_order',
        title: 'New order placed',
        message: `Order ${order.orderNumber} — ${resolvedItems.length} item(s) for ₹${totalAmount}`,
        metadata: { orderId: order._id, orderNumber: order.orderNumber },
      });
    } catch (e) {
      console.error('Admin notification error:', e.message);
    }

    if (paymentMethod === 'upi') {
      const razorpayOrder = await razorpay.orders.create({
        amount: Math.round(totalAmount * 100),
        currency: 'INR',
        receipt: order.orderNumber,
      });

      order.razorpayOrderId = razorpayOrder.id;
      await order.save();

      return res.status(201).json({ order, razorpayOrder });
    }

    res.status(201).json({ order });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/verify-payment', protect, async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, orderId } = req.body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature || !orderId) {
      return res.status(400).json({ message: 'razorpayOrderId, razorpayPaymentId, razorpaySignature and orderId are required' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (expectedSignature !== razorpaySignature) {
      return res.status(400).json({ message: 'Payment verification failed' });
    }

    const order = await Order.findByIdAndUpdate(
      orderId,
      { paymentStatus: 'paid', status: 'confirmed' },
      { new: true }
    );
    if (!order) return res.status(404).json({ message: 'Order not found' });

    res.json({ success: true, orderNumber: order.orderNumber });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/my-orders', protect, async (req, res) => {
  try {
    const orders = await Order.find({ buyer: req.user._id })
      .populate('items.product', 'name images price unit producerName')
      .sort({ createdAt: -1 });
    res.json({ orders });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:orderNumber', protect, async (req, res) => {
  try {
    const order = await Order.findOne({ orderNumber: req.params.orderNumber }).populate(
      'items.product',
      'name images price unit producerName producerVillage'
    );
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (order.buyer.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({ order });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;