import * as fs from 'node:fs/promises';
import { ArtifactSelection, ShareOptions } from './types';

const SERVICE_URL = 'https://drop.szlk.ai';

interface WebShareResult {
  shortUrl: string;
  previewUrl: string;
  managementToken: string;
  expiresAt: string;
}

export async function createWebShare(artifact: ArtifactSelection, options: ShareOptions, fetcher: typeof fetch = fetch): Promise<WebShareResult> {
  const bytes = await fs.readFile(artifact.path);
  const form = new FormData();
  form.set('file', new File([bytes], artifact.name));
  form.set('allowDownload', options.allowDownload ? 'yes' : 'no');
  form.set('watermark', options.watermark.trim().slice(0, 60));
  form.set('expiry', options.expiry);
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
