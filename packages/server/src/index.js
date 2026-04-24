require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { connectDB } = require('./config/db');
const { startHocuspocus } = require('./sockets/hocuspocusServer');

const authRoutes = require('./routes/auth');
const sessionRoutes = require('./routes/sessions');
const fileRoutes = require('./routes/files');
const userRoutes = require('./routes/users');
const inviteRoutes = require('./routes/invites');

const app = express();
const server = http.createServer(app);

app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use('/uploads', express.static('uploads'));

app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/users', userRoutes);
app.use('/api/invites', inviteRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 4000;

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`Express server running on http://localhost:${PORT}`);
    startHocuspocus(server);
  });
});