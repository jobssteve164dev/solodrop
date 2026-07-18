import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ArtifactSelection } from './types';

const textExtensions = new Set([
  '.md', '.markdown', '.txt', '.json', '.js', '.jsx', '.ts', '.tsx', '.css', '.scss', '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.yml', '.yaml', '.toml', '.xml', '.sql', '.sh'
]);
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);
const officeExtensions = new Set(['.docx', '.pptx']);

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[character] || character);
}

function renderMarkdown(source: string): string {
  const escaped = escapeHtml(source);
  return escaped
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .split(/\n{2,}/)
    .map((block) => /^(?:<h\d|<pre|<li)/.test(block) ? block : `<p>${block.replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

function parseCsv(source: string): string[][] {
  return source.split(/\r?\n/).filter(Boolean).slice(0, 500).map((line) => {
    const cells: string[] = [];
    let cell = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === '"' && line[index + 1] === '"' && quoted) {
        cell += '"'; index += 1;
      } else if (character === '"') quoted = !quoted;
      else if (character === ',' && !quoted) { cells.push(cell); cell = ''; }
      else cell += character;
    }
    cells.push(cell);
    return cells;
  });
}

function page(title: string, body: string, originalName: string): string {
  const safeTitle = escapeHtml(title);
  const safeOriginal = encodeURIComponent(originalName);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="solodrop-preview" content="v1"><title>${safeTitle}</title>
<style>:root{color-scheme:light dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#f7f7fb;color:#20212b;--brand:#5b5ce2;--surface:#fff;--border:#e2e3ed;--muted:#666979}*{box-sizing:border-box}body{margin:0}.top{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 24px;background:color-mix(in srgb,#fff 92%,transparent);border-bottom:1px solid #dedfeb;backdrop-filter:blur(12px)}.brand{display:flex;align-items:center;gap:10px;min-width:0;font-weight:700}.brand-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mark{width:26px;height:26px;flex:none;border-radius:8px;background:var(--brand);color:#fff;display:grid;place-items:center;font-size:14px}.download,.solodrop-cta,.solodrop-powered{min-height:44px;display:inline-flex;align-items:center;justify-content:center;text-decoration:none;font-weight:650}.download{color:#4546bd}.content{width:min(100% - 32px,960px);margin:36px auto 28px;background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:clamp(20px,4vw,48px);box-shadow:0 18px 60px rgba(30,31,62,.08)}h1{font-size:clamp(28px,5vw,44px);letter-spacing:-.035em}h2{margin-top:2em}p,li{font-size:17px;line-height:1.7}pre{overflow:auto;padding:18px;border-radius:12px;background:#151622;color:#f3f3f8}code{font-family:ui-monospace,SFMono-Regular,monospace}table{width:100%;border-collapse:collapse;display:block;overflow:auto}th,td{padding:10px 12px;border:1px solid #dedfeb;text-align:left;white-space:nowrap}th{background:#f1f1f8}img,.media{display:block;max-width:100%;margin:auto;border-radius:12px}.pdf{width:100%;height:78vh;border:0;border-radius:12px}.office-viewer{min-height:50vh}.office-status{text-align:center;color:var(--muted);padding:40px 16px}.docx-wrapper{background:transparent!important;padding:0!important}.pptx-viewer,.slide{margin-inline:auto}.share-actions{width:min(100% - 32px,960px);min-height:44px;margin:0 auto 48px;display:flex;align-items:center;justify-content:flex-end;gap:12px}.solodrop-cta{padding:0 18px;border-radius:10px;background:var(--brand);color:#fff}.solodrop-powered{padding:0 4px;color:var(--muted);font-size:13px}.download:focus-visible,.solodrop-cta:focus-visible,.solodrop-powered:focus-visible{outline:3px solid color-mix(in srgb,var(--brand) 60%,transparent);outline-offset:3px}@media(prefers-color-scheme:dark){:root{background:#181820;color:#eeeef5;--surface:#22232d;--border:#393a47;--muted:#b5b6c4}.top{background:rgba(27,27,36,.92);border-color:#353642}.download{color:#b9b9ff}th{background:#2d2e39}th,td{border-color:#42434f}}@media(max-width:520px){.top{padding:10px 16px}.content{width:100%;margin:0 0 20px;border:0;border-radius:0;padding:24px 18px;min-height:calc(100dvh - 53px)}.share-actions{width:100%;padding:0 18px 24px;margin:0;display:grid}.solodrop-cta,.solodrop-powered{width:100%}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}</style></head>
<body><header class="top"><div class="brand"><span class="mark" aria-hidden="true">S</span><span class="brand-title">${safeTitle}</span></div><a class="download" href="./${safeOriginal}" download>Download</a></header><main class="content" id="content">${body}</main><aside class="share-actions" data-solodrop-actions hidden aria-label="Shared page actions"></aside><script defer src="https://drop.szlk.ai/embed.js"></script></body></html>`;
}

export async function buildPreview(artifact: ArtifactSelection, outputDirectory: string): Promise<void> {
  await fs.mkdir(outputDirectory, { recursive: true });
  const extension = path.extname(artifact.path).toLowerCase();
  const targetName = artifact.name;
  await fs.copyFile(artifact.path, path.join(outputDirectory, targetName));

  let body: string;
  if (extension === '.html' || extension === '.htm') {
    const source = await fs.readFile(artifact.path, 'utf8');
    body = `<iframe class="pdf" sandbox="allow-scripts" srcdoc="${escapeHtml(source)}" title="${escapeHtml(artifact.name)}"></iframe>`;
  } else if (imageExtensions.has(extension)) {
    body = `<img src="./${encodeURIComponent(targetName)}" alt="${escapeHtml(artifact.name)}">`;
  } else if (extension === '.pdf') {
    body = `<embed class="pdf" src="./${encodeURIComponent(targetName)}" type="application/pdf"><p><a href="./${encodeURIComponent(targetName)}">Open the PDF</a></p>`;
  } else if (officeExtensions.has(extension)) {
    body = `<div class="office-viewer" data-office-format="${extension.slice(1)}" data-office-src="./${encodeURIComponent(targetName)}"></div><script type="module" src="https://drop.szlk.ai/office-viewer.js"></script>`;
  } else if (extension === '.csv') {
    const rows = parseCsv(await fs.readFile(artifact.path, 'utf8'));
    const [headers = [], ...data] = rows;
    body = `<table><thead><tr>${headers.map((cell) => `<th>${escapeHtml(cell)}</th>`).join('')}</tr></thead><tbody>${data.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  } else if (extension === '.md' || extension === '.markdown') {
    body = renderMarkdown(await fs.readFile(artifact.path, 'utf8'));
  } else if (textExtensions.has(extension) || artifact.size <= 1024 * 1024) {
    body = `<pre><code>${escapeHtml(await fs.readFile(artifact.path, 'utf8'))}</code></pre>`;
  } else {
    body = `<h1>${escapeHtml(artifact.name)}</h1><p>This file is ready to download.</p>`;
  }

  await fs.writeFile(path.join(outputDirectory, 'index.html'), page(artifact.name, body, targetName), 'utf8');
  await fs.writeFile(path.join(outputDirectory, '_headers'), '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Content-Security-Policy: default-src \'self\'; script-src \'self\' \'unsafe-inline\' https://drop.szlk.ai; connect-src https://drop.szlk.ai; style-src \'unsafe-inline\'; img-src \'self\' data: blob:; font-src \'self\' data: blob:; object-src \'self\'; frame-src \'self\'; base-uri \'none\'; form-action \'none\'\n', 'utf8');
}

export const previewInternals = { escapeHtml, parseCsv, renderMarkdown };
