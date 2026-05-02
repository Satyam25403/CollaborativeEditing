const vscode = require('vscode');
const path   = require('path');

/**
 * CollabFileSystemProvider
 *
 * Implements vscode.FileSystemProvider for the `collab:/` URI scheme.
 * The HOST registers all files from their workspace into this provider.
 * The JOINER mounts `collab:/` as their workspace root and sees all files
 * in real time — every Yjs text update fires a change event that VS Code
 * picks up automatically.
 *
 * URI format:  collab:/<roomId>/<relative-file-path>
 * Example:     collab:/abc-123/src/index.js
 */
class CollabFileSystemProvider {
  constructor() {
    this._emitter   = new vscode.EventEmitter();
    this.onDidChangeFile = this._emitter.event;

    // Map of uriString -> { content: Buffer, ytext: Y.Text | null }
    this._files = new Map();
    // Map of uriString -> Y.Text observer function (for cleanup)
    this._observers = new Map();
  }

  // ── Registration ──────────────────────────────────────────────────────────

  /**
   * Register a file into the virtual FS and bind its Yjs text.
   * Called by YjsProvider for every file in the session.
   * @param {vscode.Uri} uri       collab:/roomId/rel/path
   * @param {string}     content   initial file content
   * @param {object}     ytext     Y.Text instance for this file
   */
  registerFile(uri, content, ytext) {
    const key = uri.toString();
    this._files.set(key, { content: Buffer.from(content, 'utf8'), ytext });

    // Observer: when remote Yjs changes arrive, update buffer and notify VS Code
    const observer = () => {
      const newContent = ytext.toString();
      const entry = this._files.get(key);
      if (!entry) return;
      entry.content = Buffer.from(newContent, 'utf8');
      this._emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
    };

    ytext.observe(observer);
    this._observers.set(key, { ytext, observer });
  }

  /**
   * Update a file's buffer when the local user edits it (host side).
   */
  updateFile(uri, content) {
    const key   = uri.toString();
    const entry = this._files.get(key);
    if (entry) {
      entry.content = Buffer.from(content, 'utf8');
      this._emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
    }
  }

  /**
   * List all registered file URIs (for building the file tree).
   */
  getAllUris() {
    return Array.from(this._files.keys()).map(s => vscode.Uri.parse(s));
  }

  // ── vscode.FileSystemProvider implementation ──────────────────────────────

  watch() {
    // VS Code calls this — we handle changes via _emitter so just return a no-op disposable
    return new vscode.Disposable(() => {});
  }

  stat(uri) {
    const key = uri.toString();
    if (this._files.has(key)) {
      return {
        type:  vscode.FileType.File,
        ctime: 0,
        mtime: Date.now(),
        size:  this._files.get(key).content.length
      };
    }
    // Return directory stat for any path that is a prefix of a registered file
    const prefix = key.endsWith('/') ? key : key + '/';
    const isDir  = Array.from(this._files.keys()).some(k => k.startsWith(prefix));
    if (isDir || key.split('/').length <= 4) {   // root + roomId level = always dir
      return { type: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 };
    }
    throw vscode.FileSystemError.FileNotFound(uri);
  }

  readDirectory(uri) {
    const prefix = uri.toString().endsWith('/') ? uri.toString() : uri.toString() + '/';
    const seen   = new Set();
    const result = [];

    for (const key of this._files.keys()) {
      if (!key.startsWith(prefix)) continue;
      const rest  = key.slice(prefix.length);
      const parts = rest.split('/');
      const name  = parts[0];
      if (seen.has(name)) continue;
      seen.add(name);
      const type = parts.length === 1 ? vscode.FileType.File : vscode.FileType.Directory;
      result.push([name, type]);
    }
    return result;
  }

  readFile(uri) {
    const entry = this._files.get(uri.toString());
    if (!entry) throw vscode.FileSystemError.FileNotFound(uri);
    return entry.content;
  }

  writeFile(uri, content) {
    // Called when the joiner edits a file — push change into Yjs
    const key   = uri.toString();
    const entry = this._files.get(key);
    if (!entry) throw vscode.FileSystemError.FileNotFound(uri);

    const newContent = Buffer.from(content).toString('utf8');
    entry.content    = Buffer.from(newContent, 'utf8');

    // Push into Yjs so it replicates to all peers
    if (entry.ytext) {
      const current = entry.ytext.toString();
      if (current !== newContent) {
        entry.ytext.doc.transact(() => {
          entry.ytext.delete(0, current.length);
          entry.ytext.insert(0, newContent);
        });
      }
    }
  }

  // These are required by the interface but we keep them as no-ops for now
  createDirectory() {}
  delete()         {}
  rename()         {}

  dispose() {
    for (const { ytext, observer } of this._observers.values()) {
      try { ytext.unobserve(observer); } catch (_) {}
    }
    this._observers.clear();
    this._files.clear();
    this._emitter.dispose();
  }
}

module.exports = { CollabFileSystemProvider };