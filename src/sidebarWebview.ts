import * as crypto from 'node:crypto';
import * as vscode from 'vscode';

export function getSidebarHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = crypto.randomBytes(16).toString('base64');
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'resources', 'sidebar.css'));
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'resources', 'sidebar.js'));
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource} data:; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${styleUri}"><title>SoloDrop</title></head>
<body>
  <main class="shell">
    <header class="hero">
      <img src="${webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'resources', 'logo.svg'))}" alt="" class="logo">
      <div><h1>SoloDrop</h1><p>Share the result, not the file path.</p></div>
    </header>

    <section id="drop-zone" class="share-card" aria-labelledby="selected-heading">
      <div class="drop-overlay" aria-hidden="true"><strong>Drop to share</strong><span>Release the file here</span></div>
      <div class="eyebrow" id="selected-heading">Drop a file here</div>
      <div id="selection" class="selection empty">
        <div class="file-icon" aria-hidden="true"><span></span></div>
        <div class="file-copy"><strong>No file selected</strong><small>Drag from Explorer or choose a file.</small></div>
      </div>
      <button id="share" class="primary" type="button" disabled>
        <span class="button-label">Share preview</span><span class="spinner" aria-hidden="true"></span>
      </button>
      <button id="choose" class="secondary" type="button">Choose a file</button>
      <p id="status" class="status" role="status" aria-live="polite"></p>
    </section>

    <section id="result" class="result hidden" aria-labelledby="result-heading">
      <div class="result-mark" aria-hidden="true">✓</div>
      <div><h2 id="result-heading">Link copied</h2><p id="result-meta"></p></div>
      <div class="result-actions"><button id="open-link" type="button">Open</button><button id="copy-link" type="button">Copy again</button></div>
      <button id="claim-link" class="claim hidden" type="button">Keep this preview</button>
    </section>

    <section class="recent" aria-labelledby="recent-heading">
      <div class="section-heading"><h2 id="recent-heading">Recent</h2><button id="refresh" class="icon-button" type="button" aria-label="Refresh">↻</button></div>
      <div id="history" class="history"><p class="muted">Shared previews will appear here.</p></div>
    </section>
  </main>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body></html>`;
}
