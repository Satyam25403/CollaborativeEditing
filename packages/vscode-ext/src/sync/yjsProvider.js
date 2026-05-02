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
    this._fileMap       = new Map(); // relPath -> { ytext, absPath? }
  }

  // ── HOST: share entire workspace folder ───────────────────────────────────

  async hostProject(roomId, workspaceFolder) {
    this.roomId = roomId;
    await this._initYjs(roomId);

    const files    = await this._scanWorkspace(workspaceFolder);
    const manifest = this.ydoc.getMap('manifest');

    console.log(`[CollabCode] Hosting ${files.length} files from ${workspaceFolder}`);

    await this._waitForSync();

    for (const relPath of files) {
      const absPath = path.join(workspaceFolder, relPath);
      let content = '';
      try { content = fs.readFileSync(absPath, 'utf8'); } catch (_) {}

      const ytext     = this.ydoc.getText(`file:${relPath}`);
      const collabUri = vscode.Uri.parse(`collab:/${roomId}/${relPath}`);
      this._fileMap.set(relPath, { ytext, absPath });

      if (ytext.toString().length === 0 && content.length > 0) {
        this._isSeeding = true;
        this.ydoc.transact(() => ytext.insert(0, content));
        this._isSeeding = false;
      }

      // Register in manifest AFTER content is seeded
      manifest.set(relPath, { lang: this._detectLang(relPath) });

      this.collabFs.registerFile(collabUri, content, ytext);

      // Peer edits → write back to local file
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

    console.log(`[CollabCode] All ${files.length} files seeded`);
    this._setupAwareness();
    return files.length;
  }

  // ── JOINER: receive files and open them as collab:/ URIs ──────────────────

  async joinProject(roomId) {
    this.roomId = roomId;
    await this._initYjs(roomId);

    const manifest = this.ydoc.getMap('manifest');

    await this._waitForSync();

    // Wait for manifest if still empty
    let files = Array.from(manifest.entries());
    if (files.length === 0) {
      console.log('[CollabCode] Manifest empty — waiting for host...');
      files = await this._waitForManifest(manifest, 6000);
    }

    if (files.length === 0) {
      vscode.window.showWarningMessage(
        'CollabCode: No files received. Make sure the host ran "Host Project" first.'
      );
      return;
    }

    console.log(`[CollabCode] Got ${files.length} files from manifest`);

    // Register all files in the virtual FS
    for (const [relPath] of files) {
      const ytext     = this.ydoc.getText(`file:${relPath}`);
      const collabUri = vscode.Uri.parse(`collab:/${roomId}/${relPath}`);
      this.collabFs.registerFile(collabUri, ytext.toString(), ytext);
      this._fileMap.set(relPath, { ytext });
    }

    // Handle new files added later
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

    // FIX: Instead of unreliable updateWorkspaceFolders/openFolder,
    // add the collab:/ folder to the workspace using the most reliable method
    await this._mountWorkspace(roomId, files);
  }

  async _mountWorkspace(roomId, files) {
    const rootUri = vscode.Uri.parse(`collab:/${roomId}`);

    // Try adding as workspace folder first
    const currentFolders = vscode.workspace.workspaceFolders || [];
    const alreadyMounted = currentFolders.some(f => f.uri.toString() === rootUri.toString());

    if (!alreadyMounted) {
      const added = vscode.workspace.updateWorkspaceFolders(
        currentFolders.length, null,
        { uri: rootUri, name: `📁 ColabCode (${files.length} files)` }
      );

      if (added) {
        vscode.window.showInformationMessage(
          `CollabCode: ${files.length} files loaded — check Explorer panel ✓`
        );
        return;
      }
    }

    // Fallback: updateWorkspaceFolders failed (no folder open in window)
    // Open the first few files directly as tabs so user can see them immediately
    vscode.window.showInformationMessage(
      `CollabCode: ${files.length} files loaded — opening files in tabs...`
    );

    const MAX_AUTO_OPEN = 5;
    let opened = 0;

    for (const [relPath] of files) {
      if (opened >= MAX_AUTO_OPEN) break;
      const collabUri = vscode.Uri.parse(`collab:/${roomId}/${relPath}`);
      try {
        const doc = await vscode.workspace.openTextDocument(collabUri);
        await vscode.window.showTextDocument(doc, {
          preview: false,
          viewColumn: vscode.ViewColumn.One
        });
        opened++;
      } catch (err) {
        console.warn(`[CollabCode] Could not open ${relPath}:`, err.message);
      }
    }

    // Show file picker so user can open any file from the project
    const filePaths = files.map(([relPath]) => relPath);
    const pick = await vscode.window.showQuickPick(
      filePaths.map(p => ({ label: path.basename(p), description: p })),
      {
        placeHolder: `${files.length} files in session — pick one to open`,
        canPickMany: false
      }
    );

    if (pick) {
      const collabUri = vscode.Uri.parse(`collab:/${roomId}/${pick.description}`);
      const doc = await vscode.workspace.openTextDocument(collabUri);
      await vscode.window.showTextDocument(doc, { preview: false });
    }
  }

  // ── Single-file mode ──────────────────────────────────────────────────────

  async connect(roomId, editor) {
    this.roomId = roomId;
    await this._initYjs(roomId);

    const ytext = this.ydoc.getText('content');

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
    this.ydoc       = new Y.Doc();
    const url       = `${this.serverUrl}?token=${encodeURIComponent(this.token)}`;
    this.wsProvider = new WebsocketProvider(url, roomId, this.ydoc);
    this.wsProvider.on('status', ({ status }) =>
      console.log(`[CollabCode] WebSocket: ${status}`)
    );
  }

  _waitForSync() {
    return new Promise((resolve) => {
      if (this.wsProvider.synced) { resolve(); return; }
      this.wsProvider.once('sync', (synced) => { if (synced) resolve(); });
      setTimeout(resolve, 4000);
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
          setTimeout(() => resolve(Array.from(manifest.entries())), 800);
        }
      };
      manifest.observe(observer);
    });
  }

  _setupAwareness(editor) {
    const userName  = this.user?.name || 'VS Code User';
    const userColor = this.user?.avatarColor ||
      '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');

    this.wsProvider.awareness.setLocalStateField('user', {
      name: userName, color: userColor, userId: this.user?._id || null
    });

    if (editor) {
      this.wsProvider.awareness.on('change', () => {
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

  _watchLocalFile(absPath, relPath, ytext, collabUri) {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(path.dirname(absPath), path.basename(absPath))
    );
    watcher.onDidChange(() => {
      if (this._isSeeding) return;
      try {
        const newContent = fs.readFileSync(absPath, 'utf8');
        const current    = ytext.toString();
        if (newContent === current) return;
        this.ydoc.transact(() => {
          ytext.delete(0, current.length);
          ytext.insert(0, newContent);
        });
        this.collabFs.updateFile(collabUri, newContent);
      } catch (_) {}
    });
    this._disposables.push(watcher);
  }

  async _scanWorkspace(workspaceFolder) {
    const IGNORE   = new Set([
      'node_modules', '.git', '.vscode', 'dist', 'out', 'build',
      '.next', '.nuxt', '__pycache__', '.cache', 'coverage'
    ]);
    const MAX_FILES = 500;
    const MAX_SIZE  = 512 * 1024;
    const results   = [];

    const walk = (dir, base) => {
      if (results.length >= MAX_FILES) return;
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
      for (const entry of entries) {
        if (IGNORE.has(entry.name)) continue;
        const rel = base ? `${base}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          walk(path.join(dir, entry.name), rel);
        } else if (entry.isFile()) {
          try {
            const size = fs.statSync(path.join(dir, entry.name)).size;
            if (size <= MAX_SIZE) results.push(rel);
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
      '.rs': 'rust', '.java': 'java', '.cpp': 'cpp', '.c': 'c'
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