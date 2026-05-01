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
      'CollabCode — Login / Register',
      column,
      { enableScripts: true }
    );
    InvitePanel.currentPanel = new InvitePanel(panel, apiUrl, onToken);
  }

  constructor(panel, apiUrl, onToken) {
    this._panel   = panel;
    this._apiUrl  = apiUrl;
    this._onToken = onToken;
    this._panel.webview.html = this._getHtml();

    this._panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'login' || msg.type === 'register') {
        const endpoint = msg.type === 'login' ? '/auth/login' : '/auth/register';
        try {
          const res = await fetch(`${this._apiUrl}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
              msg.type === 'register'
                ? { name: msg.name, email: msg.email, password: msg.password }
                : { email: msg.email, password: msg.password }
            )
          });
          const data = await res.json();
          if (data.token) {
            this._onToken(data.token);
            this._panel.dispose();
            vscode.window.showInformationMessage(
              `CollabCode: ${msg.type === 'register' ? 'Registered and logged in' : 'Logged in'} as ${data.user.name}`
            );
          } else {
            this._panel.webview.postMessage({ type: 'error', message: data.error || 'Request failed' });
          }
        } catch (err) {
          this._panel.webview.postMessage({
            type: 'error',
            message: `Cannot reach server at ${this._apiUrl} — is it running? (${err.message})`
          });
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
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--vscode-font-family); padding: 32px 28px; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); max-width: 400px; }
    h2  { font-size: 18px; margin-bottom: 6px; }
    p   { font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 20px; }
    label  { font-size: 12px; display: block; margin-bottom: 4px; color: var(--vscode-descriptionForeground); }
    input  { width: 100%; padding: 7px 10px; margin-bottom: 14px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; font-size: 13px; }
    input:focus { outline: 1px solid var(--vscode-focusBorder); border-color: var(--vscode-focusBorder); }
    .btn { width: 100%; padding: 9px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 600; margin-top: 4px; }
    .btn:hover { background: var(--vscode-button-hoverBackground); }
    .btn-secondary { background: var(--vscode-button-secondaryBackground, #3a3d41); color: var(--vscode-button-secondaryForeground, #ccc); margin-top: 8px; }
    .tabs { display: flex; gap: 8px; margin-bottom: 20px; border-bottom: 1px solid var(--vscode-input-border); }
    .tab { padding: 7px 16px; cursor: pointer; font-size: 13px; border: none; background: none; color: var(--vscode-descriptionForeground); border-bottom: 2px solid transparent; margin-bottom: -1px; }
    .tab.active { color: var(--vscode-foreground); border-bottom-color: var(--vscode-button-background); font-weight: 600; }
    .error { color: var(--vscode-errorForeground); font-size: 12px; margin-top: 10px; padding: 8px 10px; background: var(--vscode-inputValidation-errorBackground, rgba(255,0,0,0.1)); border-radius: 4px; display: none; }
    .hint  { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 14px; text-align: center; }
    #form-register { display: none; }
  </style>
</head>
<body>
  <h2>CollabCode</h2>
  <p>Connect to your collaborative editing server</p>

  <div class="tabs">
    <button class="tab active" onclick="showTab('login')">Log In</button>
    <button class="tab"        onclick="showTab('register')">Register</button>
  </div>

  <!-- LOGIN FORM -->
  <div id="form-login">
    <label>Email</label>
    <input type="email" id="login-email" placeholder="you@example.com" />
    <label>Password</label>
    <input type="password" id="login-password" placeholder="••••••••"
           onkeydown="if(event.key==='Enter') login()" />
    <button class="btn" onclick="login()">Log In</button>
  </div>

  <!-- REGISTER FORM -->
  <div id="form-register">
    <label>Name</label>
    <input type="text" id="reg-name" placeholder="Your name" />
    <label>Email</label>
    <input type="email" id="reg-email" placeholder="you@example.com" />
    <label>Password</label>
    <input type="password" id="reg-password" placeholder="Min 6 characters"
           onkeydown="if(event.key==='Enter') register()" />
    <button class="btn" onclick="register()">Create Account</button>
  </div>

  <div class="error" id="err"></div>
  <p class="hint" id="server-hint">Connecting to server…</p>

  <script>
    const vscode = acquireVsCodeApi();

    function showTab(tab) {
      document.getElementById('form-login').style.display    = tab === 'login'    ? 'block' : 'none';
      document.getElementById('form-register').style.display = tab === 'register' ? 'block' : 'none';
      document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', (i===0) === (tab==='login')));
      document.getElementById('err').style.display = 'none';
    }

    function showError(msg) {
      const el = document.getElementById('err');
      el.textContent = msg;
      el.style.display = 'block';
    }

    function login() {
      const email    = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      if (!email || !password) return showError('Both fields are required');
      vscode.postMessage({ type: 'login', email, password });
    }

    function register() {
      const name     = document.getElementById('reg-name').value.trim();
      const email    = document.getElementById('reg-email').value.trim();
      const password = document.getElementById('reg-password').value;
      if (!name || !email || !password) return showError('All fields are required');
      if (password.length < 6) return showError('Password must be at least 6 characters');
      vscode.postMessage({ type: 'register', name, email, password });
    }

    window.addEventListener('message', e => {
      if (e.data.type === 'error') showError(e.data.message);
    });

    // Check connectivity hint
    document.getElementById('server-hint').textContent = 'Make sure the server is running on port 4000';
  </script>
</body>
</html>`;
  }
}

module.exports = { InvitePanel };