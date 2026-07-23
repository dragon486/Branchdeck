import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as http from 'http';

export function activate(context: vscode.ExtensionContext) {
  console.log('Branchdeck Extension is now active!');

  // Register command to display the main workspace analyzer view
  let showMapDisposable = vscode.commands.registerCommand('branchdeck.showProjectMap', () => {
    BranchdeckPanel.createOrShow(context.extensionUri);
  });
  context.subscriptions.push(showMapDisposable);

  // Register editor selection helpers
  let analyzeFnDisposable = vscode.commands.registerCommand('branchdeck.analyzeFunction', () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const selection = editor.document.getText(editor.selection);
    if (!selection) {
      vscode.window.showInformationMessage('Please highlight a function name to analyze call flow.');
      return;
    }

    BranchdeckPanel.createOrShow(context.extensionUri);
    BranchdeckPanel.currentPanel?.postMessage({
      command: 'analyzeFunction',
      value: selection
    });
  });
  context.subscriptions.push(analyzeFnDisposable);

  let impactAnalysisDisposable = vscode.commands.registerCommand('branchdeck.impactAnalysis', () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const selection = editor.document.getText(editor.selection);
    if (!selection) {
      vscode.window.showInformationMessage('Please select a symbol to analyze impact risks.');
      return;
    }

    BranchdeckPanel.createOrShow(context.extensionUri);
    BranchdeckPanel.currentPanel?.postMessage({
      command: 'impactAnalysis',
      value: selection
    });
  });
  context.subscriptions.push(impactAnalysisDisposable);

  let storyModeDisposable = vscode.commands.registerCommand('branchdeck.storyMode', () => {
    BranchdeckPanel.createOrShow(context.extensionUri);
    BranchdeckPanel.currentPanel?.postMessage({
      command: 'storyMode'
    });
  });
  context.subscriptions.push(storyModeDisposable);
}

// Manages the VS Code Webview container panel
class BranchdeckPanel {
  public static currentPanel: BranchdeckPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (BranchdeckPanel.currentPanel) {
      BranchdeckPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'branchdeckMap',
      'Branchdeck: Codebase Map',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.file(path.join(extensionUri.fsPath, 'media'))]
      }
    );

    const logoUri = vscode.Uri.file(path.join(extensionUri.fsPath, 'media', 'icon.png'));
    panel.iconPath = logoUri;

    BranchdeckPanel.currentPanel = new BranchdeckPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, _extensionUri: vscode.Uri) {
    this._panel = panel;

    // Set html source content
    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Listen to messages from Webview panel
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'alert':
            vscode.window.showErrorMessage(message.text);
            return;
          case 'scanWorkspace':
            try {
              const workspaceFiles = await this._scanWorkspaceFiles();
              const foldersForScan = vscode.workspace.workspaceFolders;
              const workspacePath = (foldersForScan && foldersForScan.length > 0) 
                ? foldersForScan[0].uri.fsPath 
                : '';
              this.postMessage({
                command: 'workspaceFiles',
                value: workspaceFiles,
                workspacePath: workspacePath
              });
            } catch (err: any) {
              vscode.window.showErrorMessage(`Failed to scan workspace: ${err.message}`);
            }
            return;
          case 'openFile':
            try {
              const filePath = message.file;
              const workspaceFolders = vscode.workspace.workspaceFolders;
              if (workspaceFolders && workspaceFolders.length > 0 && filePath) {
                const fullPath = path.join(workspaceFolders[0].uri.fsPath, filePath);
                if (fs.existsSync(fullPath) && fs.lstatSync(fullPath).isFile()) {
                  const openUri = vscode.Uri.file(fullPath);
                  const doc = await vscode.workspace.openTextDocument(openUri);
                  await vscode.window.showTextDocument(doc, { 
                    viewColumn: vscode.ViewColumn.Beside,
                    preview: false 
                  });
                } else {
                  vscode.window.showWarningMessage(`Cannot open: ${filePath} is not a valid file on disk.`);
                }
              }
            } catch (err: any) {
              vscode.window.showErrorMessage(`Failed to open file: ${err.message}`);
            }
            return;
        }
      },
      null,
      this._disposables
    );
  }

  public postMessage(message: any) {
    this._panel.webview.postMessage(message);
  }

  private async _scanWorkspaceFiles(): Promise<string[]> {
    const files = await vscode.workspace.findFiles(
      '**/*.{ts,tsx,js,jsx,py,go,java,kt,swift,rs,rb,php,cpp,h,cs,dart}',
      '{**/node_modules/**,**/.next/**,**/dist/**,**/build/**,**/out/**,**/.git/**}'
    );
    return files.map(file => vscode.workspace.asRelativePath(file));
  }

  private async _update() {
    try {
      const port = await this._findBranchdeckPort();
      this._panel.webview.html = this._getHtmlForWebview(port);
    } catch (e) {
      this._panel.webview.html = this._getHtmlForWebview(null);
    }
  }

  private _findBranchdeckPort(): Promise<number | null> {
    const ports = [3000, 3001, 3002, 3003];
    const hosts = ['127.0.0.1', 'localhost'];

    return new Promise((resolve) => {
      let resolved = false;

      const finish = (port: number | null) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(port);
        }
      };

      // Fast fallback to null after 400ms (loads production Vercel webapp)
      const timer = setTimeout(() => {
        finish(null);
      }, 400);

      for (const p of ports) {
        for (const h of hosts) {
          try {
            const req = http.get({
              hostname: h,
              port: p,
              path: '/',
              timeout: 1500
            }, (res) => {
              if (res.statusCode !== undefined) {
                finish(p);
              }
              res.resume();
            });

            req.on('error', () => {});
            req.on('timeout', () => req.destroy());
          } catch (err) {
            // Ignore synchronous errors
          }
        }
      }
    });
  }

  private _getHtmlForWebview(port: number | null) {
    const nonce = crypto.randomBytes(16).toString('base64');
    const targetUrl = port ? `http://127.0.0.1:${port}?ide=vscode` : `https://branchdeck.vercel.app?ide=vscode`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;">
  <title>Branchdeck</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #090d16; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    iframe { width: 100%; height: 100%; border: none; display: block; background: #090d16; }
  </style>
</head>
<body>

  <iframe id="webapp-frame" src="${targetUrl}"></iframe>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const iframe = document.getElementById('webapp-frame');

    // Forward messages between extension host and webapp iframe
    window.addEventListener('message', event => {
      const message = event.data;
      if (message && message.command) {
        const isFromExtension = message.source === 'branchdeck-extension'
          || !event.origin
          || event.origin === 'null'
          || (!event.origin.includes('127.0.0.1')
            && !event.origin.includes('localhost')
            && !event.origin.includes('vercel.app'));

        if (isFromExtension) {
          if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({ source: 'branchdeck-extension', ...message }, '*');
          }
        } else {
          vscode.postMessage(message);
        }
      }
    });
  </script>
</body>
</html>`;
  }

  public dispose() {
    BranchdeckPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) x.dispose();
    }
  }
}
