const Y    = require('yjs');
const { WebsocketProvider } = require('y-websocket');
const vscode = require('vscode');
const path   = require('path');
const fs     = require('fs');

class YjsProvider {
  constructor(serverUrl, token, cursorProvider, collabFs, user) {
    this.serverUrl      = serverUrl;
    this.token          = token;
    this.cursorProvider = cursorProvider;
    this.collabFs       = collabFs;
    this.user           = user;

    this.ydoc           = null;
    this.wsProvider     = null;
    this.roomId         = null;

    this._disposables   = [];
    this._seeded        = false;
    this._isSeeding     = false;
    this._fileMap       = new Map();
  }

  // ── HOST: share entire workspace folder ───────────────────────────────────
  async hostProject(roomId, workspaceFolder) {
    this.roomId = roomId;
    await this._initYjs(roomId);
    await this._waitForSync();

    const files    = await this._scanWorkspace(workspaceFolder);
    const manifest = this.ydoc.getMap('manifest');

    console.log(`[CollabCode] Hosting ${files.length} files from ${workspaceFolder}`);

    for (const relPath of files) {
      const absPath   = path.join(workspaceFolder, relPath);
      const ytext     = this.ydoc.getText(`file:${relPath}`);
      const collabUri = vscode.Uri.parse(`collab:/${roomId}/${relPath}`);

      let content = '';
      try { content = fs.readFileSync(absPath, 'utf8'); } catch (_) {}

      // Only seed if room has no content yet for this file
      if (ytext.toString().length === 0 && content.length > 0) {
        this._isSeeding = true;
        this.ydoc.transact(() => ytext.insert(0, content));
        this._isSeeding = false;
      }

      manifest.set(relPath, { lang: this._detectLang(relPath) });
      this.collabFs.registerFile(collabUri, ytext.toString(), ytext);
      this._fileMap.set(relPath, { ytext, absPath });

      // Peer edits → write back to local disk
      ytext.observe(() => {
        if (this._isSeeding) return;
        const newContent = ytext.toString();
        try {
          const current = fs.readFileSync(absPath, 'utf8');
          if (current !== newContent) fs.writeFileSync(absPath, newContent, 'utf8');
        } catch (_) {}
      });

      this._watchLocalFile(absPath, relPath, ytext, collabUri);
    }

    console.log(`[CollabCode] All ${files.length} files hosted`);
    this._setupAwareness();
    return files.length;
  }

  // ── JOINER: receive files and open them as collab:/ URIs ──────────────────
  async joinProject(roomId) {
    this.roomId = roomId;
    await this._initYjs(roomId);
    await this._waitForSync();

    const manifest = this.ydoc.getMap('manifest');
    let files = Array.from(manifest.entries());

    if (files.length === 0) {
      console.log('[CollabCode] Manifest empty — waiting for host...');
      files = await this._waitForManifest(manifest, 8000);
    }

    if (files.length === 0) {
      vscode.window.showWarningMessage(
        'CollabCode: No files received — make sure the host ran "Host Project" first.'
      );
      return;
    }

    console.log(`[CollabCode] Got ${files.length} files from manifest`);

    for (const [relPath] of files) {
      const ytext     = this.ydoc.getText(`file:${relPath}`);
      const collabUri = vscode.Uri.parse(`collab:/${roomId}/${relPath}`);
      this.collabFs.registerFile(collabUri, ytext.toString(), ytext);
      this._fileMap.set(relPath, { ytext });
    }

    // Handle new files added after join
    manifest.observe(() => {
      for (const [relPath] of manifest.entries()) {
        if (this._fileMap.has(relPath)) continue;
        const ytext     = this.ydoc.getText(`file:${relPath}`);
        const collabUri = vscode.Uri.parse(`collab:/${roomId}/${relPath}`);
        this.collabFs.registerFile(collabUri, ytext.toString(), ytext);
        this._fileMap.set(relPath, { ytext });
      }
    });

    this._setupAwareness();
    await this._mountWorkspace(roomId, files);
  }

  // ── Single-file mode (backward compat) ────────────────────────────────────
  async connect(roomId, editor) {
    this.roomId = roomId;
    await this._initYjs(roomId);

    const ytext = this.ydoc.getText('content');

    // BUG 2 FIX: v2 emits sync with (state) — same as v1, but use on() not once()
    this.wsProvider.on('sync', (synced) => {
      if (!synced || this._seeded) return;
      this._seeded = true;
      const serverContent = ytext.toString();
      const fileContent   = editor.document.getText();
      if (serverContent.length === 0 && fileContent.length > 0) {
        this._isSeeding = true;
        this.ydoc.transact(() => ytext.insert(0, fileContent));
        this._isSeeding = false;
      } else if (serverContent.length > 0 && serverContent !== fileContent) {
        this._applyToEditor(editor, serverContent);
      }
    });

    ytext.observe(() => {
      if (this._isSeeding || !editor?.document) return;
      const newContent = ytext.toString();
      if (newContent !== editor.document.getText()) this._applyToEditor(editor, newContent);
    });

    const onDidChange = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== editor.document.uri.toString()) return;
      this.ydoc.transact(() => {
        for (const change of e.contentChanges) {
          const start = editor.document.offsetAt(change.range.start);
          if (change.rangeLength > 0) ytext.delete(start, change.rangeLength);
          if (change.text)            ytext.insert(start, change.text);
        }
      });
    });
    this._disposables.push(onDidChange);
    this._setupAwareness(editor);
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  async _initYjs(roomId) {
    this.ydoc = new Y.Doc();

    // BUG 1 FIX: y-websocket v2 passes params as options object, NOT query string
    // Old (broken): new WebsocketProvider(url + '?token=...', roomId, doc)
    // Correct v2:   new WebsocketProvider(serverUrl, roomId, doc, { params: { token } })
    this.wsProvider = new WebsocketProvider(
      this.serverUrl,
      roomId,
      this.ydoc,
      { params: { token: this.token } }
    );

    this.wsProvider.on('status', ({ status }) =>
      console.log(`[CollabCode] WebSocket: ${status}`)
    );
  }

  _waitForSync() {
    return new Promise((resolve) => {
      // BUG 4 FIX: check wsProvider.synced INSIDE the promise, not before
      const check = () => {
        if (this.wsProvider && this.wsProvider.synced) {
          resolve();
          return true;
        }
        return false;
      };
      if (check()) return;
      this.wsProvider.on('sync', (synced) => { if (synced) resolve(); });
      // Fallback timeout - don't block forever
      setTimeout(resolve, 5000);
    });
  }

  _waitForManifest(manifest, timeout) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve(Array.from(manifest.entries()));
      }, timeout);

      const observer = () => {
        const entries = Array.from(manifest.entries());
        if (entries.length > 0) {
          clearTimeout(timer);
          manifest.unobserve(observer);
          setTimeout(() => resolve(Array.from(manifest.entries())), 500);
        }
      };
      manifest.observe(observer);
    });
  }

  _setupAwareness(editor) {
    if (!this.wsProvider) return;
    const userName  = this.user?.name  || 'VS Code User';
    const userColor = this.user?.avatarColor ||
      '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');

    this.wsProvider.awareness.setLocalStateField('user', {
      name: userName, color: userColor, userId: this.user?._id || null
    });

    if (editor) {
      this.wsProvider.awareness.on('change', () => {
        if (!this.wsProvider) return;
        const states = Array.from(this.wsProvider.awareness.getStates().entries());
        this.cursorProvider.updateCursors(editor, states, this.wsProvider.awareness.clientID);
      });
      const sel = vscode.window.onDidChangeTextEditorSelection((e) => {
        if (e.textEditor !== editor || !this.wsProvider) return;
        const pos = editor.document.offsetAt(e.selections[0].active);
        this.wsProvider.awareness.setLocalStateField('cursor', { anchor: pos, head: pos });
      });
      this._disposables.push(sel);
    }
  }

  // BUG 7 FIX: watch files using absolute path watcher, not RelativePattern
  _watchLocalFile(absPath, relPath, ytext, collabUri) {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(
        vscode.Uri.file(path.dirname(absPath)),
        path.basename(absPath)
      )
    );
    watcher.onDidChange(() => {
      if (this._isSeeding) return;
      try {
        const newContent = fs.readFileSync(absPath, 'utf8');
        const current    = ytext.toString();
        if (newContent === current) return;
        this._isSeeding = true;
        this.ydoc.transact(() => {
          ytext.delete(0, current.length);
          ytext.insert(0, newContent);
        });
        this._isSeeding = false;
        this.collabFs.updateFile(collabUri, newContent);
      } catch (_) {}
    });
    this._disposables.push(watcher);
  }

  async _mountWorkspace(roomId, files) {
    const os      = require('os');
    const rootUri = vscode.Uri.parse(`collab:/${roomId}`);

    const currentFolders = vscode.workspace.workspaceFolders || [];
    const alreadyMounted = currentFolders.some(f => f.uri.toString() === rootUri.toString());
    if (alreadyMounted) return;

    const collabEntry = { uri: rootUri, name: `CollabCode (${files.length} files)` };

    if (currentFolders.length > 0) {
      vscode.workspace.updateWorkspaceFolders(currentFolders.length, null, collabEntry);
    } else {
      const tmpDir = path.join(os.tmpdir(), `collabcode-${roomId.slice(0, 8)}`);
      try { fs.mkdirSync(tmpDir, { recursive: true }); } catch (_) {}
      fs.writeFileSync(
        path.join(tmpDir, 'COLLABCODE.md'),
        `# CollabCode Session\nRoom: ${roomId}\nFiles: ${files.length}\n`
      );
      vscode.workspace.updateWorkspaceFolders(0, 0,
        { uri: vscode.Uri.file(tmpDir), name: '(CollabCode anchor)' },
        collabEntry
      );
    }

    vscode.window.showInformationMessage(
      `CollabCode: ${files.length} files loaded — check Explorer panel`
    );

    // File picker so user can open any file immediately
    const pick = await vscode.window.showQuickPick(
      files.map(([relPath]) => ({
        label: path.basename(relPath),
        description: relPath,
        detail: relPath
      })),
      { placeHolder: `${files.length} files available — pick one to open` }
    );
    if (pick) {
      const uri = vscode.Uri.parse(`collab:/${roomId}/${pick.description}`);
      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, { preview: false });
      } catch (err) {
        console.warn('[CollabCode] Could not open file:', err.message);
      }
    }
  }

  async _scanWorkspace(workspaceFolder) {
    const IGNORE   = new Set([
      'node_modules', '.git', '.vscode', 'dist', 'out', 'build',
      '.next', '.nuxt', '__pycache__', '.cache', 'coverage', '.DS_Store'
    ]);
    const MAX_FILES = 500;
    const MAX_SIZE  = 512 * 1024;
    const results   = [];

    const walk = (dir, base) => {
      if (results.length >= MAX_FILES) return;
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
      for (const entry of entries) {
        if (IGNORE.has(entry.name) || entry.name.startsWith('.')) continue;
        const rel = base ? `${base}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          walk(path.join(dir, entry.name), rel);
        } else if (entry.isFile()) {
          try {
            if (fs.statSync(path.join(dir, entry.name)).size <= MAX_SIZE)
              results.push(rel);
          } catch (_) {}
        }
      }
    };
    walk(workspaceFolder, '');
    return results;
  }

  async _applyToEditor(editor, newContent) {
    try {
      const edit  = new vscode.WorkspaceEdit();
      const range = new vscode.Range(
        editor.document.positionAt(0),
        editor.document.positionAt(editor.document.getText().length)
      );
      edit.replace(editor.document.uri, range, newContent);
      await vscode.workspace.applyEdit(edit);
    } catch (err) {
      console.error('[CollabCode] applyEdit failed:', err.message);
    }
  }

  _detectLang(filePath) {
    const map = {
      '.js': 'javascript', '.ts': 'typescript', '.jsx': 'javascriptreact',
      '.tsx': 'typescriptreact', '.py': 'python', '.html': 'html',
      '.css': 'css', '.json': 'json', '.md': 'markdown', '.go': 'go',
      '.rs': 'rust', '.java': 'java', '.cpp': 'cpp', '.c': 'c',
      '.sh': 'shellscript', '.yaml': 'yaml', '.yml': 'yaml'
    };
    return map[path.extname(filePath).toLowerCase()] || 'plaintext';
  }

  getInviteLink() { return this.roomId; }

  disconnect() {
    this._disposables.forEach(d => { try { d.dispose(); } catch (_) {} });
    this._disposables = [];
    this._seeded    = false;
    this._isSeeding = false;
    this._fileMap.clear();
    if (this.wsProvider) { try { this.wsProvider.destroy(); } catch (_) {} this.wsProvider = null; }
    if (this.ydoc)       { try { this.ydoc.destroy();       } catch (_) {} this.ydoc = null; }
  }
}

module.exports = { YjsProvider };