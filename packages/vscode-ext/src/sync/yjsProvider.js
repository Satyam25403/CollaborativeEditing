const Y = require('yjs');
const { WebsocketProvider } = require('y-websocket');
const vscode = require('vscode');

class YjsProvider {
  constructor(serverUrl, token, cursorProvider) {
    this.serverUrl      = serverUrl;
    this.token          = token;
    this.cursorProvider = cursorProvider;
    this.ydoc           = null;
    this.wsProvider     = null;
    this.roomId         = null;
    this._disposables   = [];
    this._seeded        = false;
  }

  async connect(roomId, editor) {
    this.roomId = roomId;
    this.ydoc   = new Y.Doc();

    const url = `${this.serverUrl}?token=${encodeURIComponent(this.token)}`;
    this.wsProvider = new WebsocketProvider(url, roomId, this.ydoc);

    const ytext = this.ydoc.getText('content');

    this.wsProvider.on('status', ({ status }) => {
      console.log(`[CollabCode] WebSocket: ${status}`);
    });

    // Wait for first sync from server, then decide whether to seed
    this.wsProvider.on('sync', (synced) => {
      if (!synced || this._seeded) return;
      this._seeded = true;

      const serverContent = ytext.toString();
      const fileContent   = editor.document.getText();

      if (serverContent.length === 0 && fileContent.length > 0) {
        // Room is empty (new session) — seed it with the file content
        this.ydoc.transact(() => {
          ytext.insert(0, fileContent);
        });
        console.log('[CollabCode] Seeded room with file content');
      } else if (serverContent.length > 0 && serverContent !== fileContent) {
        // Room has content (joiner) — replace editor with server content
        const edit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(
          editor.document.positionAt(0),
          editor.document.positionAt(fileContent.length)
        );
        edit.replace(editor.document.uri, fullRange, serverContent);
        vscode.workspace.applyEdit(edit);
        console.log('[CollabCode] Loaded room content into editor');
      }
    });

    // Remote changes → update VS Code document
    ytext.observe(() => {
      if (!editor || !editor.document) return;
      const newContent     = ytext.toString();
      const currentContent = editor.document.getText();
      if (newContent === currentContent) return;

      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(
        editor.document.positionAt(0),
        editor.document.positionAt(currentContent.length)
      );
      edit.replace(editor.document.uri, fullRange, newContent);
      vscode.workspace.applyEdit(edit);
    });

    // Local changes → push to Yjs
    const onDidChange = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document !== editor.document) return;
      this.ydoc.transact(() => {
        for (const change of e.contentChanges) {
          const start = editor.document.offsetAt(change.range.start);
          if (change.rangeLength > 0) ytext.delete(start, change.rangeLength);
          if (change.text)            ytext.insert(start, change.text);
        }
      });
    });
    this._disposables.push(onDidChange);

    // Awareness — share cursor with others
    this.wsProvider.awareness.setLocalStateField('user', {
      name:  'VS Code User',
      color: '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')
    });

    this.wsProvider.awareness.on('change', () => {
      if (!this.wsProvider) return;
      const states = Array.from(this.wsProvider.awareness.getStates().entries());
      this.cursorProvider.updateCursors(editor, states, this.wsProvider.awareness.clientID);
    });

    const onSelectionChange = vscode.window.onDidChangeTextEditorSelection((e) => {
      if (e.textEditor !== editor || !this.wsProvider) return;
      const pos = editor.document.offsetAt(e.selections[0].active);
      this.wsProvider.awareness.setLocalStateField('cursor', { anchor: pos, head: pos });
    });
    this._disposables.push(onSelectionChange);
  }

  getInviteLink() {
    return this.roomId;
  }

  disconnect() {
    this._disposables.forEach(d => d.dispose());
    this._disposables = [];
    this._seeded = false;

    if (this.wsProvider) {
      try { this.wsProvider.destroy(); } catch (_) {}
      this.wsProvider = null;
    }
    if (this.ydoc) {
      try { this.ydoc.destroy(); } catch (_) {}
      this.ydoc = null;
    }
  }
}

module.exports = { YjsProvider };