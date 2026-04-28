const vscode = require('vscode');

class StatusBarProvider {
  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.setIdle();
    this.item.show();
  }

  setIdle() {
    this.item.text = '$(plug) CollabCode: Offline';
    this.item.tooltip = 'Click to start a session';
    this.item.command = 'collabcode.startSession';
    this.item.backgroundColor = undefined;
  }

  setActive(roomName) {
    this.item.text = `$(organization) CollabCode: ${roomName}`;
    this.item.tooltip = 'Collaborative session active — click to leave';
    this.item.command = 'collabcode.leaveSession';
    this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  }

  setConnecting() {
    this.item.text = '$(sync~spin) CollabCode: Connecting...';
    this.item.command = undefined;
    this.item.backgroundColor = undefined;
  }
}

module.exports = { StatusBarProvider };