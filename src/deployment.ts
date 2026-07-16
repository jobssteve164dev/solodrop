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
    const result = await runner('npx', ['--yes', 'wrangler@latest', 'whoami'], {
      env: process.env, timeout: 30_000, maxBuffer: 1024 * 1024
    });
    const output = `${result.stdout}\n${result.stderr}`.replace(/\u001b\[[0-9;]*m/g, '');
    if (/not authenticated|please run [`“]?wrangler login/i.test(output)) return false;
    return /logged in|api token|account id/i.test(output);
  } catch {
    return false;
  }
}

function deploymentArgs(directory: string, name: string, temporary: boolean): string[] {
  const args = ['--yes', 'wrangler@latest', 'deploy', directory, '--name', name, '--compatibility-date', new Date().toISOString().slice(0, 10)];
  if (temporary) args.push('--temporary');
  return args;
}

function commandErrorOutput(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error);
  const candidate = error as { message?: string; stdout?: string; stderr?: string };
  return `${candidate.message || ''}\n${candidate.stdout || ''}\n${candidate.stderr || ''}`;
}

function requiresTemporaryFallback(error: unknown): boolean {
  const output = commandErrorOutput(error);
  return /non-interactive environment[\s\S]*CLOUDFLARE_API_TOKEN/i.test(output)
    || /rerun this command with [`“]?--temporary/i.test(output);
}

export async function deployPreview(directory: string, name: string, mode: DeploymentMode, runner: Runner = defaultRunner): Promise<DeploymentResult> {
  const authenticated = mode !== 'temporary' && await isWranglerAuthenticated(runner);
  if (mode === 'authenticated' && !authenticated) {
    throw new Error('Cloudflare is not connected. Run “Wrangler: Login” or switch SoloDrop deployment mode to Auto.');
  }
  const temporary = mode === 'temporary' || !authenticated;
  const options = { env: process.env, timeout: 180_000, maxBuffer: 8 * 1024 * 1024 };
  try {
    const result = await runner('npx', deploymentArgs(directory, name, temporary), options);
    return parseDeploymentOutput(`${result.stdout}\n${result.stderr}`, temporary);
  } catch (error) {
    if (mode === 'auto' && !temporary && requiresTemporaryFallback(error)) {
      const result = await runner('npx', deploymentArgs(directory, name, true), options);
      return parseDeploymentOutput(`${result.stdout}\n${result.stderr}`, true);
    }
    throw error;
  }
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

export const deploymentInternals = { commandErrorOutput, deploymentArgs, requiresTemporaryFallback };
