import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ArtifactSelection, ShareOptions } from './types';

const SERVICE_URL = 'https://drop.szlk.ai';

interface WebShareResult {
  shortUrl: string;
  previewUrl: string;
  managementToken: string;
  expiresAt: string;
}

const contentTypes: Record<string, string> = {
  '.md': 'text/markdown', '.markdown': 'text/markdown', '.txt': 'text/plain', '.csv': 'text/csv',
  '.json': 'application/json', '.js': 'text/javascript', '.ts': 'text/plain', '.html': 'text/html',
  '.css': 'text/css', '.xml': 'application/xml', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
};

export async function createWebShare(artifact: ArtifactSelection, options: ShareOptions, fetcher: typeof fetch = fetch): Promise<WebShareResult> {
  const bytes = await fs.readFile(artifact.path);
  const form = new FormData();
  const contentType = contentTypes[path.extname(artifact.name).toLowerCase()] || 'application/octet-stream';
  form.set('file', new File([bytes], artifact.name, { type: contentType }));
  form.set('allowDownload', options.allowDownload ? 'yes' : 'no');
  form.set('watermark', options.watermark.trim().slice(0, 60));
  form.set('expiry', 'day');
  const response = await fetcher(`${SERVICE_URL}/api/shares`, { method: 'POST', body: form });
  const payload = await response.json().catch(() => ({})) as Partial<WebShareResult> & { error?: string };
  if (!response.ok) throw new Error(payload.error || `SoloDrop share service returned HTTP ${response.status}.`);
  if (!payload.shortUrl || !payload.previewUrl || !payload.managementToken || !payload.expiresAt) throw new Error('SoloDrop share service returned an incomplete result.');
  const publicUrl = new URL(payload.shortUrl);
  if (publicUrl.origin !== SERVICE_URL) throw new Error('SoloDrop share service returned an unexpected link.');
  const verification = await fetcher(publicUrl, { cache: 'no-store', headers: { 'cache-control':'no-cache' } });
  if (!verification.ok) throw new Error(`The published preview returned HTTP ${verification.status}.`);
  return payload as WebShareResult;
}
