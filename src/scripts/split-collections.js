require('dotenv').config();
const mongoose = require('mongoose');

/*
 * Migrate the single unified `users` collection (which held buyers, sellers AND
 * admins) into three role-specific collections:
 *
 *   users    → buyers only
 *   sellers  → seller identity + business profile merged into one document
 *   admins   → admins only
 *
 * Seller identity documents keep the SAME _id as their original user document so
 * existing references (Product.owner, Deal.seller, …) stay valid. The old
 * business-profile documents (which lived in `sellers` keyed by `user`) are
 * merged into the new seller documents and then removed.
 *
 * Runs read-only by default. Use raw collections (not Mongoose models) so the
 * schema's indexes are not rebuilt mid-migration.
 *
 *   node src/scripts/split-collections.js            # dry run (no writes)
 *   node src/scripts/split-collections.js --commit   # copy sellers/admins out
 *   node src/scripts/split-collections.js --commit --purge   # …and delete them from `users`
 */

const COMMIT = process.argv.includes('--commit');
const PURGE = process.argv.includes('--purge');

const MONGO_URI = process.env.MONGODB_URI;

// Pick out the business-profile fields from an old `sellers` document.
function businessFields(biz = {}) {
  return {
    name: biz.name,
    type: biz.type,
    category: biz.category || [],
    gstin: biz.gstin,
    fssaiLicense: biz.fssaiLicense,
    address: biz.address,
    description: biz.description,
    bank: biz.bank,
  };
}

async function run() {
  if (!MONGO_URI) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  console.log(`📦 Connected to ${db.databaseName}\n`);

  const usersCol = db.collection('users');
  const sellersCol = db.collection('sellers');
  const adminsCol = db.collection('admins');

  // Old business profiles, keyed by the user they belonged to.
  const businessDocs = await sellersCol.find({ user: { $exists: true } }).toArray();
  const businessByUser = new Map(businessDocs.map((b) => [String(b.user), b]));

  const sellerUsers = await usersCol.find({ role: 'seller' }).toArray();
  const adminUsers = await usersCol.find({ role: 'admin' }).toArray();
  const buyerCount = await usersCol.countDocuments({
    role: { $nin: ['seller', 'admin'] },
  });

  console.log('Plan:');
  console.log(`  • ${sellerUsers.length} seller(s) → sellers  (merging ${businessDocs.length} business profile[s])`);
  console.log(`  • ${adminUsers.length} admin(s)  → admins`);
  console.log(`  • ${buyerCount} buyer(s) stay in users`);
  console.log(`  • old business-only docs in sellers to remove: ${businessDocs.length}`);
  console.log('');

  if (!COMMIT) {
    console.log('ℹ️  Dry run — no changes written. Re-run with --commit to apply.');
    await mongoose.disconnect();
    return;
  }

  // The old schema put a unique index on `user`; the new seller docs have no
  // `user` field, so drop it before inserting to avoid a duplicate-null clash.
  try {
    await sellersCol.dropIndex('user_1');
    console.log('🧹 Dropped stale sellers.user_1 index');
  } catch (_) {
    /* index may not exist — fine */
  }

  let sellersWritten = 0;
  for (const u of sellerUsers) {
    const biz = businessByUser.get(String(u._id)) || {};
    const doc = {
      _id: u._id, // keep the id so Product.owner / Deal.seller stay valid
      ownerName: u.name || '',
      ...businessFields(biz),
      phone: u.phone,
      email: u.email,
      password: u.password,
      addresses: u.addresses || [],
      otp: u.otp,
      otpExpiry: u.otpExpiry,
      isVerified: u.isVerified ?? false,
      role: 'seller',
      createdAt: u.createdAt || new Date(),
      updatedAt: new Date(),
    };
    await sellersCol.replaceOne({ _id: u._id }, doc, { upsert: true });
    sellersWritten++;
  }
  console.log(`✅ Wrote ${sellersWritten} seller document(s)`);

  let adminsWritten = 0;
  for (const u of adminUsers) {
    const doc = {
      _id: u._id,
      name: u.name || '',
      phone: u.phone,
      email: u.email,
      password: u.password,
      addresses: u.addresses || [],
      otp: u.otp,
      otpExpiry: u.otpExpiry,
      isVerified: u.isVerified ?? false,
      role: 'admin',
      createdAt: u.createdAt || new Date(),
      updatedAt: new Date(),
    };
    await adminsCol.replaceOne({ _id: u._id }, doc, { upsert: true });
    adminsWritten++;
  }
  console.log(`✅ Wrote ${adminsWritten} admin document(s)`);

  // Remove the now-merged business-only documents from sellers.
  const delBiz = await sellersCol.deleteMany({ user: { $exists: true } });
  console.log(`🧹 Removed ${delBiz.deletedCount} old business-profile doc(s) from sellers`);

  if (PURGE) {
    const purged = await usersCol.deleteMany({ role: { $in: ['seller', 'admin'] } });
    console.log(`🧹 Purged ${purged.deletedCount} seller/admin doc(s) from users`);
  } else {
    console.log('ℹ️  Kept seller/admin docs in `users` (re-run with --purge to remove them).');
  }

  console.log('\nFinal counts:');
  console.log(`  users    : ${await usersCol.countDocuments()}`);
  console.log(`  sellers  : ${await sellersCol.countDocuments()}`);
  console.log(`  admins   : ${await adminsCol.countDocuments()}`);

  await mongoose.disconnect();
  console.log('\n✨ Done.');
}

run().catch(async (err) => {
  console.error('❌ Migration failed:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
