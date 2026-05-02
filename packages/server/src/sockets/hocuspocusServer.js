// Hocuspocus v4 correct API: new Hocuspocus({ ...config })
// Server.configure() does NOT exist in v4 — use constructor options directly
const { Hocuspocus } = require('@hocuspocus/server');
const { Logger }     = require('@hocuspocus/extension-logger');
const { applyUpdate, encodeStateAsUpdate } = require('yjs');
const WebSocket      = require('ws');
const Document       = require('../models/Document');
const jwt            = require('jsonwebtoken');
const { userJoined, userLeft } = require('./presence');

let hocuspocus;

function startHocuspocus(httpServer) {
  // v4: pass all hooks directly into the constructor
  hocuspocus = new Hocuspocus({
    extensions: [new Logger()],

    async onAuthenticate({ token, documentName }) {
      // Hocuspocus v4 uses onAuthenticate (not onConnect) for auth
      const rawToken =
        (typeof token === 'string' ? token : null) ||
        '';

      if (!rawToken) throw new Error('Authentication required');

      try {
        const user = jwt.verify(rawToken, process.env.JWT_SECRET);
        console.log(`[Hocuspocus] ${user.name} authenticated for room: ${documentName}`);
        // Return context — accessible as context.user in other hooks
        return { user };
      } catch {
        throw new Error('Invalid or expired token');
      }
    },

    async onConnect({ documentName, context }) {
      // FIX BUG 13: wire presence so userJoined is actually called
      if (context?.user) {
        userJoined(documentName, context.user);
        console.log(`[Hocuspocus] ${context.user.name} joined room: ${documentName}`);
      }
    },

    async onLoadDocument({ documentName, document }) {
      try {
        const doc = await Document.findOne({ name: documentName });
        if (doc && doc.yjsState && doc.yjsState.length > 0) {
          applyUpdate(document, doc.yjsState);
          console.log(`[Hocuspocus] Loaded state for: ${documentName}`);
        }
      } catch (err) {
        console.error('[Hocuspocus] Load error:', err.message);
      }
    },

    async onStoreDocument({ documentName, document, context }) {
      try {
        const state = Buffer.from(encodeStateAsUpdate(document));

        // FIX BUG 14: set owner on upsert so the required field is populated;
        // $setOnInsert only runs when creating a new document (not on updates)
        await Document.findOneAndUpdate(
          { name: documentName },
          {
            $set: { yjsState: state, updatedAt: Date.now() },
            $setOnInsert: {
              owner:    context?.user?._id || null,
              fileType: 'text',
              mimeType: 'text/plain'
            }
          },
          { upsert: true, new: true }
        );
        console.log(`[Hocuspocus] Saved state for: ${documentName}`);
      } catch (err) {
        console.error('[Hocuspocus] Store error:', err.message);
      }
    },

    async onDisconnect({ documentName, context }) {
      // FIX BUG 13: wire presence so userLeft is actually called
      if (context?.user) {
        userLeft(documentName, context.user._id);
        console.log(`[Hocuspocus] ${context.user.name} left room: ${documentName}`);
      }
    }
  });

  // Attach to the existing HTTP server via a ws.WebSocketServer
  const wss = new WebSocket.Server({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const url = request.url || '';
    if (url.startsWith('/collab')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        hocuspocus.handleConnection(ws, request);
      });
    } else {
      // Not our path — destroy so the socket doesn't hang
      socket.destroy();
    }
  });

  console.log('[Hocuspocus] WebSocket handler attached at /collab');
}

module.exports = { startHocuspocus };