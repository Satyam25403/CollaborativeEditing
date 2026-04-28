const Y = require('yjs');
const { WebsocketProvider } = require('y-websocket');
const vscode = require('vscode');

class YjsProvider {
  constructor(serverUrl, token, cursorProvider) {
    this.serverUrl = serverUrl;
    this.token = token;
    this.cursorProvider = cursorProvider;
    this.ydoc = null;
    this.wsProvider = null;
    this.roomId = null;
    this._disposables = [];
  }

  async connect(roomId, editor) {
    this.roomId = roomId;
    this.ydoc = new Y.Doc();

    const url = `${this.serverUrl}?token=${this.token}`;
    this.wsProvider = new WebsocketProvider(url, roomId, this.ydoc);

    const ytext = this.ydoc.getText('content');

    this.wsProvider.on('status', ({ status }) => {
      console.log(`[YjsProvider] Status: ${status}`);
    });

    // When remote changes arrive, update the VS Code document
    ytext.observe(() => {
      const newContent = ytext.toString();
      const currentContent = editor.document.getText();
      if (newContent !== currentContent) {
        const edit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(
          editor.document.positionAt(0),
          editor.document.positionAt(currentContent.length)
        );
        edit.replace(editor.document.uri, fullRange, newContent);
        vscode.workspace.applyEdit(edit);
      }
    });

    // When local changes happen, push to Yjs
    const onDidChange = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document !== editor.document) return;
      this.ydoc.transact(() => {
        for (const change of e.contentChanges) {
          const start = editor.document.offsetAt(change.range.start);
          const deleteCount = change.rangeLength;
          if (deleteCount > 0) ytext.delete(start, deleteCount);
          if (change.text) ytext.insert(start, change.text);
        }
      });
    });
    this._disposables.push(onDidChange);

    // Awareness — share cursor position with other users
    this.wsProvider.awareness.setLocalStateField('user', {
      name: 'VS Code User',
      color: '#' + Math.floor(Math.random() * 0xffffff).toString(16)
    });

    this.wsProvider.awareness.on('change', () => {
      const states = Array.from(this.wsProvider.awareness.getStates().entries());
      this.cursorProvider.updateCursors(editor, states, this.wsProvider.awareness.clientID);
    });

    // Track cursor movement
    const onSelectionChange = vscode.window.onDidChangeTextEditorSelection((e) => {
      if (e.textEditor !== editor) return;
      const pos = editor.document.offsetAt(e.selections[0].active);
      this.wsProvider.awareness.setLocalStateField('cursor', { anchor: pos, head: pos });
    });
    this._disposables.push(onSelectionChange);
  }

  getInviteLink() {
    return `${process.env.CLIENT_URL || 'http://localhost:5173'}/join/${this.roomId}`;
  }

  disconnect() {
    if (this.wsProvider) {
      this.wsProvider.destroy();
      this.wsProvider = null;
    }
    if (this.ydoc) {
      this.ydoc.destroy();
      this.ydoc = null;
    }
    this._disposables.forEach(d => d.dispose());
    this._disposables = [];
  }
}

module.exports = { YjsProvider };