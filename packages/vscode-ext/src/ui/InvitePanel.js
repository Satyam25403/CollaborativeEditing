const vscode = require('vscode');

class InvitePanel {
  static currentPanel = null;

  static createOrShow(extensionUri, apiUrl, onToken) {
    const column = vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One;

    if (InvitePanel.currentPanel) {
      InvitePanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'collabcodeLogin',
      'CollabCode — Login',
      column,
      { enableScripts: true }
    );

    InvitePanel.currentPanel = new InvitePanel(panel, apiUrl, onToken);
  }

  constructor(panel, apiUrl, onToken) {
    this._panel = panel;
    this._apiUrl = apiUrl;
    this._onToken = onToken;

    this._panel.webview.html = this._getHtml();

    this._panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'login') {
        try {
          const res = await fetch(`${this._apiUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: msg.email, password: msg.password })
          });
          const data = await res.json();
          if (data.token) {
            this._onToken(data.token);
            this._panel.dispose();
          } else {
            this._panel.webview.postMessage({ type: 'error', message: data.error || 'Login failed' });
          }
        } catch (err) {
          this._panel.webview.postMessage({ type: 'error', message: err.message });
        }
      }
    });

    this._panel.onDidDispose(() => { InvitePanel.currentPanel = null; });
  }

  _getHtml() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <style>
    body { font-family: var(--vscode-font-family); padding: 24px; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); }
    input { width: 100%; padding: 8px; margin: 8px 0 16px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; box-sizing: border-box; }
    button { padding: 8px 20px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .error { color: var(--vscode-errorForeground); margin-top: 12px; }
    h2 { margin-top: 0; }
  </style>
</head>
<body>
  <h2>CollabCode Login</h2>
  <label>Email</label>
  <input type="email" id="email" placeholder="you@example.com"/>
  <label>Password</label>
  <input type="password" id="password" placeholder="••••••••"/>
  <button onclick="login()">Log In</button>
  <div class="error" id="err"></div>
  <script>
    const vscode = acquireVsCodeApi();
    function login() {
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      if (!email || !password) { document.getElementById('err').textContent = 'All fields required'; return; }
      vscode.postMessage({ type: 'login', email, password });
    }
    window.addEventListener('message', e => {
      if (e.data.type === 'error') document.getElementById('err').textContent = e.data.message;
    });
  </script>
</body>
</html>`;
  }
}

module.exports = { InvitePanel };