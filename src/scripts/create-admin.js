require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const MONGO_URI = process.env.MONGODB_URI;

// Usage:
//   node src/scripts/create-admin.js
//   node src/scripts/create-admin.js "John Doe" "john@example.com" "9876543210" "MyPass@123"
//   node src/scripts/create-admin.js "John Doe" "john@example.com" "9876543210"
//
// Args:  name  email  phone  password  (password is optional, defaults to Admin@12345)
const [,, nameArg, emailArg, phoneArg, passwordArg] = process.argv;

async function createAdmin() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('📦 Connected to MongoDB');

    const name = nameArg || process.env.ADMIN_NAME || 'FistoUp Admin';
    const email = emailArg || process.env.ADMIN_EMAIL || 'admin@fistoup.com';
    const phone = phoneArg || process.env.ADMIN_PHONE || '9999999999';
    const password = passwordArg || process.env.ADMIN_PASSWORD || 'Admin@12345';

    // Check if admin already exists
    const existing = await User.findOne({ phone, role: 'admin' });
    if (existing) {
      console.log(`⚠️  Admin with phone ${phone} already exists (id: ${existing._id})`);
      await mongoose.disconnect();
      process.exit(0);
    }

    // Create admin user
    const admin = await User.create({
      name,
      phone,
      email,
      password, // Will be hashed by the pre-save hook
      role: 'admin',
      isVerified: true,
    });

    console.log('\n✅ Admin user created successfully!');
    console.log('─'.repeat(40));
    console.log(`  Name:    ${admin.name}`);
    console.log(`  Phone:   ${admin.phone}`);
    console.log(`  Email:   ${admin.email}`);
    console.log(`  Role:    ${admin.role}`);
    console.log(`  ID:      ${admin._id}`);
    console.log('─'.repeat(40));
    console.log('\n🔐 Login credentials:');
    console.log(`   Phone:    ${phone}`);
    console.log(`   Password: ${password}`);
    console.log('\n💡 You can now log in to the admin panel with these credentials.\n');
    console.log('📋 Usage:');
    console.log('   node src/scripts/create-admin.js');
    console.log('   node src/scripts/create-admin.js "Name" "Email" "Phone" "Password"');
    console.log('   node src/scripts/create-admin.js "Name" "Email" "Phone" (uses default password)\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error creating admin:', err.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

createAdmin();