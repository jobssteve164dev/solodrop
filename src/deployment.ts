import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DeploymentMode, DeploymentResult } from './types';

const execFileAsync = promisify(execFile);

interface RunnerResult { stdout: string; stderr: string; }
type Runner = (command: string, args: string[], options: { env: NodeJS.ProcessEnv; timeout: number; maxBuffer: number }) => Promise<RunnerResult>;

async function defaultRunner(command: string, args: string[], options: { env: NodeJS.ProcessEnv; timeout: number; maxBuffer: number }): Promise<RunnerResult> {
  return execFileAsync(command, args, options);
}

export function parseDeploymentOutput(output: string, temporary: boolean): DeploymentResult {
  const urls = output.match(/https:\/\/[^\s\])]+/g) || [];
  const claimUrl = urls.find((url) => url.includes('dash.cloudflare.com/claim-preview'));
  const previewUrl = urls.find((url) => url.includes('.workers.dev') && !url.includes('dash.cloudflare.com'));
  if (!previewUrl) {
    throw new Error('Cloudflare finished without returning a public preview URL. Open the SoloDrop output and retry.');
  }
  return { previewUrl, claimUrl, temporary, output };
}

export async function isWranglerAuthenticated(runner: Runner = defaultRunner): Promise<boolean> {
  try {
    await runner('npx', ['--yes', 'wrangler@latest', 'whoami'], {
      env: process.env, timeout: 30_000, maxBuffer: 1024 * 1024
    });
    return true;
  } catch {
    return false;
  }
}

export async function deployPreview(directory: string, name: string, mode: DeploymentMode, runner: Runner = defaultRunner): Promise<DeploymentResult> {
  const authenticated = mode === 'authenticated' || (mode === 'auto' && await isWranglerAuthenticated(runner));
  if (mode === 'authenticated' && !authenticated) {
    throw new Error('Cloudflare is not connected. Run “Wrangler: Login” or switch SoloDrop deployment mode to Auto.');
  }
  const temporary = mode === 'temporary' || !authenticated;
  const args = ['--yes', 'wrangler@latest', 'deploy', directory, '--name', name, '--compatibility-date', new Date().toISOString().slice(0, 10)];
  if (temporary) args.push('--temporary');
  const result = await runner('npx', args, {
    env: process.env,
    timeout: 180_000,
    maxBuffer: 8 * 1024 * 1024
  });
  return parseDeploymentOutput(`${result.stdout}\n${result.stderr}`, temporary);
}

export async function verifyPreview(
  url: string,
  fetcher: typeof fetch = fetch,
  pause: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  attempts = 6
): Promise<void> {
  let lastStatus = 0;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetcher(url, { signal: AbortSignal.timeout(20_000) });
      lastStatus = response.status;
      if (response.ok) return;
      if (response.status !== 404 && response.status < 500) break;
    } catch {
      lastStatus = 0;
    }
    if (attempt < attempts) await pause(2_000);
  }
  throw new Error(lastStatus ? `The published preview returned HTTP ${lastStatus}.` : 'The published preview could not be reached.');
}
