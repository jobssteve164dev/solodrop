import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ArtifactSelection } from './types';

const kindByExtension: Record<string, string> = {
  '.md': 'Markdown',
  '.markdown': 'Markdown',
  '.txt': 'Text',
  '.json': 'JSON',
  '.csv': 'Table',
  '.pdf': 'PDF',
  '.html': 'HTML',
  '.htm': 'HTML',
  '.png': 'Image',
  '.jpg': 'Image',
  '.jpeg': 'Image',
  '.gif': 'Image',
  '.webp': 'Image',
  '.svg': 'Image'
};

export async function describeArtifact(filePath: string): Promise<ArtifactSelection> {
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) {
    throw new Error('SoloDrop currently shares individual files. Choose a file and try again.');
  }
  const extension = path.extname(filePath).toLowerCase();
  return {
    path: filePath,
    name: path.basename(filePath),
    size: stat.size,
    kind: kindByExtension[extension] || (extension ? extension.slice(1).toUpperCase() : 'File')
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const secretPatterns: Array<{ label: string; pattern: RegExp }> = [
  { label: 'private key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i },
  { label: 'GitHub token', pattern: /\bgh[opsu]_[A-Za-z0-9_]{20,}\b/ },
  { label: 'OpenAI API key', pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { label: 'AWS access key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: 'credential assignment', pattern: /\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*['"]?[A-Za-z0-9_./+\-=]{12,}/i }
];

export async function scanArtifact(filePath: string, maxBytes = 2 * 1024 * 1024): Promise<string[]> {
  const stat = await fs.stat(filePath);
  if (stat.size > maxBytes || filePath.toLowerCase().endsWith('.pdf')) return [];
  const content = await fs.readFile(filePath, 'utf8');
  return secretPatterns.filter(({ pattern }) => pattern.test(content)).map(({ label }) => label);
}
