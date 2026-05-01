const vscode = require('vscode');
const axios = require('axios');

class SessionItem extends vscode.TreeItem {
  constructor(session) {
    super(session.name, vscode.TreeItemCollapsibleState.None);
    this.description = `Room: ${session.roomId}`;
    this.tooltip = `Owner: ${session.owner?.name || 'Unknown'}\nRoom ID: ${session.roomId}`;
    this.contextValue = 'session';
    this.iconPath = new vscode.ThemeIcon('organization');
    this.session = session;
    this.command = {
      command: 'collabcode.joinSession',
      title: 'Join Session',
      arguments: [session.roomId]
    };
  }
}

class SessionTreeProvider {
  // BUG 14 FIX: accept a getToken function instead of calling an unregistered command
  constructor(apiUrl, getToken) {
    this.apiUrl = apiUrl;
    this.getToken = getToken;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this._sessions = [];
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    return element;
  }

  async getChildren() {
    try {
      const token = this.getToken();
      if (!token) return [new vscode.TreeItem('Log in to see sessions')];

      const res = await axios.get(`${this.apiUrl}/sessions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      this._sessions = res.data;
      if (this._sessions.length === 0) {
        return [new vscode.TreeItem('No active sessions')];
      }
      return this._sessions.map(s => new SessionItem(s));
    } catch (err) {
      return [new vscode.TreeItem(`Error: ${err.message}`)];
    }
  }
}

module.exports = { SessionTreeProvider };
