import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import { Strings, SupportedLocale } from './i18n';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character));
}

export function getSidebarHtml(webview: vscode.Webview, extensionUri: vscode.Uri, text: Strings, locale: SupportedLocale): string {
  const nonce = crypto.randomBytes(16).toString('base64');
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'resources', 'sidebar.css'));
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'resources', 'sidebar.js'));
  return `<!doctype html>
<html lang="${locale}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource} data:; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${styleUri}"><title>SoloDrop</title></head>
<body>
  <main class="shell">
    <header class="hero">
      <img src="${webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'resources', 'logo.svg'))}" alt="" class="logo">
      <div class="hero-copy"><h1>SoloDrop</h1><p>${escapeHtml(text.tagline)}</p></div>
      <button id="language" class="language-button" type="button" aria-label="${escapeHtml(text.switchLanguage)}" title="${escapeHtml(text.switchLanguage)}">${locale === 'zh-cn' ? 'EN' : '中'}</button>
    </header>

    <section id="drop-zone" class="share-card" aria-labelledby="selected-heading">
      <div class="drop-overlay" aria-hidden="true"><strong>${escapeHtml(text.dropToShare)}</strong><span>${escapeHtml(text.releaseHere)}</span></div>
      <div class="eyebrow" id="selected-heading">${escapeHtml(text.dropHere)}</div>
      <div id="selection" class="selection empty">
        <div class="file-icon" aria-hidden="true"><span></span></div>
        <div class="file-copy"><strong>${escapeHtml(text.noFile)}</strong><small>${escapeHtml(text.dragOrChoose)}</small></div>
      </div>
      <button id="share" class="primary" type="button" disabled>
        <span class="button-label">${escapeHtml(text.sharePreview)}</span><span class="spinner" aria-hidden="true"></span>
      </button>
      <button id="choose" class="secondary" type="button">${escapeHtml(text.chooseFile)}</button>
      <p id="status" class="status" role="status" aria-live="polite"></p>
    </section>

    <section id="result" class="result hidden" aria-labelledby="result-heading">
      <div class="result-mark" aria-hidden="true">✓</div>
      <div><h2 id="result-heading">${escapeHtml(text.linkCopied)}</h2><p id="result-meta"></p></div>
      <div class="result-actions"><button id="open-link" type="button">${escapeHtml(text.open)}</button><button id="copy-link" type="button">${escapeHtml(text.copyAgain)}</button></div>
      <button id="claim-link" class="claim hidden" type="button">${escapeHtml(text.keepPreview)}</button>
    </section>

    <section class="recent" aria-labelledby="recent-heading">
      <div class="section-heading"><h2 id="recent-heading">${escapeHtml(text.recent)}</h2><button id="refresh" class="icon-button" type="button" aria-label="${escapeHtml(text.refresh)}">↻</button></div>
      <div id="history" class="history"><p class="muted">${escapeHtml(text.emptyHistory)}</p></div>
    </section>
  </main>
  <script nonce="${nonce}">window.solodropStrings=${JSON.stringify(text).replace(/</g, '\\u003c')};</script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body></html>`;
}
