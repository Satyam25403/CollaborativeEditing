const vscode = require('vscode');
const axios  = require('axios');
const { CursorDecorationProvider }    = require('./providers/CursorDecorationProvider');
const { SessionTreeProvider }         = require('./providers/SessionTreeProvider');
const { StatusBarProvider }           = require('./providers/StatusBarProvider');
const { CollabFileSystemProvider }    = require('./providers/CollabFileSystemProvider');
const { YjsProvider }                 = require('./sync/yjsProvider');

let yjsProvider  = null;
let statusBar    = null;
let collabFs     = null;
let fsSub        = null;   // FileSystemProvider disposable

function activate(context) {
  console.log('[CollabCode] Extension activated');

  const config    = vscode.workspace.getConfiguration('collabcode');
  const serverUrl = config.get('serverUrl');  // ws://localhost:4000/collab
  const apiUrl    = config.get('apiUrl');     // http://localhost:4000/api

  const cursorProvider = new CursorDecorationProvider();
  statusBar            = new StatusBarProvider();
  context.subscriptions.push(statusBar.item);

  const getToken = () => context.globalState.get('collabcode.token') || null;
  const getUser  = () => context.globalState.get('collabcode.user')  || null;

  // Register the virtual filesystem provider for collab:/ URIs
  collabFs = new CollabFileSystemProvider();
  fsSub    = vscode.workspace.registerFileSystemProvider('collab', collabFs, {
    isCaseSensitive: true,
    isReadonly:      false
  });
  context.subscriptions.push(fsSub);

  const sessionTree = new SessionTreeProvider(apiUrl, getToken);
  vscode.window.registerTreeDataProvider('collabcode.sessions', sessionTree);

  // ── Auth helper ───────────────────────────────────────────────────────────
  async function ensureLoggedIn() {
    const existing = getToken();
    if (existing) return existing;

    const action = await vscode.window.showQuickPick(
      ['Log in to existing account', 'Register new account'],
      { placeHolder: 'CollabCode: Choose an option' }
    );
    if (!action) return null;

    if (action.startsWith('Register')) {
      const name     = await vscode.window.showInputBox({ prompt: 'Your name' });
      if (!name) return null;
      const email    = await vscode.window.showInputBox({ prompt: 'Email' });
      if (!email) return null;
      const password = await vscode.window.showInputBox({ prompt: 'Password (min 6)', password: true });
      if (!password) return null;
      try {
        const res = await axios.post(`${apiUrl}/auth/register`, { name, email, password });
        await context.globalState.update('collabcode.token', res.data.token);
        await context.globalState.update('collabcode.user',  res.data.user);
        vscode.window.showInformationMessage(`CollabCode: Registered as ${res.data.user.name} ✓`);
        return res.data.token;
      } catch (err) {
        vscode.window.showErrorMessage(`CollabCode: ${err.response?.data?.error || err.message}`);
        return null;
      }
    } else {
      const email    = await vscode.window.showInputBox({ prompt: 'Email' });
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
        vscode.window.showErrorMessage(`CollabCode: ${err.response?.data?.error || err.message}`);
        return null;
      }
    }
  }

  // ── Command: Start Session (single file) ──────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('collabcode.startSession', async () => {
      const token = await ensureLoggedIn();
      if (!token) return;

      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('CollabCode: Open a file first');
        return;
      }

      const name = await vscode.window.showInputBox({ prompt: 'Session name' });
      if (!name) return;

      let roomId = name;
      try {
        const res = await axios.post(`${apiUrl}/sessions`, { name }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        roomId = res.data.roomId;
      } catch (err) {
        console.warn('[CollabCode] Session create failed:', err.message);
      }

      if (yjsProvider) yjsProvider.disconnect();
      yjsProvider = new YjsProvider(serverUrl, token, cursorProvider, collabFs, getUser());
      await yjsProvider.connect(roomId, editor);

      statusBar.setActive(name);
      sessionTree.refresh();
      vscode.window.showInformationMessage(`CollabCode: Session started — Room ID: ${roomId}`);
    })
  );

  // ── Command: Host Project (entire workspace folder) ───────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('collabcode.hostProject', async () => {
      const token = await ensureLoggedIn();
      if (!token) return;

      // Pick which workspace folder to share
      const folders = vscode.workspace.workspaceFolders;
      let workspaceFolder;
      if (!folders || folders.length === 0) {
        // No folder open — let user pick one
        const chosen = await vscode.window.showOpenDialog({
          canSelectFolders: true,
          canSelectFiles:   false,
          openLabel:        'Share this folder'
        });
        if (!chosen || chosen.length === 0) return;
        workspaceFolder = chosen[0].fsPath;
      } else if (folders.length === 1) {
        workspaceFolder = folders[0].uri.fsPath;
      } else {
        const pick = await vscode.window.showQuickPick(
          folders.map(f => ({ label: f.name, description: f.uri.fsPath, fsPath: f.uri.fsPath })),
          { placeHolder: 'Which folder do you want to share?' }
        );
        if (!pick) return;
        workspaceFolder = pick.fsPath;
      }

      const name = await vscode.window.showInputBox({
        prompt:      'Session name',
        placeHolder: 'e.g. "My webapp collab"'
      });
      if (!name) return;

      let roomId = name;
      try {
        const res = await axios.post(`${apiUrl}/sessions`, { name }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        roomId = res.data.roomId;
      } catch (err) {
        console.warn('[CollabCode] Session create failed:', err.message);
      }

      if (yjsProvider) yjsProvider.disconnect();
      yjsProvider = new YjsProvider(serverUrl, token, cursorProvider, collabFs, getUser());
      const fileCount = await yjsProvider.hostProject(roomId, workspaceFolder);

      statusBar.setActive(name);
      sessionTree.refresh();

      // Show Room ID prominently so host can share it
      const action = await vscode.window.showInformationMessage(
        `CollabCode: Hosting ${fileCount} files — Room ID: ${roomId}`,
        'Copy Room ID'
      );
      if (action === 'Copy Room ID') {
        await vscode.env.clipboard.writeText(roomId);
        vscode.window.showInformationMessage('Room ID copied to clipboard!');
      }
    })
  );

  // ── Command: Join Project (entire project via virtual FS) ─────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('collabcode.joinProject', async (roomIdArg) => {
      const token = await ensureLoggedIn();
      if (!token) return;

      const roomId = roomIdArg || await vscode.window.showInputBox({
        prompt:      'Room ID',
        placeHolder: 'Paste the Room ID shared by the host'
      });
      if (!roomId) return;

      if (yjsProvider) yjsProvider.disconnect();
      yjsProvider = new YjsProvider(serverUrl, token, cursorProvider, collabFs, getUser());
      await yjsProvider.joinProject(roomId);

      statusBar.setActive(roomId.slice(0, 8) + '…');
      vscode.window.showInformationMessage('CollabCode: Joining project — loading files…');
    })
  );

  // ── Command: Join Session (single file, backward compat) ──────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('collabcode.joinSession', async (roomIdArg) => {
      const token = await ensureLoggedIn();
      if (!token) return;

      const roomId = roomIdArg || await vscode.window.showInputBox({
        prompt:      'Room ID to join',
        placeHolder: 'Paste the Room ID shared by the host'
      });
      if (!roomId) return;

      let editor = vscode.window.activeTextEditor;
      if (!editor) {
        const doc = await vscode.workspace.openTextDocument({ content: '', language: 'plaintext' });
        editor = await vscode.window.showTextDocument(doc);
      }

      if (yjsProvider) yjsProvider.disconnect();
      yjsProvider = new YjsProvider(serverUrl, token, cursorProvider, collabFs, getUser());
      await yjsProvider.connect(roomId, editor);

      statusBar.setActive(roomId.slice(0, 8) + '…');
      vscode.window.showInformationMessage(`CollabCode: Joined room "${roomId}"`);
    })
  );

  // ── Command: Leave Session ────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('collabcode.leaveSession', () => {
      if (yjsProvider) { yjsProvider.disconnect(); yjsProvider = null; }
      statusBar.setIdle();
      cursorProvider.clearAll();
      vscode.window.showInformationMessage('CollabCode: Left session');
    })
  );

  // ── Command: Copy Invite ──────────────────────────────────────────────────
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

  // ── Command: Logout ───────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('collabcode.logout', async () => {
      await context.globalState.update('collabcode.token', null);
      await context.globalState.update('collabcode.user',  null);
      if (yjsProvider) { yjsProvider.disconnect(); yjsProvider = null; }
      statusBar.setIdle();
      vscode.window.showInformationMessage('CollabCode: Logged out');
    })
  );
}

function deactivate() {
  if (yjsProvider) yjsProvider.disconnect();
  if (collabFs)    collabFs.dispose();
  if (statusBar)   statusBar.item.dispose();
}

module.exports = { activate, deactivate };