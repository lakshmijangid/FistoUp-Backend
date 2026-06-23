const router = require('express').Router();
const mongoose = require('mongoose');
const Order = require('../models/Order');
const User = require('../models/User');
const Seller = require('../models/Seller');
const Admin = require('../models/Admin');
const Product = require('../models/Product');
const Banner = require('../models/Banner');
const Coupon = require('../models/Coupon');
const Notification = require('../models/Notification');
const AdminNotification = require('../models/AdminNotification');
const Sale = require('../models/Sale');
const Deal = require('../models/Deal');
const cloudinary = require('../config/cloudinary');
const { protect, requireRole } = require('../middleware/auth');

const adminOnly = [protect, requireRole('admin')];

async function notifyAdmin(type, title, message, metadata = {}) {
  try {
    await AdminNotification.create({ type, title, message, metadata });
  } catch (err) {
    console.error('Admin notification error:', err.message);
  }
}


function sellerView(seller) {
  const o = seller.toObject ? seller.toObject() : seller;
  return {
    ...o,
    user: {
      _id: o._id,
      id: o._id,
      name: o.ownerName || o.name,
      phone: o.phone,
      email: o.email,
      isVerified: o.isVerified,
      createdAt: o.createdAt,
    },
  };
}


function accountRow(doc) {
  return {
    id: doc._id,
    name: doc.role === 'seller' ? doc.ownerName || doc.name : doc.name,
    phone: doc.phone,
    email: doc.email,
    role: doc.role,
    isVerified: doc.isVerified, 
    isBanned: !!doc.isBanned,
    createdAt: doc.createdAt,
    sellerProfile: doc.role === 'seller' ? doc : null,
  };
}


async function findAccountById(id) {
  return (
    (await User.findById(id)) ||
    (await Seller.findById(id)) ||
    (await Admin.findById(id))
  );
}


router.get('/dashboard', adminOnly, async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      orders,
      todayOrders,
      users,
      sellers,
      products,
      todayUsers,
    ] = await Promise.all([
      Order.find({ createdAt: { $gte: sevenDaysAgo } }).sort({ createdAt: -1 }),
      Order.find({ createdAt: { $gte: todayStart, $lt: todayEnd } }),
      User.find().sort({ createdAt: -1 }), // buyers
      Seller.find(),
      Product.find({ isActive: true }).select('name price category stock images owner'),
      User.countDocuments({ createdAt: { $gte: todayStart, $lt: todayEnd } }),
    ]);

 
    let totalRevenue = 0;
    let todayRevenue = 0;
    const revenueByDay = {};
    const yesterdayRevenue = { total: 0 };

    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);

    for (const order of orders) {
      const day = order.createdAt.toISOString().slice(0, 10);
      revenueByDay[day] = (revenueByDay[day] || 0) + order.totalAmount;

      if (order.createdAt >= todayStart && order.createdAt < todayEnd) {
        todayRevenue += order.totalAmount;
      }
      if (order.createdAt >= yesterdayStart && order.createdAt < todayStart) {
        yesterdayRevenue.total += order.totalAmount;
      }
    }

   
    const allOrders = await Order.aggregate([
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]);
    totalRevenue = allOrders[0]?.total || 0;


    const totalSellers = await Seller.countDocuments();
    const activeSellers = await Seller.countDocuments({
      updatedAt: { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
    });

    
    const COMMISSION_RATE = 0.15;
    let platformCommission = 0;
    let todayCommission = 0;

    for (const order of orders) {
      const commission = order.totalAmount * COMMISSION_RATE;
      platformCommission += commission;
      if (order.createdAt >= todayStart && order.createdAt < todayEnd) {
        todayCommission += commission;
      }
    }

   
    const trend = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      trend.push({
        date: key,
        revenue: revenueByDay[key] || 0,
      });
    }

    
    const sellerRevenueMap = {};
    for (const order of orders) {
      for (const item of order.items) {
        const product = await Product.findById(item.product).select('owner name');
        if (product && product.owner) {
          const ownerId = product.owner.toString();
          sellerRevenueMap[ownerId] = (sellerRevenueMap[ownerId] || 0) + item.price * item.quantity;
        }
      }
    }

    const topSellers = await Promise.all(
      Object.entries(sellerRevenueMap)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(async ([sellerId, revenue]) => {
          const seller = await Seller.findById(sellerId).select('name ownerName phone');
          return {
            id: sellerId,
            name: seller?.name || seller?.ownerName || 'Unknown',
            phone: seller?.phone || '',
            revenue: Math.round(revenue),
          };
        })
    );

 
    const recentOrders = await Order.find()
      .populate('buyer', 'name phone')
      .sort({ createdAt: -1 })
      .limit(10);


    const todayOrderCount = todayOrders.length;


    const newCustomersToday = todayUsers;

    res.json({
      stats: {
        totalRevenue: Math.round(totalRevenue),
        todayRevenue: Math.round(todayRevenue),
        yesterdayRevenue: Math.round(yesterdayRevenue.total),
        todayOrderCount,
        totalSellers,
        activeSellers,
        newCustomersToday,
        totalProducts: products.length,
        platformCommission: Math.round(platformCommission),
        todayCommission: Math.round(todayCommission),
        commissionRate: COMMISSION_RATE * 100,
      },
      trend,
      topSellers,
      recentOrders: recentOrders.map((o) => ({
        id: o._id,
        orderNumber: o.orderNumber,
        buyer: o.buyer ? { id: o.buyer._id, name: o.buyer.name, phone: o.buyer.phone } : null,
        totalAmount: o.totalAmount,
        status: o.status,
        paymentStatus: o.paymentStatus,
        paymentMethod: o.paymentMethod,
        createdAt: o.createdAt,
        itemsCount: o.items.length,
      })),
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.status(500).json({ message: err.message });
  }
});


router.get('/users', adminOnly, async (req, res) => {
  try {
    const { role, page = 1, limit = 50, search } = req.query;


    let models;
    if (role === 'seller') models = [Seller];
    else if (role === 'admin') models = [Admin];
    else if (role === 'buyer') models = [User];
    else if (req.query.excludeAdmins === 'true') models = [User, Seller];
    else models = [User, Seller, Admin];

    const query = {};
    if (search) {
     
      const esc = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(esc, 'i');
  
      query.$or = [{ name: re }, { phone: re }, { email: re }, { ownerName: re }];
      
      if (mongoose.isValidObjectId(search)) query.$or.push({ _id: search });
    }


    const groups = await Promise.all(
      models.map((M) => {
        const q = M === Seller ? { ...query, isVerified: true } : query;
        return M.find(q).select('-password -otp -otpExpiry');
      })
    );
    const merged = groups
      .flat()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const total = merged.length;
    const skip = (Number(page) - 1) * Number(limit);
    const pageItems = merged.slice(skip, skip + Number(limit)).map(accountRow);

    res.json({ users: pageItems, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.patch('/users/:id/toggle-ban', adminOnly, async (req, res) => {
  try {
    const account = await findAccountById(req.params.id);
    if (!account) return res.status(404).json({ message: 'User not found' });

    account.isBanned = !account.isBanned;
    await account.save();

    res.json({ user: { id: account._id, isBanned: account.isBanned } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.get('/products/categories', adminOnly, async (req, res) => {
  try {
    const categories = await Product.distinct('category');
    res.json({ categories });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.get('/products', adminOnly, async (req, res) => {
  try {
    const { category, page = 1, limit = 50 } = req.query;
    const query = {};
    if (category) query.category = category;

    const skip = (Number(page) - 1) * Number(limit);
    const [products, total] = await Promise.all([
      Product.find(query)
        .populate('owner', 'name phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Product.countDocuments(query),
    ]);

    res.json({ products, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.delete('/products/:id', adminOnly, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    await notifyAdmin('system', 'Product deleted', `"${product.name}" has been removed from the marketplace.`, { productId: product._id });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.get('/sellers/pending', adminOnly, async (req, res) => {
  try {
    const sellers = await Seller.find().sort({ createdAt: -1 });


    const pending = sellers.filter((s) => !s.isVerified).map(sellerView);
    const approved = sellers.filter((s) => s.isVerified).map(sellerView);

    res.json({ pending, approved, total: sellers.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.get('/sellers/payouts', adminOnly, async (req, res) => {
  try {
    const sellers = await Seller.find().sort({ createdAt: -1 });

    const payoutData = await Promise.all(
      sellers.map(async (seller) => {
        const products = await Product.find({ owner: seller._id }).distinct('_id');
        const orders = await Order.find({ 'items.product': { $in: products } });

        let totalEarnings = 0;
        let pendingPayout = 0;

        for (const order of orders) {
          for (const item of order.items) {
            if (products.some((p) => p.toString() === (item.product?._id || item.product)?.toString())) {
              const lineTotal = item.price * item.quantity;
              totalEarnings += lineTotal;
              if (order.paymentStatus === 'paid') {
                pendingPayout += lineTotal;
              }
            }
          }
        }

        return {
          id: seller._id,
          userId: seller._id,
          storeName: seller.name || seller.ownerName || 'Unknown',
          phone: seller.phone || '',
          bankAccount: seller.bank?.accountNumber ? `xxxx${seller.bank.accountNumber.slice(-4)}` : null,
          ifsc: seller.bank?.ifsc || null,
          totalEarnings: Math.round(totalEarnings),
          pendingPayout: Math.round(pendingPayout),
          paidPayout: Math.round(totalEarnings - pendingPayout),
          orderCount: orders.length,
        };
      })
    );

    res.json({ sellers: payoutData });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.get('/banners', adminOnly, async (req, res) => {
  try {
    const banners = await Banner.find().sort({ order: 1, createdAt: -1 });
    res.json({ banners });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.post('/banners', adminOnly, async (req, res) => {
  try {
    const { title, image, publicId, link, position, description, order } = req.body;
    if (!title || !image) {
      return res.status(400).json({ message: 'title and image are required' });
    }
    const banner = await Banner.create({ title, image, publicId, link, position, description, order });
    res.status(201).json({ banner });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});


router.put('/banners/:id', adminOnly, async (req, res) => {
  try {
    const banner = await Banner.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!banner) return res.status(404).json({ message: 'Banner not found' });
    res.json({ banner });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});


router.delete('/banners/:id', adminOnly, async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);
    if (!banner) return res.status(404).json({ message: 'Banner not found' });

    if (banner.publicId) {
      await cloudinary.uploader.destroy(banner.publicId).catch(() => {});
    }

    await banner.deleteOne();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.post('/banners/upload', adminOnly, async (req, res) => {
  try {
    const { image } = req.body;
    if (!image || typeof image !== 'string') {
      return res.status(400).json({ message: 'image (data URL) is required' });
    }
    const result = await cloudinary.uploader.upload(image, { folder: 'fisto/banners' });
    res.status(201).json({ url: result.secure_url, publicId: result.public_id });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Upload failed' });
  }
});


router.get('/coupons', adminOnly, async (req, res) => {
  try {
    const coupons = await Coupon.find()
      .populate('createdBy', 'name phone')
      .sort({ createdAt: -1 });
    res.json({ coupons });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.post('/coupons', adminOnly, async (req, res) => {
  try {
    const { code, description, discountType, discountValue, minOrder, expiresAt, maxUses, targetUsers, targetSellers } = req.body;
    if (!code || discountValue == null) {
      return res.status(400).json({ message: 'code and discountValue are required' });
    }
    const coupon = await Coupon.create({
      code: code.toUpperCase().trim(),
      description,
      discountType: discountType || 'percent',
      discountValue,
      minOrder: minOrder || 0,
      expiresAt: expiresAt || null,
      maxUses: maxUses || 0,
      targetUsers: Array.isArray(targetUsers) ? targetUsers : [],
      targetSellers: Array.isArray(targetSellers) ? targetSellers : [],
      createdBy: req.user._id,
    });
    res.status(201).json({ coupon });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});


router.put('/coupons/:id', adminOnly, async (req, res) => {
  try {
    const { targetUsers, targetSellers, ...rest } = req.body;
    const update = { ...rest };
    if (Array.isArray(targetUsers)) update.targetUsers = targetUsers;
    if (Array.isArray(targetSellers)) update.targetSellers = targetSellers;
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
    res.json({ coupon });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});


router.patch('/coupons/:id/toggle', adminOnly, async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
    coupon.isActive = !coupon.isActive;
    await coupon.save();
    res.json({ coupon });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});


router.delete('/coupons/:id', adminOnly, async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.post('/notifications/bulk', adminOnly, async (req, res) => {
  try {
    const { title, message, type, audience, targetUserIds, targetSellerIds } = req.body;
    if (!title || !message || !audience) {
      return res.status(400).json({ message: 'title, message, and audience are required' });
    }

    let recipients = [];
    if (audience === 'all_users') {
      recipients = (await User.find().select('_id')).map((u) => u._id);
    } else if (audience === 'all_sellers') {
      recipients = (await Seller.find().select('_id')).map((s) => s._id);
    } else if (audience === 'specific_users' && targetUserIds && Array.isArray(targetUserIds) && targetUserIds.length > 0) {
      recipients = targetUserIds;
    } else if (audience === 'specific_sellers' && targetSellerIds && Array.isArray(targetSellerIds) && targetSellerIds.length > 0) {
      const sellerDocs = await Seller.find({ _id: { $in: targetSellerIds } }).select('_id');
      recipients = sellerDocs.map((s) => s._id);
    } else {
      return res.status(400).json({ message: 'Invalid audience selection or no specific recipients provided' });
    }

    const notifications = recipients.map((userId) => ({
      user: userId,
      type: type || 'offer',
      title,
      message,
      read: false,
    }));

    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }

    res.status(201).json({
      success: true,
      message: `Notification sent to ${recipients.length} recipients`,
      recipientCount: recipients.length,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.get('/notifications/history', adminOnly, async (req, res) => {
  try {
    const history = await Notification.aggregate([
      { $group: { _id: { title: '$title', message: '$message', type: '$type' }, count: { $sum: 1 }, createdAt: { $first: '$createdAt' } } },
      { $sort: { createdAt: -1 } },
      { $limit: 50 },
    ]);
    res.json({ history: history.map((h) => ({ ...h._id, count: h.count, createdAt: h.createdAt })) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});




router.get('/admin-notifications', adminOnly, async (req, res) => {
  try {
    const notifications = await AdminNotification.find({ read: false })
      .sort({ createdAt: -1 })
      .limit(20);
    const unreadCount = await AdminNotification.countDocuments({ read: false });
    res.json({ notifications, unreadCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/admin-notifications/:id/read', adminOnly, async (req, res) => {
  try {
    const notif = await AdminNotification.findByIdAndUpdate(req.params.id, { read: true }, { new: true });
    if (!notif) return res.status(404).json({ message: 'Notification not found' });
    const unreadCount = await AdminNotification.countDocuments({ read: false });
    res.json({ success: true, unreadCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.get('/sellers', adminOnly, async (req, res) => {
  try {
    const sellers = await Seller.find().sort({ createdAt: -1 });
    res.json({ sellers: sellers.map(sellerView) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.patch('/sellers/:id/approve', adminOnly, async (req, res) => {
  try {
    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    seller.isVerified = true;
    await seller.save();

    await notifyAdmin('new_seller', 'Seller approved', `${seller.name || seller.ownerName || 'a seller'} has been approved.`, { sellerId: seller._id });

    res.json({ success: true, seller: sellerView(seller) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.patch('/sellers/:id/reject', adminOnly, async (req, res) => {
  try {
    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    await Seller.findByIdAndDelete(seller._id);

    await notifyAdmin('new_seller', 'Seller rejected', `${seller.name || seller.ownerName || 'a seller'} has been rejected.`, { sellerId: seller._id });

    res.json({ success: true, message: 'Seller rejected and removed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
