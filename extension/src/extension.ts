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
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

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

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

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
    // Show loading state first
    this._panel.webview.html = this._getHtmlForWebview(null, true);
    
    try {
      const port = await this._findBranchdeckPort();
      this._panel.webview.html = this._getHtmlForWebview(port, false);
    } catch (e) {
      this._panel.webview.html = this._getHtmlForWebview(null, false);
    }
  }

  private _findBranchdeckPort(): Promise<number> {
    const ports = [3000, 3001, 3002, 3003];
    const hosts = ['127.0.0.1', 'localhost'];

    return new Promise((resolve) => {
      let resolved = false;

      const finish = (port: number) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(port);
        }
      };

      // Fallback: default to 3000 after 2500ms
      const timer = setTimeout(() => {
        finish(3000);
      }, 2500);

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

  private _getHtmlForWebview(port: number | null, _isLoading?: boolean) {
    const nonce = crypto.randomBytes(16).toString('base64');
    const logoUri = this._panel.webview.asWebviewUri(vscode.Uri.file(path.join(this._extensionUri.fsPath, 'media', 'icon.png')));
    const targetUrl = port ? `http://127.0.0.1:${port}?ide=vscode` : `https://branchdeck.vercel.app?ide=vscode`;

    let bodyContent = `
  <div id="loader">
    <div class="logo">
      <img src="${logoUri}" alt="Branchdeck Logo" style="width: 48px; height: 48px; object-fit: contain; border-radius: 10px;" />
    </div>
    <div class="spinner"></div>
    <div class="loader-title">Branchdeck</div>
    <div class="loader-sub">Pinging workspace server...</div>
  </div>
  <iframe id="webapp-frame" src="${targetUrl}" style="width: 100%; height: 100%; border: none; display: block;" onload="document.getElementById('loader').style.display='none';"></iframe>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${this._panel.webview.cspSource} http: https: data:; frame-src http://localhost:* http://127.0.0.1:* https://branchdeck.vercel.app https://*.vercel.app; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
  <title>Branchdeck</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #0a0a0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    #loader {
      position: fixed; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 16px; color: #fff;
      background: #0a0a0f; z-index: 100;
      transition: opacity 0.3s ease;
    }
    .logo { width: 52px; height: 52px; display: flex; align-items: center; justify-content: center; }
    .spinner {
      width: 28px; height: 28px; border: 2px solid rgba(255,255,255,0.12);
      border-top-color: #fff; border-radius: 50%;
      animation: spin 0.75s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .loader-title { font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.9); letter-spacing: 0.02em; }
    .loader-sub { font-size: 11px; color: rgba(255,255,255,0.35); }
    iframe { width: 100%; height: 100%; border: none; display: block; }
  </style>
</head>
<body>

  ${bodyContent}

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const iframe = document.getElementById('webapp-frame');
    const loader = document.getElementById('loader');

    // Auto-hide loader after iframe loads or timeout safety fallback
    if (iframe) {
      iframe.addEventListener('load', () => {
        if (loader) loader.style.display = 'none';
      });
      setTimeout(() => {
        if (loader) loader.style.display = 'none';
      }, 3500);
    }

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
