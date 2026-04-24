const express = require('express');
const Invite = require('../models/Invite');
const Session = require('../models/Session');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// POST /api/invites - create invite link for a session
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

    const session = await Session.findById(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.owner.toString() !== req.user._id.toString())
      return res.status(403).json({ error: 'Only the owner can create invites' });

    const invite = await Invite.create({ sessionId, createdBy: req.user._id });
    const link = `${process.env.CLIENT_URL}/join/${invite.token}`;
    res.status(201).json({ invite, link });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/invites/:token - validate and use invite
router.get('/:token', authMiddleware, async (req, res) => {
  try {
    const invite = await Invite.findOne({ token: req.params.token }).populate('sessionId');
    if (!invite) return res.status(404).json({ error: 'Invite not found' });
    if (invite.used) return res.status(410).json({ error: 'Invite already used' });
    if (invite.expiresAt < new Date()) return res.status(410).json({ error: 'Invite expired' });

    // Add user to session participants
    const session = await Session.findById(invite.sessionId._id);
    if (!session.participants.includes(req.user._id)) {
      session.participants.push(req.user._id);
      await session.save();
    }

    invite.used = true;
    invite.usedBy = req.user._id;
    await invite.save();

    res.json({ session });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;