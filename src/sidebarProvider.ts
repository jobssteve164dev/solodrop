import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { describeArtifact, formatBytes, scanArtifact } from './artifact';
import { deployPreview, isWranglerAuthenticated, verifyPreview } from './deployment';
import { buildPreview } from './preview';
import { getSidebarHtml } from './sidebarWebview';
import { createDeploymentName } from './naming';
import { ArtifactSelection, DeploymentMode, ShareRecord } from './types';

const HISTORY_KEY = 'solodrop.shareHistory';

async function cleanupGeneratedDirectory(directory: string): Promise<void> {
  const entries = await fs.readdir(directory).catch(() => []);
  for (const entry of entries) {
    const target = path.join(directory, entry);
    const stat = await fs.lstat(target);
    if (stat.isFile()) await fs.unlink(target);
  }
  await fs.rmdir(directory).catch(() => undefined);
}

export class SoloDropSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'solodrop.sidebar';
  private view?: vscode.WebviewView;
  private selection?: ArtifactSelection;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [this.context.extensionUri] };
    view.webview.html = getSidebarHtml(view.webview, this.context.extensionUri);
    view.webview.onDidReceiveMessage((message) => {
      void this.handleMessage(message).catch((error) => {
        const detail = error instanceof Error ? error.message : String(error);
        this.output.appendLine(`Sidebar action failed: ${detail}`);
        this.post({ command: 'shareFailed', message: detail });
        vscode.window.showErrorMessage(`SoloDrop could not continue: ${detail}`);
      });
    });
    this.refreshFromActiveEditor();
  }

  async select(filePath: string): Promise<void> {
    this.selection = await describeArtifact(filePath);
    this.postSelection();
  }

  async chooseFile(): Promise<void> {
    const selected = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectFolders: false, canSelectMany: false, openLabel: 'Share this file' });
    if (selected?.[0]) await this.select(selected[0].fsPath);
  }

  async shareSelection(): Promise<void> {
    if (!this.selection) {
      await this.refreshFromActiveEditor();
      if (!this.selection) return;
    }
    const artifact = this.selection;
    const settings = vscode.workspace.getConfiguration('solodrop');
    const mode = settings.get<DeploymentMode>('deploymentMode', 'auto');
    const findings = await scanArtifact(artifact.path);
    if (findings.length > 0) {
      const action = await vscode.window.showWarningMessage(
        `SoloDrop found possible sensitive content (${findings.join(', ')}) in ${artifact.name}.`,
        { modal: true, detail: 'Review the file before publishing it to a public URL.' },
        'Share anyway'
      );
      if (action !== 'Share anyway') return;
    }
    if (artifact.size > 5 * 1024 * 1024 && (mode === 'temporary' || (mode === 'auto' && !await isWranglerAuthenticated()))) {
      throw new Error('Temporary Cloudflare previews accept files up to 5 MB. Sign in to Wrangler or choose a smaller file.');
    }
    if (settings.get<boolean>('confirmBeforeUpload', true)) {
      const confirmation = await vscode.window.showInformationMessage(
        `Share ${artifact.name} (${formatBytes(artifact.size)}) on a public preview URL?`,
        { modal: true },
        'Share preview'
      );
      if (confirmation !== 'Share preview') return;
    }

    this.post({ command: 'shareStarted' });
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'solodrop-preview-'));
    try {
      const record = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Sharing ${artifact.name}`, cancellable: false }, async (progress) => {
        progress.report({ message: 'Building preview…' });
        await buildPreview(artifact, directory);
        progress.report({ message: 'Publishing to Cloudflare…' });
        const deployed = await deployPreview(directory, createDeploymentName(artifact.name), mode);
        this.output.appendLine(deployed.output.replace(/https:\/\/dash\.cloudflare\.com\/claim-preview\?claimToken=[^\s]+/g, '[claim URL hidden]'));
        progress.report({ message: 'Checking the public link…' });
        await verifyPreview(deployed.previewUrl);
        const next: ShareRecord = {
          id: `${Date.now()}`,
          name: artifact.name,
          sourcePath: artifact.path,
          previewUrl: deployed.previewUrl,
          claimUrl: deployed.claimUrl,
          temporary: deployed.temporary,
          createdAt: new Date().toISOString()
        };
        await this.saveRecord(next);
        await vscode.env.clipboard.writeText(next.previewUrl);
        return next;
      });
      this.post({ command: 'shareCompleted', record, records: this.history() });
      vscode.window.showInformationMessage(`${artifact.name} is ready. The preview link is on your clipboard.`, 'Open preview').then((choice) => {
        if (choice === 'Open preview') vscode.env.openExternal(vscode.Uri.parse(record.previewUrl));
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.output.appendLine(`Share failed: ${message}`);
      this.post({ command: 'shareFailed', message });
      vscode.window.showErrorMessage(`SoloDrop could not share this file: ${message}`, 'Show output').then((choice) => {
        if (choice === 'Show output') this.output.show();
      });
    } finally {
      await cleanupGeneratedDirectory(directory);
    }
  }

  refresh(): void {
    this.postSelection();
    this.post({ command: 'historyLoaded', records: this.history() });
  }

  private async refreshFromActiveEditor(): Promise<void> {
    const uri = vscode.window.activeTextEditor?.document.uri;
    if (uri?.scheme === 'file') await this.select(uri.fsPath);
    else this.refresh();
  }

  private async handleMessage(message: { command?: string; url?: string; uri?: string; name?: string; bytes?: ArrayBuffer }): Promise<void> {
    switch (message.command) {
      case 'ready': this.refresh(); break;
      case 'choose': await this.chooseFile(); break;
      case 'share': await this.shareSelection(); break;
      case 'dropUri': {
        if (!message.uri) break;
        const uri = vscode.Uri.parse(message.uri);
        if (uri.scheme !== 'file') throw new Error('SoloDrop can only share local files.');
        await this.select(uri.fsPath);
        await this.shareSelection();
        break;
      }
      case 'dropFile': {
        if (!message.name || !message.bytes) break;
        const safeName = path.basename(message.name).replace(/[\\/:*?"<>|]/g, '-');
        const droppedDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'solodrop-drop-'));
        const droppedPath = path.join(droppedDirectory, safeName || 'artifact');
        try {
          await fs.writeFile(droppedPath, new Uint8Array(message.bytes));
          await this.select(droppedPath);
          await this.shareSelection();
        } finally {
          await fs.unlink(droppedPath).catch(() => undefined);
          await fs.rmdir(droppedDirectory).catch(() => undefined);
        }
        break;
      }
      case 'refresh': await this.refreshFromActiveEditor(); break;
      case 'open': if (message.url) await vscode.env.openExternal(vscode.Uri.parse(message.url)); break;
      case 'copy': if (message.url) await vscode.env.clipboard.writeText(message.url); break;
    }
  }

  private history(): ShareRecord[] {
    return this.context.globalState.get<ShareRecord[]>(HISTORY_KEY, []);
  }

  private async saveRecord(record: ShareRecord): Promise<void> {
    await this.context.globalState.update(HISTORY_KEY, [record, ...this.history()].slice(0, 20));
  }

  private postSelection(): void {
    this.post({ command: 'selectionChanged', selection: this.selection ? { ...this.selection, displaySize: formatBytes(this.selection.size) } : null });
    this.post({ command: 'historyLoaded', records: this.history() });
  }

  private post(message: unknown): void {
    void this.view?.webview.postMessage(message);
  }
}
