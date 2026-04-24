const { Server } = require('@hocuspocus/server');
const { Logger } = require('@hocuspocus/extension-logger');
const Document = require('../models/Document');
const Session = require('../models/Session');
const jwt = require('jsonwebtoken');

let hocuspocus;

function startHocuspocus(httpServer) {
  hocuspocus = Server.configure({
    port: null, // we attach to existing httpServer
    extensions: [new Logger()],

    // Called when a client connects to a room
    async onConnect({ documentName, requestParameters, requestHeaders }) {
      const token = requestParameters.get('token') || (requestHeaders.authorization || '').replace('Bearer ', '');
      if (!token) throw new Error('Authentication required');

      try {
        const user = jwt.verify(token, process.env.JWT_SECRET);
        console.log(`[Hocuspocus] ${user.name} joined room: ${documentName}`);
        return { user };
      } catch {
        throw new Error('Invalid token');
      }
    },

    // Load existing Yjs state from MongoDB when room opens
    async onLoadDocument({ documentName, document }) {
      try {
        const doc = await Document.findOne({ name: documentName });
        if (doc && doc.yjsState && doc.yjsState.length > 0) {
          const { applyUpdate } = require('yjs');
          applyUpdate(document, doc.yjsState);
          console.log(`[Hocuspocus] Loaded state for: ${documentName}`);
        }
      } catch (err) {
        console.error('[Hocuspocus] Load error:', err.message);
      }
    },

    // Persist updated Yjs state back to MongoDB
    async onStoreDocument({ documentName, document }) {
      try {
        const { encodeStateAsUpdate } = require('yjs');
        const state = Buffer.from(encodeStateAsUpdate(document));
        await Document.findOneAndUpdate(
          { name: documentName },
          { yjsState: state, updatedAt: Date.now() },
          { upsert: true, new: true }
        );
        console.log(`[Hocuspocus] Saved state for: ${documentName}`);
      } catch (err) {
        console.error('[Hocuspocus] Store error:', err.message);
      }
    },

    async onDisconnect({ documentName, context }) {
      if (context && context.user) {
        console.log(`[Hocuspocus] ${context.user.name} left room: ${documentName}`);
      }
    }
  });

  // Attach Hocuspocus WebSocket handling to the existing HTTP server
  httpServer.on('upgrade', (request, socket, head) => {
    const url = request.url || '';
    if (url.startsWith('/collab')) {
      hocuspocus.handleUpgrade(request, socket, head);
    }
  });

  console.log('[Hocuspocus] WebSocket handler attached at /collab');
}

module.exports = { startHocuspocus };