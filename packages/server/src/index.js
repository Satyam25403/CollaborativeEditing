require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const http    = require('http');
const { connectDB }        = require('./config/db');
const { startHocuspocus }  = require('./sockets/hocuspocusServer');

const authRoutes    = require('./routes/auth');
const sessionRoutes = require('./routes/sessions');
const fileRoutes    = require('./routes/files');
const userRoutes    = require('./routes/users');
const inviteRoutes  = require('./routes/invites');

const app    = express();
const server = http.createServer(app);

// FIX BUG 12: CORS must allow both the web client AND the VS Code extension.
// The extension makes REST calls from a non-browser context so there may be
// no Origin header at all — allowedOrigins handles the web client while the
// final `true` (allow-all) handles requests with no Origin (VS Code / curl).
const allowedOrigins = [
  process.env.CLIENT_URL,          // http://localhost:5173 (web frontend)
  'vscode-webview://'              // VS Code webview panels if added later
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (VS Code extension, curl, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.some(allowed => origin.startsWith(allowed))) {
      return callback(null, true);
    }
    callback(new Error(`CORS: origin "${origin}" not allowed`));
  },
  credentials: true
}));

app.use(express.json());
app.use('/uploads', express.static('uploads'));

app.use('/api/auth',     authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/files',    fileRoutes);
app.use('/api/users',    userRoutes);
app.use('/api/invites',  inviteRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 4000;

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`Express server running on http://localhost:${PORT}`);
    startHocuspocus(server);
  });
});