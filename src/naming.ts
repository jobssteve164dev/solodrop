import * as path from 'node:path';

export function createDeploymentName(name: string, now = Date.now()): string {
  const stem = path.basename(name, path.extname(name)).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 36) || 'artifact';
  return `solodrop-${stem}-${now.toString(36)}`;
}
