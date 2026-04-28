const vscode = require('vscode');

class CursorDecorationProvider {
  constructor() {
    // Map of clientId -> DecorationRenderOptions
    this._decorationTypes = new Map();
    // Map of clientId -> current range applied
    this._applied = new Map();
  }

  /**
   * Called whenever Yjs awareness changes.
   * states = [[clientId, awarenessState], ...]
   */
  updateCursors(editor, states, localClientId) {
    // Clear old decorations
    for (const [clientId, decType] of this._decorationTypes.entries()) {
      editor.setDecorations(decType, []);
    }

    for (const [clientId, state] of states) {
      if (clientId === localClientId) continue;
      if (!state.cursor || !state.user) continue;

      const { anchor } = state.cursor;
      const { name, color } = state.user;

      // Create decoration type per user if not exists
      if (!this._decorationTypes.has(clientId)) {
        const decType = vscode.window.createTextEditorDecorationType({
          borderWidth: '2px',
          borderStyle: 'solid',
          borderColor: color,
          after: {
            contentText: ` ${name} `,
            backgroundColor: color,
            color: '#ffffff',
            fontStyle: 'normal',
            fontWeight: 'bold',
            border: `1px solid ${color}`,
            margin: '0 0 0 2px'
          }
        });
        this._decorationTypes.set(clientId, decType);
      }

      try {
        const pos = editor.document.positionAt(anchor);
        const range = new vscode.Range(pos, pos);
        editor.setDecorations(this._decorationTypes.get(clientId), [range]);
      } catch {
        // Offset out of range — skip
      }
    }
  }

  clearAll() {
    for (const decType of this._decorationTypes.values()) {
      decType.dispose();
    }
    this._decorationTypes.clear();
    this._applied.clear();
  }
}

module.exports = { CursorDecorationProvider };