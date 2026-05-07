const vscode = require('vscode');
const path   = require('path');

class CollabFileSystemProvider {
  constructor() {
    this._emitter        = new vscode.EventEmitter();
    this.onDidChangeFile  = this._emitter.event;
    this._files           = new Map();  // uriString -> { content: Buffer, ytext }
    this._observers       = new Map();  // uriString -> { ytext, observer }
  }

  registerFile(uri, content, ytext) {
    const key = uri.toString();
    this._files.set(key, { content: Buffer.from(content, 'utf8'), ytext });

    const observer = () => {
      const entry = this._files.get(key);
      if (!entry) return;
      entry.content = Buffer.from(ytext.toString(), 'utf8');
      this._emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
    };

    ytext.observe(observer);
    this._observers.set(key, { ytext, observer });
  }

  updateFile(uri, content) {
    const key   = uri.toString();
    const entry = this._files.get(key);
    if (entry) {
      entry.content = Buffer.from(content, 'utf8');
      this._emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
    }
  }

  getAllUris() {
    return Array.from(this._files.keys()).map(s => vscode.Uri.parse(s));
  }

  watch() {
    return new vscode.Disposable(() => {});
  }

  stat(uri) {
    const key = uri.toString();

    // Exact file match
    if (this._files.has(key)) {
      return {
        type:  vscode.FileType.File,
        ctime: 0,
        mtime: Date.now(),
        size:  this._files.get(key).content.length
      };
    }

    // BUG 5 FIX: check if this uri is a prefix of any registered file (= directory)
    const prefix = key.endsWith('/') ? key : key + '/';
    const isDir  = Array.from(this._files.keys()).some(k => k.startsWith(prefix));

    if (isDir) {
      return { type: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 };
    }

    // BUG 5 FIX: also treat the root and roomId level as directories
    // collab:/ has 2 segments, collab:/roomId has 3 segments
    // Count meaningful path parts (filter empty strings from split)
    const parts = key.replace(/^collab:\/\//, '').replace(/^collab:\//, '').split('/').filter(Boolean);
    if (parts.length <= 1) {
      return { type: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 };
    }

    throw vscode.FileSystemError.FileNotFound(uri);
  }

  readDirectory(uri) {
    const uriStr = uri.toString();
    const prefix = uriStr.endsWith('/') ? uriStr : uriStr + '/';
    const seen   = new Set();
    const result = [];

    for (const key of this._files.keys()) {
      if (!key.startsWith(prefix)) continue;
      const rest  = key.slice(prefix.length);
      const parts = rest.split('/');
      const name  = parts[0];
      if (!name || seen.has(name)) continue;
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
    const key   = uri.toString();
    const entry = this._files.get(key);
    if (!entry) throw vscode.FileSystemError.FileNotFound(uri);

    const newContent  = Buffer.from(content).toString('utf8');
    entry.content     = Buffer.from(newContent, 'utf8');

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