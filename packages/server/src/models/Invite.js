const mongoose = require('mongoose');
const crypto = require('crypto');

const inviteSchema = new mongoose.Schema({
  token: { type: String, unique: true, default: () => crypto.randomBytes(24).toString('hex') },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  usedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  used: { type: Boolean, default: false },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Invite', inviteSchema);