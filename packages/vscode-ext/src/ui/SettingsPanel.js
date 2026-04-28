const vscode = require('vscode');

class SettingsPanel {
  static createOrShow(extensionUri) {
    const panel = vscode.window.createWebviewPanel(
      'collabcodeSettings',
      'CollabCode — Settings',
      vscode.ViewColumn.One,
      { enableScripts: true }
    );

    panel.webview.html = SettingsPanel._getHtml();

    panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'save') {
        const config = vscode.workspace.getConfiguration('collabcode');
        await config.update('serverUrl', msg.serverUrl, vscode.ConfigurationTarget.Global);
        await config.update('apiUrl', msg.apiUrl, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage('CollabCode settings saved');
        panel.dispose();
      }
    });
  }

  static _getHtml() {
    const config = vscode.workspace.getConfiguration('collabcode');
    const serverUrl = config.get('serverUrl');
    const apiUrl = config.get('apiUrl');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <style>
    body { font-family: var(--vscode-font-family); padding: 24px; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); }
    input { width: 100%; padding: 8px; margin: 8px 0 16px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; box-sizing: border-box; }
    button { padding: 8px 20px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; }
    h2 { margin-top: 0; }
  </style>
</head>
<body>
  <h2>CollabCode Settings</h2>
  <label>WebSocket Server URL</label>
  <input id="serverUrl" value="${serverUrl}"/>
  <label>REST API URL</label>
  <input id="apiUrl" value="${apiUrl}"/>
  <button onclick="save()">Save</button>
  <script>
    const vscode = acquireVsCodeApi();
    function save() {
      vscode.postMessage({
        type: 'save',
        serverUrl: document.getElementById('serverUrl').value,
        apiUrl: document.getElementById('apiUrl').value
      });
    }
  </script>
</body>
</html>`;
  }
}

module.exports = { SettingsPanel };