const express = require('express');
const path = require('path');
const fs = require('fs');
const Document = require('../models/Document');
const authMiddleware = require('../middleware/auth');
const { handleUpload } = require('../middleware/upload');

const router = express.Router();

// POST /api/files/upload
router.post('/upload', authMiddleware, handleUpload('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const ext = path.extname(req.file.originalname).toLowerCase().replace('.', '');
    const doc = await Document.create({
      name: req.file.originalname,
      fileType: ext,
      mimeType: req.file.mimetype,
      filePath: req.file.path,
      owner: req.user._id,
      size: req.file.size
    });
    res.status(201).json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/files - list user's documents
router.get('/', authMiddleware, async (req, res) => {
  try {
    const docs = await Document.find({ owner: req.user._id }).select('-yjsState');
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/files/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id).select('-yjsState');
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/files/:id/download - stream raw file
router.get('/:id/download', authMiddleware, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc || !doc.filePath) return res.status(404).json({ error: 'File not found' });
    if (!fs.existsSync(doc.filePath)) return res.status(410).json({ error: 'File no longer on disk' });
    res.download(doc.filePath, doc.name);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/files/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (doc.owner.toString() !== req.user._id.toString())
      return res.status(403).json({ error: 'Not your document' });

    if (doc.filePath && fs.existsSync(doc.filePath)) fs.unlinkSync(doc.filePath);
    await doc.deleteOne();
    res.json({ message: 'File deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;