# CollabEdit — Architecture, Design Considerations & Scaling Guide

> This document explains every architectural decision made in this codebase, what breaks under load, and exactly what to refactor when you scale editors, readers, triad consistency, or integrity requirements. Read this before touching production.

---

## Table of Contents

1. [Current Architecture Overview](#1-current-architecture-overview)
2. [Core Design Decisions & Why](#2-core-design-decisions--why)
3. [Dimension 1 — More Editors (Write-Heavy Scale)](#3-dimension-1--more-editors-write-heavy-scale)
4. [Dimension 2 — More Readers (Read-Heavy Scale)](#4-dimension-2--more-readers-read-heavy-scale)
5. [Dimension 3 — CAP Triad (Consistency, Availability, Partition Tolerance)](#5-dimension-3--cap-triad)
6. [Dimension 4 — Data Integrity](#6-dimension-4--data-integrity)
7. [Dimension 5 — Adding New File Type Editors](#7-dimension-5--adding-new-file-type-editors)
8. [Dimension 6 — Security Hardening](#8-dimension-6--security-hardening)
9. [Dimension 7 — Observability & Debugging](#9-dimension-7--observability--debugging)
10. [Refactor Priority Matrix](#10-refactor-priority-matrix)
11. [Migration Path: Dev to Production](#11-migration-path-dev-to-production)

---

## 1. Current Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Clients                                                    │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────────┐ │
│  │ VS Code Ext  │   │  React Web   │   │  Future Mobile  │ │
│  │ (CommonJS)   │   │  (Vite/JSX)  │   │                 │ │
│  └──────┬───────┘   └──────┬───────┘   └────────┬────────┘ │
│         │                  │                     │          │
└─────────┼──────────────────┼─────────────────────┼──────────┘
          │ WebSocket        │ WebSocket + REST     │
          ▼                  ▼                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Node.js Server (single process)                            │
│  ┌──────────────────────┐  ┌──────────────────────────────┐ │
│  │  Express REST API    │  │  Hocuspocus WebSocket Server │ │
│  │  /api/auth           │  │  CRDT engine (Yjs)           │ │
│  │  /api/sessions       │  │  Per-room document state     │ │
│  │  /api/files          │  │  Awareness (cursors)         │ │
│  │  /api/invites        │  └──────────────────────────────┘ │
│  └──────────────────────┘                                   │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  MongoDB (single instance)                                  │
│  Collections: users, sessions, documents, annotations,      │
│  invites                                                    │
│  Binary Yjs state stored as Buffer in Document.yjsState     │
└─────────────────────────────────────────────────────────────┘
```

### What the CRDT (Yjs) does

Every document is a `Y.Doc`. Text edits become operations stored in a directed acyclic graph. Two people can edit offline and merge without conflict when they reconnect. This is fundamentally different from OT (Operational Transformation used by Google Docs) — Yjs requires no central coordinator to resolve conflicts.

**Yjs shared types used in this project:**

| Type | Used for |
|---|---|
| `Y.Text` | Code files, plain text, markdown |
| `Y.XmlFragment` | TipTap rich text (internally XML) |
| `Y.Array` | PDF annotations, PPTX slides list, image pins |
| `Y.Map` | Spreadsheet cells (`row:col` to value), slide element data |

---

## 2. Core Design Decisions & Why

### Decision 1 — Hocuspocus over raw y-websocket

`y-websocket` is a minimal server. Hocuspocus is a production-grade wrapper that adds authentication hooks (`onConnect`), persistence hooks (`onLoadDocument`, `onStoreDocument`), and an extension system (Logger, Database, Redis).

**Tradeoff:** Hocuspocus is opinionated. If you need a custom sync protocol, you will fight the abstraction.

### Decision 2 — Yjs binary state stored in MongoDB

When a room closes, `encodeStateAsUpdate(ydoc)` produces a binary snapshot stored as a `Buffer` in `Document.yjsState`. On reconnect, `applyUpdate(ydoc, state)` restores the full document.

**Tradeoff:** This is a complete snapshot, not an operation log. You cannot replay history or do point-in-time recovery from it alone. See the Integrity section for how to fix this.

### Decision 3 — In-memory presence map

`sockets/presence.js` stores who is online in a plain JavaScript `Map`. It is fast and zero-dependency.

**Tradeoff:** This dies completely if the server restarts, and it cannot work across multiple server instances — horizontal scaling breaks it entirely.

### Decision 4 — Single Express + Hocuspocus process

Both REST and WebSocket are served from the same `http.Server`. Simple to start, simple to debug.

**Tradeoff:** A spike in WebSocket connections can starve REST request handling because both share the Node.js event loop. Under load you must separate them.

### Decision 5 — EditorRouter pattern

`EditorRouter.jsx` is a pure switch statement from file extension to editor component. Every editor component receives the same three props: `{ document, ydoc, provider }`.

**Why this matters:** Adding a new file type never changes any other file. The contract is stable. Each editor is fully isolated and independently testable.

---

## 3. Dimension 1 — More Editors (Write-Heavy Scale)

### What "more editors" means

10 simultaneous editors in a room is normal. 100 is stress. 500 is a different problem entirely.

### What breaks first

**A. The Hocuspocus `onStoreDocument` hook fires on every change**

Currently every keystroke eventually triggers a MongoDB write of the full Yjs binary state. With 100 editors typing simultaneously this becomes a write stampede.

**Fix: Debounce persistence**

```js
// In hocuspocusServer.js — replace onStoreDocument with:
const pendingSaves = new Map();

async onStoreDocument({ documentName, document }) {
  if (pendingSaves.has(documentName)) {
    clearTimeout(pendingSaves.get(documentName));
  }
  pendingSaves.set(documentName, setTimeout(async () => {
    const state = Buffer.from(encodeStateAsUpdate(document));
    await Document.findOneAndUpdate(
      { name: documentName },
      { yjsState: state, updatedAt: Date.now() },
      { upsert: true }
    );
    pendingSaves.delete(documentName);
  }, 2000)); // wait 2s of inactivity before writing
}
```

**B. Awareness broadcasts become O(n²)**

Every cursor move from user A is broadcast to all n-1 other users. With 100 editors, a single cursor move generates 99 outbound WebSocket messages. With everyone typing this produces roughly 9,900 messages per keystroke cycle.

**Fix: Throttle awareness updates on the client**

```js
// In useYjs.js — throttle cursor updates
let lastAwarenessUpdate = 0;
editor.on('selectionUpdate', () => {
  const now = Date.now();
  if (now - lastAwarenessUpdate < 50) return; // max 20fps
  lastAwarenessUpdate = now;
  provider.awareness.setLocalStateField('cursor', getCursorPos());
});
```

**C. The Node.js event loop saturates**

Single-threaded Node.js with 500 WebSocket connections all sending ops simultaneously will start dropping frames.

**Fix: Move to multiple WebSocket server instances with Redis**

```
┌──────────────────────────────────────────┐
│  Load Balancer (Nginx / sticky sessions) │
└────────────┬──────────────┬─────────────┘
             │              │
      ┌──────▼───┐    ┌─────▼────┐
      │  WS Srv  │    │  WS Srv  │   (multiple Hocuspocus instances)
      │  Node 1  │    │  Node 2  │
      └──────────┘    └──────────┘
             │              │
      ┌──────▼──────────────▼──────┐
      │  Redis Pub/Sub             │   (cross-node op forwarding)
      └────────────────────────────┘
             │
      ┌──────▼──────┐
      │  MongoDB    │
      └─────────────┘
```

**Refactor required:** Add `@hocuspocus/extension-redis` and configure Nginx with `ip_hash` or a session-aware load balancer so all clients in the same room land on the same node.

```js
// packages/server/src/sockets/hocuspocusServer.js
const { Redis } = require('@hocuspocus/extension-redis');

Server.configure({
  extensions: [
    new Redis({ host: process.env.REDIS_HOST, port: 6379 }),
    new Logger()
  ]
});
```

**D. MongoDB write throughput ceiling**

MongoDB handles roughly 10,000 writes per second on a single node. With 500 editors, even with debouncing, you may hit this ceiling.

**Fix: Use Redis for hot document state, flush to MongoDB asynchronously**

```
Editor ops → Hocuspocus → Redis (hot, fast, ephemeral)
                                ↓  (every 30s or on room close)
                           MongoDB (cold, durable, queryable)
```

Add `@hocuspocus/extension-redis-database` to replace in-memory Yjs state with Redis-backed state.

---

## 4. Dimension 2 — More Readers (Read-Heavy Scale)

### What "more readers" means

Readers (view-only) still connect via WebSocket to receive updates. They do not send ops but they do receive awareness broadcasts and document updates. 1,000 readers watching a live document is a broadcast fanout problem.

### What breaks first

**A. Hocuspocus broadcasts every op to every connected client**

With 1,000 readers every single edit is serialized and sent to 1,000 WebSocket connections from the same Node.js process. This is pure I/O saturation.

**Fix: Read-replica WebSocket tier**

```
Writers (10) → Primary Hocuspocus → Redis Pub/Sub
                                         ↓
Readers (1000) → Read-only WS relay ← Redis Sub
```

The read-only relay does not participate in Yjs CRDT — it only subscribes to a Redis channel and fans out binary updates to all read-only clients. This completely offloads the primary Hocuspocus process.

**Refactor required:** Create `packages/server/src/sockets/readRelay.js`:

```js
const redis = require('redis');
const sub = redis.createClient();
const WebSocket = require('ws');

const readClients = new Map(); // roomId → Set of ws connections

sub.subscribe('doc:*', (message, channel) => {
  const roomId = channel.replace('doc:', '');
  const clients = readClients.get(roomId) || new Set();
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(message);
  }
});
// Accept read-only connections at /collab-read
```

**B. In-memory presence map does not scale horizontally**

With multiple server instances each has its own `Map`. A reader on Node 2 cannot see the presence state managed by Node 1.

**Fix: Replace with Redis-backed presence**

```js
// packages/server/src/sockets/presence.js — full refactor

const redis = require('redis');
const client = redis.createClient({ url: process.env.REDIS_URL });

async function userJoined(roomId, user) {
  await client.hSet(`presence:${roomId}`, user._id.toString(), JSON.stringify(user));
  await client.expire(`presence:${roomId}`, 3600); // 1hr TTL
}

async function userLeft(roomId, userId) {
  await client.hDel(`presence:${roomId}`, userId.toString());
}

async function getPresence(roomId) {
  const data = await client.hGetAll(`presence:${roomId}`);
  return Object.values(data).map(JSON.parse);
}
```

**C. File downloads under read-heavy load**

The current `files.js` route streams files directly from local disk through Node.js. With 1,000 readers all downloading the same PDF you are saturating both disk I/O and Node.js bandwidth simultaneously.

**Fix: Serve files from a CDN / object store**

Replace `multer` local disk storage with `multer-s3` or MinIO for self-hosted. Generate signed S3 URLs for downloads instead of proxying through Node.js.

```js
// Instead of:
res.download(doc.filePath, doc.name);

// Do:
const signedUrl = await s3.getSignedUrlPromise('getObject', {
  Bucket: process.env.S3_BUCKET,
  Key: doc.s3Key,
  Expires: 300
});
res.redirect(signedUrl);
```

Readers then download directly from S3/CDN — zero load on your Node.js server.

---

## 5. Dimension 3 — CAP Triad

The CAP theorem states a distributed system can guarantee at most two of: **Consistency**, **Availability**, **Partition Tolerance**.

### Where the current system sits: AP (Available + Partition Tolerant)

Yjs CRDT is an AP system by design. If two users edit the same paragraph while offline (network partition), both edits survive. When they reconnect both changes are merged deterministically. You never lose data. You never block. But the merged result may not be what either user intended — it is mathematically correct, not semantically correct.

### If you need more Consistency

**Scenario:** Legal documents, medical records, financial spreadsheets — fields where two people must not simultaneously modify the same value.

**Option A: Pessimistic locking (field-level)**

Add a `locks` `Y.Map` to every Yjs document. Before editing a cell/section, a client writes its userId to the locks map. Other clients check this before allowing edits.

```js
// In the editor component before allowing edits:
const locks = ydoc.getMap('locks');
const lockKey = `cell:${row}:${col}`;
const currentLock = locks.get(lockKey);

if (currentLock && currentLock.userId !== myUserId) {
  // Show "Locked by [name]" — reject edit
  return;
}

// Acquire lock
locks.set(lockKey, { userId: myUserId, name: myName, since: Date.now() });
// ... perform edit ...
locks.delete(lockKey); // Release
```

**Tradeoff:** Lock acquisition over Yjs is still eventually consistent — two users can race to acquire the same lock. For hard consistency you need a server-side lock arbiter (Redis `SET NX EX`).

**Option B: Server-validated operations (OT hybrid)**

Route every write through the Express API. The server validates, applies, and broadcasts. Clients do not apply ops locally until the server ACKs.

**Tradeoff:** This adds 1–2 RTT latency to every keystroke. Typing feels laggy. This is exactly why Google Docs felt slow in early versions.

**Option C: Section ownership (recommended)**

Assign document sections to users. Only the owner can edit their section. Others see changes in real time but cannot type there. This preserves Yjs speed for the owner while preventing conflicts for critical fields. It is the right tradeoff for most real-world cases.

### If you need more Availability

The current single MongoDB instance is a single point of failure. If it goes down, the entire system is unavailable.

**Fix: MongoDB replica set**

```yaml
# docker-compose.yml addition
mongo-primary:
  image: mongo:7
  command: --replSet rs0
mongo-secondary:
  image: mongo:7
  command: --replSet rs0
mongo-arbiter:
  image: mongo:7
  command: --replSet rs0 --arbiter
```

With a replica set, reads can be served from secondaries even if the primary is down. Writes require the primary.

**Fix: Hocuspocus with Redis fallback**

If MongoDB is down, Hocuspocus with the Redis extension continues operating from in-memory Redis state. Documents are served, edits sync. MongoDB is written when it recovers.

### If you need more Partition Tolerance

Yjs already handles this for document content. The problem is the REST API.

If a user is on a partitioned network segment they can still edit (Yjs buffers ops locally). But they cannot create a new session, upload a file, or validate an invite — these are all REST calls.

**Fix: Service workers + IndexedDB offline queue**

```js
// packages/web-app/src/service-worker.js
self.addEventListener('fetch', event => {
  if (event.request.url.includes('/api/sessions') && !navigator.onLine) {
    event.respondWith(
      caches.match(event.request) || queueForRetry(event.request)
    );
  }
});
```

This is a significant refactor. Only invest in it if your users genuinely work in low-connectivity environments.

---

## 6. Dimension 4 — Data Integrity

### Current integrity guarantees

| What | Guarantee |
|---|---|
| Document content | Yjs CRDT — no data loss on concurrent edits |
| User passwords | bcrypt hashed — never stored plain |
| JWT tokens | Signed HS256 — tamper-evident |
| File uploads | Stored on local disk — no checksum |
| Yjs state snapshots | Single buffer in MongoDB — no history |
| Annotations | MongoDB documents — no versioning |

### What is missing and why it matters

**A. No operation log (audit trail)**

The current system stores only the latest Yjs binary snapshot. If a user deletes a paragraph there is no way to recover it. There is no record of who deleted what at what time.

**Fix: Append-only op log**

Create a new model `packages/server/src/models/OpLog.js`:

```js
const opLogSchema = new mongoose.Schema({
  documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  clientId:   { type: Number },        // Yjs clientID
  update:     { type: Buffer, required: true }, // raw Yjs update binary
  clock:      { type: Number },        // Yjs logical clock
  timestamp:  { type: Date, default: Date.now }
}, { capped: { size: 1e9, max: 100000 } }); // capped at 1GB, 100k ops
```

In `hocuspocusServer.js`, hook into `onChange`:

```js
async onChange({ documentName, document, update, context }) {
  if (!update || !context?.user) return;
  await OpLog.create({
    documentId: await resolveDocumentId(documentName),
    userId: context.user._id,
    update: Buffer.from(update),
    timestamp: Date.now()
  });
}
```

To reconstruct a document at any point in time, replay ops up to that timestamp using `Y.applyUpdate`.

**B. No file checksums**

Uploaded files have no integrity verification. A corrupted disk write, partial upload, or storage-layer error cannot be detected.

**Fix: Store SHA-256 hash at upload time, verify on download**

```js
// In routes/files.js — after multer saves the file:
const crypto = require('crypto');

function fileChecksum(path) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(path)
      .on('data', d => hash.update(d))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

const checksum = await fileChecksum(req.file.path);
const doc = await Document.create({ ...otherFields, checksum });
```

Recompute and compare on every download request. Reject and alert if mismatch.

**C. JWT tokens never expire in practice**

Tokens expire in 7 days but there is no revocation mechanism. A stolen token is valid for the full duration even after a password change.

**Fix: Token blacklist in Redis**

```js
// routes/auth.js — add logout:
router.post('/logout', authMiddleware, async (req, res) => {
  const token = req.headers.authorization.split(' ')[1];
  const ttl = 7 * 24 * 60 * 60; // match token expiry in seconds
  await redis.setEx(`blacklist:${token}`, ttl, '1');
  res.json({ message: 'Logged out' });
});

// middleware/auth.js — check blacklist before accepting:
const isBlacklisted = await redis.get(`blacklist:${token}`);
if (isBlacklisted) return res.status(401).json({ error: 'Token revoked' });
```

**D. No input validation on API routes**

Routes do basic presence checks but no type, length, or format validation. A malicious client can send 100MB strings as session names, XSS payloads as usernames, or negative numbers as file sizes.

**Fix: Add Joi validation middleware**

```js
// packages/server/src/middleware/validate.js
const Joi = require('joi');

const schemas = {
  register: Joi.object({
    name:     Joi.string().trim().min(1).max(60).required(),
    email:    Joi.string().email().required(),
    password: Joi.string().min(6).max(128).required()
  }),
  createSession: Joi.object({
    name:     Joi.string().trim().min(1).max(120).required(),
    isPublic: Joi.boolean().optional()
  })
};

function validate(schemaName) {
  return (req, res, next) => {
    const { error } = schemas[schemaName].validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });
    next();
  };
}
```

**E. MongoDB operator injection**

Mongoose does not sanitize inputs by default. A request body of `{ "email": { "$gt": "" } }` will match all users in a `findOne` query.

**Fix: Add mongo-sanitize middleware (one line)**

```js
const mongoSanitize = require('express-mongo-sanitize');
app.use(mongoSanitize()); // strips $ and . from req.body keys
```

---

## 7. Dimension 5 — Adding New File Type Editors

The `EditorRouter.jsx` pattern is deliberately designed for extension. Here is the exact contract and checklist.

### The contract every editor must honour

```
Props received:   { document, ydoc, provider }
document:         MongoDB Document object { _id, name, fileType, filePath, ... }
ydoc:             Y.Doc — the shared CRDT document for this room
provider:         WebsocketProvider — for awareness (cursors, presence)
```

The editor is responsible for reading from and writing to `ydoc`. It must not make HTTP calls to the server for content — all content lives in Yjs.

### Checklist for adding a new editor (e.g., `.docx`)

1. Create `packages/web-app/src/editors/DocxEditor/DocxEditor.jsx` and `DocxEditor.css`
2. Decide your Yjs schema — what shared types will you use?
3. Register the extension in `EditorRouter.jsx` (one `import` and one `case` in the switch)
4. Add the MIME type to `config/multer.js`
5. Document your Yjs key names at the top of the editor file

### Yjs key namespace convention

Each editor must prefix its Yjs keys to avoid collisions when multiple files share a room:

| Editor | Yjs key |
|---|---|
| CodeEditor | `content` (Y.Text) |
| RichTextEditor | managed by TipTap internally |
| PdfEditor | `annotations` (Y.Array) |
| PptxEditor | `slides` (Y.Array) |
| SpreadsheetEditor | `spreadsheet` (Y.Map) |
| ImageViewer | `img_annotations` (Y.Array) |
| New DocxEditor | `docx_content`, `docx_comments` |

### Bundle size grows with each editor

Monaco alone is 3MB. With 10 editors all eagerly imported, first-load time becomes painful.

**Fix: Lazy load every editor**

```js
// EditorRouter.jsx
const CodeEditor        = React.lazy(() => import('./CodeEditor/CodeEditor.jsx'));
const PdfEditor         = React.lazy(() => import('./PdfEditor/PdfEditor.jsx'));
const PptxEditor        = React.lazy(() => import('./PptxEditor/PptxEditor.jsx'));
const SpreadsheetEditor = React.lazy(() => import('./SpreadsheetEditor/SpreadsheetEditor.jsx'));

return (
  <Suspense fallback={<div className="editor-loading">Loading editor...</div>}>
    {/* switch result here */}
  </Suspense>
);
```

Users who only open code files never download the PDF renderer. Users who only view PDFs never download Monaco.

---

## 8. Dimension 6 — Security Hardening

### Current security posture

| Area | Current state | Risk level |
|---|---|---|
| Auth | JWT HS256, 7d expiry | Medium — no revocation |
| Passwords | bcrypt cost 10 | Good |
| CORS | Origin whitelist | Good |
| Rate limiting | None | High |
| Input validation | Minimal presence checks | High |
| File uploads | MIME type check only | Medium |
| WebSocket auth | JWT in query param | Medium — visible in logs |
| MongoDB | No sanitization | High |
| HTTPS | Not enforced | High |

### Priority fixes in order

**1. Rate limiting (highest impact, lowest effort)**

```js
const rateLimit = require('express-rate-limit');

const authLimiter   = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });   // 20 login attempts / 15min
const apiLimiter    = rateLimit({ windowMs: 60 * 1000, max: 200 });        // 200 req/min general
const uploadLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });         // 10 uploads/min

app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);
app.use('/api/files/upload', uploadLimiter);
```

**2. Move JWT out of WebSocket query string**

WebSocket connections currently pass `?token=...` in the URL. This appears in Nginx access logs, browser history, and HTTP referrer headers.

**Fix: Send token in the first WebSocket message after connect**

```js
// Client (useYjs.js):
const provider = new WebsocketProvider(wsUrl, roomId, ydoc);
provider.ws.addEventListener('open', () => {
  provider.ws.send(JSON.stringify({ type: 'auth', token }));
});

// Server: verify token in onMessage before allowing any Yjs ops
```

**3. Magic byte file verification**

MIME types are sent by the browser and can be spoofed. A malicious user can upload an executable with a `.pdf` extension.

```js
const fileType = require('file-type');

async function verifyMagicBytes(filePath, expectedMime) {
  const type = await fileType.fromFile(filePath);
  if (!type || type.mime !== expectedMime) {
    fs.unlinkSync(filePath); // delete the suspicious file
    throw new Error('File content does not match declared type');
  }
}
```

**4. Sanitize filenames**

```js
const sanitize = require('sanitize-filename');
const safeName = sanitize(file.originalname).replace(/\s+/g, '-');
```

**5. Enforce HTTPS in production**

```js
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}
```

---

## 9. Dimension 7 — Observability & Debugging

### What you cannot see right now

With the current setup there is no way to answer: why did user X's edit not appear for user Y? How many users are in room Z right now? What was the average latency of a Yjs op sync over the last hour? Which documents are hot vs cold?

### Structured logging

Replace `console.log` with a structured logger:

```js
// packages/server/src/config/logger.js
const pino = require('pino');
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty' }
    : undefined
});
module.exports = logger;
```

Log every WebSocket connect/disconnect, every document load/save, and every auth failure with structured fields: `roomId`, `userId`, `durationMs`.

### Metrics endpoint

Add a `/metrics` endpoint in Prometheus format tracking:

- `collab_active_rooms` — current count of open Hocuspocus rooms
- `collab_connected_clients` — total WebSocket connections
- `collab_ops_per_second` — Yjs operation throughput
- `collab_store_duration_ms` — MongoDB write latency histogram

### Health check depth

Expand the current shallow `/health` endpoint:

```js
app.get('/health', async (req, res) => {
  const mongoOk = mongoose.connection.readyState === 1;
  res.status(mongoOk ? 200 : 503).json({
    status: mongoOk ? 'ok' : 'degraded',
    mongo: mongoOk ? 'connected' : 'disconnected',
    activeRooms: hocuspocus?.getDocumentsCount?.() || 0,
    uptime: process.uptime()
  });
});
```

---

## 10. Refactor Priority Matrix

Rate each by **Impact** (how much it improves the system) vs **Effort** (how hard to implement). Do high-impact, low-effort first.

| Refactor | Dimension | Impact | Effort | Do When |
|---|---|---|---|---|
| Debounce `onStoreDocument` | More editors | High | Low | Before first real users |
| Add rate limiting | Security | High | Low | Before launch |
| Add `express-mongo-sanitize` | Integrity | High | Low | Before launch |
| Joi input validation | Integrity | High | Low | Before launch |
| Magic byte file verification | Security | Medium | Low | Before public uploads |
| Lazy load editors | More file types | Medium | Low | When bundle exceeds 2MB |
| Redis presence map | More readers | Medium | Medium | When running more than 1 server |
| Op log / audit trail | Integrity | High | Medium | When users need history |
| JWT blacklist in Redis | Security | Medium | Medium | When users report stolen tokens |
| MongoDB replica set | Availability | High | Medium | Before production |
| S3 file storage | More readers | High | Medium | When more than 50 users |
| SHA-256 file checksums | Integrity | Medium | Low | Before production |
| Separate WS + REST processes | More editors | Medium | High | When more than 200 concurrent editors |
| Redis-backed Hocuspocus | More editors | High | Medium | When horizontal scaling needed |
| Section ownership locking | Consistency | Medium | High | When documents are legally sensitive |
| Service worker offline queue | Partition tolerance | Medium | High | When users are in low-connectivity regions |

---

## 11. Migration Path: Dev to Production

### Phase 1 — Launch-ready (before any real users)

These are non-negotiable:

1. Set `JWT_SECRET` to a 64-character random string — never the default
2. Add rate limiting to all routes
3. Add `express-mongo-sanitize`
4. Add Joi validation to auth and session routes
5. Enforce HTTPS
6. Enable MongoDB authentication (`--auth` flag)
7. Move file uploads to S3 — local disk is not durable in any cloud environment
8. Replace `console.log` with structured logging
9. Set up a basic uptime monitor (UptimeRobot or Better Uptime pointing at `/health`)

### Phase 2 — First 100 users

1. Debounce `onStoreDocument` with a 2-second delay
2. Throttle client awareness broadcasts to 50ms intervals
3. Lazy load all editor components with `React.lazy`
4. Add depth to the `/health` endpoint
5. MongoDB replica set (3 nodes minimum)
6. SHA-256 checksums on all uploaded files

### Phase 3 — First 1,000 users

1. Redis for presence map
2. Redis for Hocuspocus state via `@hocuspocus/extension-redis`
3. Separate WebSocket server process from REST server process
4. S3 signed URL redirects instead of Node.js proxying downloads
5. Nginx in front for SSL termination and static file serving
6. Implement the op log for document history and audit trail

### Phase 4 — First 10,000 users

1. Horizontal scaling of Hocuspocus behind a sticky-session load balancer
2. Read-only WebSocket relay tier for viewer-only rooms
3. CDN for Vite build output static assets
4. MongoDB Atlas or equivalent managed cluster with auto-scaling
5. Prometheus metrics + Grafana dashboard
6. Async document export pipeline (generating PDFs / PPTX exports off the main thread)

---

## Summary

This codebase is architected for correctness first. Yjs CRDT gives you conflict-free collaboration out of the box. The EditorRouter pattern makes adding file types a 30-minute task. The MERN stack means every engineer on your team can read and modify every layer.

The things that will bite you in production, in order of likelihood: lack of rate limiting, single-node MongoDB, in-memory presence map, and synchronous file serving through Node. Fix those four and you can comfortably serve thousands of concurrent users before the architecture needs a fundamental rethink.

The CAP tradeoff is the deepest decision here. Yjs chose AP — it will never block, never lose data, but it cannot guarantee that two simultaneous edits produce semantically meaningful results. For most collaborative editing this is exactly the right tradeoff. If your domain requires hard consistency (legal, medical, financial), section ownership or server-validated ops are the pragmatic solution, not a full architectural replacement.