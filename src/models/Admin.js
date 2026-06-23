const mongoose = require('mongoose');
const { identityFields, applyIdentity } = require('./identity');


const adminSchema = new mongoose.Schema(
  {
    name: { type: String, default: '', trim: true },
    ...identityFields(),
    role: { type: String, enum: ['admin'], default: 'admin' },
  },
  { timestamps: true }
);

applyIdentity(adminSchema);

module.exports = mongoose.model('Admin', adminSchema);
