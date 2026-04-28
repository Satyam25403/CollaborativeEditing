const { Server } = require('@hocuspocus/server');
const { Logger } = require('@hocuspocus/extension-logger');
const { applyUpdate, encodeStateAsUpdate } = require('yjs');
const Document = require('../models/Document');
const jwt = require('jsonwebtoken');

let hocuspocus;

function startHocuspocus(httpServer) {
  hocuspocus = Server.configure({
    extensions: [new Logger()],

    async onConnect({ documentName, requestParameters, requestHeaders }) {
      const token =
        requestParameters.get('token') ||
        (requestHeaders.authorization || '').replace('Bearer ', '');
      if (!token) throw new Error('Authentication required');

      try {
        const user = jwt.verify(token, process.env.JWT_SECRET);
        console.log(`[Hocuspocus] ${user.name} joined room: ${documentName}`);
        return { user };
      } catch {
        throw new Error('Invalid token');
      }
    },

    async onLoadDocument({ documentName, document }) {
      try {
        const doc = await Document.findOne({ name: documentName });
        if (doc && doc.yjsState && doc.yjsState.length > 0) {
          applyUpdate(document, doc.yjsState);
          console.log('[Hocuspocus] Loaded state for:', documentName);
        }
      } catch (err) {
        console.error('[Hocuspocus] Load error:', err.message);
      }
    },

    async onStoreDocument({ documentName, document }) {
      try {
        const state = Buffer.from(encodeStateAsUpdate(document));
        await Document.findOneAndUpdate(
          { name: documentName },
          { yjsState: state, updatedAt: Date.now() },
          { upsert: true, new: true }
        );
        console.log('[Hocuspocus] Saved state for:', documentName);
      } catch (err) {
        console.error('[Hocuspocus] Store error:', err.message);
      }
    },

    async onDisconnect({ documentName, context }) {
      if (context && context.user) {
        console.log(`[Hocuspocus] ${context.user.name} left room:`, documentName);
      }
    }
  });

  // Attach to existing HTTP server via upgrade event
  httpServer.on('upgrade', (request, socket, head) => {
    const url = request.url || '';
    if (url.startsWith('/collab')) {
      hocuspocus.handleUpgrade(request, socket, head);
    }
  });

  console.log('[Hocuspocus] WebSocket handler attached at /collab');
}

module.exports = { startHocuspocus };