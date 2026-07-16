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

    BranchdeckPanel.currentPanel = new BranchdeckPanel(panel);
  }

  private constructor(panel: vscode.WebviewPanel) {
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
    const targets: Array<{ host: string; port: number }> = [];
    [3000, 3001, 3002, 3003].forEach(p => {
      targets.push({ host: '127.0.0.1', port: p });
      targets.push({ host: 'localhost', port: p });
    });

    return new Promise((resolve, reject) => {
      let resolved = false;

      // Global safety timeout: reject after 1500ms no matter what
      const globalTimeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error('Port scan timed out'));
        }
      }, 1500);

      targets.forEach(target => {
        try {
          const payload = JSON.stringify({ featureId: 'test' });
          const req = http.request({
            hostname: target.host,
            port: target.port,
            path: '/api/story',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload)
            },
            timeout: 800
          }, (res) => {
            if (res.statusCode === 401) {
              if (!resolved) {
                resolved = true;
                clearTimeout(globalTimeout);
                resolve(target.port);
              }
            }
            res.resume(); // consume response stream to release memory
          });

          req.on('error', () => {});
          req.on('timeout', () => req.destroy());
          req.write(payload);
          req.end();
        } catch (err) {
          // Ignore synchronous errors
        }
      });
    });
  }

  private _getHtmlForWebview(port: number | null, isLoading: boolean) {
    const nonce = crypto.randomBytes(16).toString('base64');
    
    let bodyContent = '';
    if (isLoading) {
      bodyContent = `
  <div id="loader">
    <div class="logo">
      <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
      </svg>
    </div>
    <div class="spinner"></div>
    <div class="loader-title">Branchdeck</div>
    <div class="loader-sub">Pinging local workspace server...</div>
  </div>`;
    } else if (port) {
      bodyContent = `<iframe id="webapp-frame" src="http://localhost:${port}?ide=vscode" style="display: block;"></iframe>`;
    } else {
      bodyContent = `
  <div id="loader">
    <div class="logo">
      <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
      </svg>
    </div>
    <div class="error-box visible">
      <div class="error-title">Server not running</div>
      <div class="error-msg">Start the Branchdeck webapp, then reopen this panel.</div>
      <div class="error-cmd">npm run dev</div>
      <div class="error-msg" style="margin-top:4px">Run inside the <strong style="color:rgba(255,255,255,0.6)">webapp/</strong> folder</div>
    </div>
  </div>`;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src http://localhost:3000 http://localhost:3001 http://localhost:3002 http://localhost:3003; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
  <title>Branchdeck</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #0a0a0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    #loader {
      position: fixed; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 16px; color: #fff;
      background: #0a0a0f; z-index: 100;
    }
    .logo { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; }
    .logo svg { width: 100%; height: 100%; }
    .spinner {
      width: 28px; height: 28px; border: 2px solid rgba(255,255,255,0.12);
      border-top-color: #fff; border-radius: 50%;
      animation: spin 0.75s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .loader-title { font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.9); letter-spacing: 0.02em; }
    .loader-sub { font-size: 11px; color: rgba(255,255,255,0.35); }
    .error-box {
      display: none; flex-direction: column; align-items: center; gap: 12px;
      background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px; padding: 28px 32px; max-width: 320px; text-align: center;
    }
    .error-box.visible { display: flex; }
    .error-title { font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.85); }
    .error-msg { font-size: 11px; color: rgba(255,255,255,0.35); line-height: 1.6; }
    .error-cmd {
      font-family: 'SF Mono', 'Fira Code', monospace; font-size: 11px;
      background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.1);
      padding: 6px 12px; border-radius: 8px; color: rgba(255,255,255,0.7);
    }
    iframe { width: 100%; height: 100%; border: none; display: none; }
  </style>
</head>
<body>

  ${bodyContent}

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
          || (!event.origin.includes('localhost:3000')
            && !event.origin.includes('localhost:3001')
            && !event.origin.includes('localhost:3002')
            && !event.origin.includes('localhost:3003'));

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
