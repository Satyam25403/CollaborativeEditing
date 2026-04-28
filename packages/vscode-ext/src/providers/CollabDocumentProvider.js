const vscode = require('vscode');

class CollabDocumentProvider {
  constructor() {
    this._onDidChange = new vscode.EventEmitter();
    this.onDidChange = this._onDidChange.event;
    this._docs = new Map(); // uri string -> { ytext, content }
  }

  /**
   * Register a ytext (Y.Text) against a document URI.
   * From this point on, any ytext observation fires a document change.
   */
  bind(uri, ytext) {
    const uriStr = uri.toString();
    this._docs.set(uriStr, { ytext, content: ytext.toString() });

    ytext.observe(() => {
      const entry = this._docs.get(uriStr);
      if (entry) {
        entry.content = ytext.toString();
        this._onDidChange.fire(uri);
      }
    });
  }

  unbind(uri) {
    this._docs.delete(uri.toString());
  }

  provideTextDocumentContent(uri) {
    const entry = this._docs.get(uri.toString());
    return entry ? entry.content : '';
  }

  dispose() {
    this._onDidChange.dispose();
    this._docs.clear();
  }
}

module.exports = { CollabDocumentProvider };