const vscode = require('vscode');
const axios  = require('axios');
const { CursorDecorationProvider } = require('./providers/CursorDecorationProvider');
const { SessionTreeProvider }      = require('./providers/SessionTreeProvider');
const { StatusBarProvider }        = require('./providers/StatusBarProvider');
const { YjsProvider }              = require('./sync/yjsProvider');

let yjsProvider = null;
let statusBar   = null;

function activate(context) {
  console.log('[CollabCode] Extension activated');

  const config    = vscode.workspace.getConfiguration('collabcode');
  const serverUrl = config.get('serverUrl');   // ws://localhost:4000/collab
  const apiUrl    = config.get('apiUrl');       // http://localhost:4000/api

  const cursorProvider = new CursorDecorationProvider();
  statusBar            = new StatusBarProvider();

  const getToken = () => context.globalState.get('collabcode.token') || null;
  const getUser  = () => context.globalState.get('collabcode.user')  || null;

  const sessionTree = new SessionTreeProvider(apiUrl, getToken);
  vscode.window.registerTreeDataProvider('collabcode.sessions', sessionTree);
  context.subscriptions.push(statusBar.item);

  // ── Helper: login or register using native VS Code input boxes (no webview needed) ──
  async function ensureLoggedIn() {
    const existing = getToken();
    if (existing) return existing;

    const action = await vscode.window.showQuickPick(
      ['Log in to existing account', 'Register new account'],
      { placeHolder: 'CollabCode: Choose an option' }
    );
    if (!action) return null;

    if (action.startsWith('Register')) {
      // Register flow
      const name = await vscode.window.showInputBox({ prompt: 'Your name', placeHolder: 'e.g. Priya' });
      if (!name) return null;
      const email = await vscode.window.showInputBox({ prompt: 'Email', placeHolder: 'you@example.com' });
      if (!email) return null;
      const password = await vscode.window.showInputBox({ prompt: 'Password (min 6 chars)', password: true });
      if (!password) return null;

      try {
        const res = await axios.post(`${apiUrl}/auth/register`, { name, email, password });
        await context.globalState.update('collabcode.token', res.data.token);
        await context.globalState.update('collabcode.user',  res.data.user);
        vscode.window.showInformationMessage(`CollabCode: Registered as ${res.data.user.name} ✓`);
        return res.data.token;
      } catch (err) {
        const msg = err.response?.data?.error || err.message;
        vscode.window.showErrorMessage(`CollabCode Register failed: ${msg}`);
        return null;
      }
    } else {
      // Login flow
      const email = await vscode.window.showInputBox({ prompt: 'Email', placeHolder: 'you@example.com' });
      if (!email) return null;
      const password = await vscode.window.showInputBox({ prompt: 'Password', password: true });
      if (!password) return null;

      try {
        const res = await axios.post(`${apiUrl}/auth/login`, { email, password });
        await context.globalState.update('collabcode.token', res.data.token);
        await context.globalState.update('collabcode.user',  res.data.user);
        vscode.window.showInformationMessage(`CollabCode: Logged in as ${res.data.user.name} ✓`);
        return res.data.token;
      } catch (err) {
        const msg = err.response?.data?.error || err.message;
        vscode.window.showErrorMessage(`CollabCode Login failed: ${msg}`);
        return null;
      }
    }
  }

  // ── Command: Start Session ──
  context.subscriptions.push(
    vscode.commands.registerCommand('collabcode.startSession', async () => {
      const token = await ensureLoggedIn();
      if (!token) return;

      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('CollabCode: Open a file first, then start a session');
        return;
      }

      const name = await vscode.window.showInputBox({
        prompt: 'Session name',
        placeHolder: 'e.g. "My project collab"'
      });
      if (!name) return;

      // Create session on server
      try {
        await axios.post(`${apiUrl}/sessions`, { name }, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (err) {
        // Non-fatal — session may already exist or we use roomId as name
        console.log('[CollabCode] Session create note:', err.response?.data?.error || err.message);
      }

      // Connect Yjs
      if (yjsProvider) yjsProvider.disconnect();
      yjsProvider = new YjsProvider(serverUrl, token, cursorProvider);
      await yjsProvider.connect(name, editor);

      statusBar.setActive(name);
      sessionTree.refresh();
      vscode.window.showInformationMessage(`CollabCode: Session "${name}" started — share the Room ID: ${name}`);
    })
  );

  // ── Command: Join Session ──
  context.subscriptions.push(
    vscode.commands.registerCommand('collabcode.joinSession', async (roomIdArg) => {
      const token = await ensureLoggedIn();
      if (!token) return;

      const roomId = roomIdArg || await vscode.window.showInputBox({
        prompt: 'Room ID to join',
        placeHolder: 'Paste the session name or room ID'
      });
      if (!roomId) return;

      let editor = vscode.window.activeTextEditor;
      if (!editor) {
        const doc = await vscode.workspace.openTextDocument({ content: '', language: 'plaintext' });
        editor = await vscode.window.showTextDocument(doc);
      }

      if (yjsProvider) yjsProvider.disconnect();
      yjsProvider = new YjsProvider(serverUrl, token, cursorProvider);
      await yjsProvider.connect(roomId, editor);

      statusBar.setActive(roomId);
      vscode.window.showInformationMessage(`CollabCode: Joined room "${roomId}"`);
    })
  );

  // ── Command: Leave Session ──
  context.subscriptions.push(
    vscode.commands.registerCommand('collabcode.leaveSession', () => {
      if (yjsProvider) { yjsProvider.disconnect(); yjsProvider = null; }
      statusBar.setIdle();
      cursorProvider.clearAll();
      vscode.window.showInformationMessage('CollabCode: Left session');
    })
  );

  // ── Command: Copy Invite ──
  context.subscriptions.push(
    vscode.commands.registerCommand('collabcode.copyInvite', async () => {
      if (!yjsProvider) {
        vscode.window.showWarningMessage('CollabCode: No active session');
        return;
      }
      const link = yjsProvider.getInviteLink();
      await vscode.env.clipboard.writeText(link);
      vscode.window.showInformationMessage(`CollabCode: Room ID copied — ${link}`);
    })
  );

  // ── Command: Logout ──
  context.subscriptions.push(
    vscode.commands.registerCommand('collabcode.logout', async () => {
      await context.globalState.update('collabcode.token', null);
      await context.globalState.update('collabcode.user', null);
      if (yjsProvider) { yjsProvider.disconnect(); yjsProvider = null; }
      statusBar.setIdle();
      vscode.window.showInformationMessage('CollabCode: Logged out');
    })
  );
}

function deactivate() {
  if (yjsProvider) yjsProvider.disconnect();
  if (statusBar)   statusBar.item.dispose();
}

module.exports = { activate, deactivate };