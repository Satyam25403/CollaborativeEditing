const express = require('express');
const { randomUUID } = require('crypto');
const Session = require('../models/Session');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// GET /api/sessions - list sessions the user owns or is participant in
router.get('/', authMiddleware, async (req, res) => {
  try {
    const sessions = await Session.find({
      $or: [{ owner: req.user._id }, { participants: req.user._id }]
    }).populate('owner', 'name email avatarColor').populate('documentId');
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sessions - create new session
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, isPublic } = req.body;
    if (!name) return res.status(400).json({ error: 'Session name required' });

    const roomId = randomUUID();
    const session = await Session.create({
      roomId,
      name,
      owner: req.user._id,
      participants: [req.user._id],
      isPublic: isPublic || false
    });
    res.status(201).json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sessions/:roomId
router.get('/:roomId', authMiddleware, async (req, res) => {
  try {
    const session = await Session.findOne({ roomId: req.params.roomId })
      .populate('owner', 'name email avatarColor')
      .populate('participants', 'name email avatarColor')
      .populate('documentId');
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/sessions/:roomId
router.delete('/:roomId', authMiddleware, async (req, res) => {
  try {
    const session = await Session.findOne({ roomId: req.params.roomId });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.owner.toString() !== req.user._id.toString())
      return res.status(403).json({ error: 'Only the owner can delete a session' });

    await session.deleteOne();
    res.json({ message: 'Session deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
