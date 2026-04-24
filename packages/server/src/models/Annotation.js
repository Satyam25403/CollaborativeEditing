const mongoose = require('mongoose');

const annotationSchema = new mongoose.Schema({
  documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  page: { type: Number, default: 1 },
  type: { type: String, enum: ['highlight', 'comment', 'drawing', 'arrow'], default: 'comment' },
  content: { type: String, default: '' },
  position: {
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 }
  },
  color: { type: String, default: '#FFFF00' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

annotationSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Annotation', annotationSchema);