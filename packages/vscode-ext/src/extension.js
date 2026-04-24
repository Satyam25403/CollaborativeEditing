const vscode = require('vscode');
const { CollabDocumentProvider } = require('./providers/CollabDocumentProvider');
const { CursorDecorationProvider } = require('./providers/CursorDecorationProvider');
const { SessionTreeProvider } = require('./providers/SessionTreeProvider');
const { StatusBarProvider } = require('./providers/StatusBarProvider');
const { InvitePanel } = require('./ui/InvitePanel');
const { YjsProvider } = require('./sync/yjsProvider');

let yjsProvider = null;
let statusBar = null;

function activate(context) {
  console.log('[CollabCode] Extension activated');

  const config = vscode.workspace.getConfiguration('collabcode');
  const serverUrl = config.get('serverUrl');
  const apiUrl = config.get('apiUrl');

  // Providers
  const sessionTree = new SessionTreeProvider(apiUrl);
  const cursorProvider = new CursorDecorationProvider();
  statusBar = new StatusBarProvider();

  // Register tree view
  vscode.window.registerTreeDataProvider('collabcode.sessions', sessionTree);
  context.subscriptions.push(statusBar.item);

  // ── Commands ────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('collabcode.startSession', async () => {
      const token = await getStoredToken(context);
      if (!token) return promptLogin(context, apiUrl);

      const name = await vscode.window.showInputBox({ prompt: 'Session name' });
      if (!name) return;

      const editor = vscode.window.activeTextEditor;
      if (!editor) return vscode.window.showWarningMessage('Open a file first');

      yjsProvider = new YjsProvider(serverUrl, token, cursorProvider);
      await yjsProvider.connect(name, editor);

      statusBar.setActive(name);
      sessionTree.refresh();
      vscode.window.showInformationMessage(`CollabCode: Session "${name}" started`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('collabcode.joinSession', async () => {
      const token = await getStoredToken(context);
      if (!token) return promptLogin(context, apiUrl);

      const roomId = await vscode.window.showInputBox({ prompt: 'Enter Room ID or invite link' });
      if (!roomId) return;

      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        const doc = await vscode.workspace.openTextDocument({ content: '', language: 'plaintext' });
        await vscode.window.showTextDocument(doc);
      }

      yjsProvider = new YjsProvider(serverUrl, token, cursorProvider);
      await yjsProvider.connect(roomId, vscode.window.activeTextEditor);

      statusBar.setActive(roomId);
      vscode.window.showInformationMessage(`CollabCode: Joined room "${roomId}"`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('collabcode.leaveSession', () => {
      if (yjsProvider) {
        yjsProvider.disconnect();
        yjsProvider = null;
      }
      statusBar.setIdle();
      cursorProvider.clearAll();
      vscode.window.showInformationMessage('CollabCode: Left session');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('collabcode.copyInvite', async () => {
      if (!yjsProvider) return vscode.window.showWarningMessage('No active session');
      const link = yjsProvider.getInviteLink();
      await vscode.env.clipboard.writeText(link);
      vscode.window.showInformationMessage('Invite link copied to clipboard');
    })
  );
}

function deactivate() {
  if (yjsProvider) yjsProvider.disconnect();
  if (statusBar) statusBar.item.dispose();
}

async function getStoredToken(context) {
  return context.globalState.get('collabcode.token') || null;
}

async function promptLogin(context, apiUrl) {
  const choice = await vscode.window.showInformationMessage(
    'CollabCode: Please log in first',
    'Log in'
  );
  if (choice === 'Log in') {
    InvitePanel.createOrShow(context.extensionUri, apiUrl, async (token) => {
      await context.globalState.update('collabcode.token', token);
      vscode.window.showInformationMessage('CollabCode: Logged in');
    });
  }
}

module.exports = { activate, deactivate };