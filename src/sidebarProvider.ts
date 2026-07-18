import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { describeArtifact, formatBytes, scanArtifact } from './artifact';
import { getSidebarHtml } from './sidebarWebview';
import { format, resolveLocale, strings } from './i18n';
import { getManagedLinkStats } from './linkService';
import { ArtifactSelection, ShareOptions, ShareRecord } from './types';
import { createWebShare } from './webShareService';

const HISTORY_KEY = 'solodrop.shareHistory';
const HISTORY_SOURCES_KEY = 'solodrop.shareHistorySources';

export async function prepareShareHistorySync(context: vscode.ExtensionContext): Promise<void> {
  const records = context.globalState.get<ShareRecord[]>(HISTORY_KEY, []);
  const sources = { ...context.globalState.get<Record<string, string>>(HISTORY_SOURCES_KEY, {}) };
  const sanitized = records.map(({ sourcePath, ...record }) => {
    if (sourcePath) sources[record.id] = sourcePath;
    return record;
  });
  await context.globalState.update(HISTORY_SOURCES_KEY, sources);
  await context.globalState.update(HISTORY_KEY, sanitized);
  await context.globalState.update('solodrop.shareCta', undefined);
  context.globalState.setKeysForSync([HISTORY_KEY]);
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
    this.render();
    view.webview.onDidReceiveMessage((message) => {
      void this.handleMessage(message).catch((error) => {
        const detail = error instanceof Error ? error.message : String(error);
        this.output.appendLine(`Sidebar action failed: ${detail}`);
        this.post({ command: 'shareFailed', message: detail });
        vscode.window.showErrorMessage(format(strings().actionFailure, { message: detail }));
      });
    });
    this.refreshFromActiveEditor();
  }

  async select(filePath: string): Promise<void> {
    this.selection = await describeArtifact(filePath);
    this.postSelection();
  }

  async followActiveEditor(editor: vscode.TextEditor | undefined = vscode.window.activeTextEditor): Promise<void> {
    const uri = editor?.document.uri;
    if (uri?.scheme === 'file') await this.select(uri.fsPath);
  }

  async chooseFile(): Promise<void> {
    const selected = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectFolders: false, canSelectMany: false, openLabel: strings().sharePreview });
    if (selected?.[0]) await this.select(selected[0].fsPath);
  }

  async shareSelection(options: ShareOptions = { allowDownload: true, watermark: '', expiry: 'week' }): Promise<void> {
    if (!this.selection) {
      await this.refreshFromActiveEditor();
      if (!this.selection) return;
    }
    const artifact = this.selection;
    const text = strings();
    const settings = vscode.workspace.getConfiguration('solodrop');
    const findings = await scanArtifact(artifact.path);
    if (findings.length > 0) {
      const action = await vscode.window.showWarningMessage(
        format(text.sensitiveTitle, { findings: findings.join(', '), name: artifact.name }),
        { modal: true, detail: text.sensitiveDetail },
        text.shareAnyway
      );
      if (action !== text.shareAnyway) return;
    }
    if (settings.get<boolean>('confirmBeforeUpload', true)) {
      const confirmation = await vscode.window.showInformationMessage(
        format(text.publicConfirm, { name: artifact.name, size: formatBytes(artifact.size) }),
        { modal: true },
        text.shareAction
      );
      if (confirmation !== text.shareAction) return;
    }

    this.post({ command: 'shareStarted' });
    try {
      const record = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: format(text.shareTitle, { name: artifact.name }), cancellable: false }, async (progress) => {
        progress.report({ message: text.publishing });
        const shared = await createWebShare(artifact, options);
        const next: ShareRecord = {
          id: `${Date.now()}`,
          name: artifact.name,
          sourcePath: artifact.path,
          previewUrl: shared.shortUrl,
          originUrl: shared.previewUrl,
          managed: true,
          websiteShare: true,
          managementToken: shared.managementToken,
          temporary: true,
          createdAt: new Date().toISOString(),
          expiresAt: shared.expiresAt
        };
        await this.saveRecord(next);
        await vscode.env.clipboard.writeText(next.previewUrl);
        const { sourcePath: _sourcePath, managementToken: _managementToken, originUrl: _originUrl, ...publicRecord } = next;
        return publicRecord;
      });
      this.post({ command: 'shareCompleted', record, records: this.clientHistory() });
      vscode.window.showInformationMessage(format(text.readyMessage, { name: artifact.name }), text.openPreview).then((choice) => {
        if (choice === text.openPreview) vscode.env.openExternal(vscode.Uri.parse(record.previewUrl));
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.output.appendLine(`Share failed: ${message}`);
      this.post({ command: 'shareFailed', message });
      vscode.window.showErrorMessage(format(text.failurePrefix, { message }), text.showOutput).then((choice) => {
        if (choice === text.showOutput) this.output.show();
      });
    }
  }

  refresh(): void {
    this.postSelection();
    this.post({ command: 'historyLoaded', records: this.clientHistory() });
    void this.refreshManagedStats();
  }

  rerender(): void {
    this.render();
    this.refresh();
  }

  private render(): void {
    if (this.view) this.view.webview.html = getSidebarHtml(this.view.webview, this.context.extensionUri, strings(), resolveLocale());
  }

  private async refreshFromActiveEditor(): Promise<void> {
    const uri = vscode.window.activeTextEditor?.document.uri;
    if (uri?.scheme === 'file') await this.followActiveEditor();
    else this.refresh();
  }

  private async handleMessage(message: { command?: string; id?: string; url?: string; uri?: string; name?: string; bytes?: ArrayBuffer; options?: ShareOptions }): Promise<void> {
    switch (message.command) {
      case 'ready': this.refresh(); break;
      case 'choose': await this.chooseFile(); break;
      case 'share': await this.shareSelection(message.options); break;
      case 'dropUri': {
        if (!message.uri) break;
        const uri = vscode.Uri.parse(message.uri);
        if (uri.scheme !== 'file') throw new Error(strings().localOnly);
        await this.select(uri.fsPath);
        await this.shareSelection(message.options);
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
          await this.shareSelection(message.options);
        } finally {
          await fs.unlink(droppedPath).catch(() => undefined);
          await fs.rmdir(droppedDirectory).catch(() => undefined);
        }
        break;
      }
      case 'refresh': await this.refreshFromActiveEditor(); break;
      case 'reshare': {
        const record = this.history().find((item) => item.id === message.id);
        if (!record?.temporary) break;
        const sourcePath = this.context.globalState.get<Record<string, string>>(HISTORY_SOURCES_KEY, {})[record.id];
        const sourceAvailable = sourcePath ? await fs.stat(sourcePath).then((stat) => stat.isFile()).catch(() => false) : false;
        if (sourceAvailable) {
          await this.select(sourcePath);
        } else {
          const selected = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            openLabel: strings().chooseToShareAgain
          });
          if (!selected?.[0]) break;
          await this.select(selected[0].fsPath);
        }
        await this.shareSelection(message.options);
        break;
      }
      case 'setLanguage': {
        const nextLanguage = resolveLocale() === 'zh-cn' ? 'en' : 'zh-cn';
        await vscode.workspace.getConfiguration('solodrop').update('language', nextLanguage, vscode.ConfigurationTarget.Global);
        break;
      }
      case 'open': if (message.url) await vscode.env.openExternal(vscode.Uri.parse(message.url)); break;
      case 'copy': if (message.url) await vscode.env.clipboard.writeText(message.url); break;
    }
  }

  private history(): ShareRecord[] {
    return this.context.globalState.get<ShareRecord[]>(HISTORY_KEY, []);
  }

  private clientHistory(): Omit<ShareRecord, 'managementToken' | 'originUrl'>[] {
    return this.history().map(({ managementToken: _managementToken, originUrl: _originUrl, ...record }) => record);
  }

  private async refreshManagedStats(): Promise<void> {
    const records = this.history();
    let changed = false;
    const refreshed = await Promise.all(records.map(async (record) => {
      if (!record.managed || record.websiteShare || !record.managementToken || (record.expiresAt && Date.now() >= Date.parse(record.expiresAt))) return record;
      try {
        const clicks = await getManagedLinkStats(record.previewUrl, record.managementToken);
        if (clicks !== record.clicks) changed = true;
        return { ...record, clicks };
      } catch { return record; }
    }));
    if (changed) {
      await this.context.globalState.update(HISTORY_KEY, refreshed);
      this.post({ command: 'historyLoaded', records: this.clientHistory() });
    }
  }

  private async saveRecord(record: ShareRecord): Promise<void> {
    if (record.sourcePath) {
      const sources = this.context.globalState.get<Record<string, string>>(HISTORY_SOURCES_KEY, {});
      await this.context.globalState.update(HISTORY_SOURCES_KEY, { ...sources, [record.id]: record.sourcePath });
    }
    const { sourcePath: _sourcePath, ...syncedRecord } = record;
    await this.context.globalState.update(HISTORY_KEY, [syncedRecord, ...this.history()].slice(0, 20));
  }

  private postSelection(): void {
    this.post({ command: 'selectionChanged', selection: this.selection ? { ...this.selection, displaySize: formatBytes(this.selection.size) } : null });
    this.post({ command: 'historyLoaded', records: this.clientHistory() });
  }

  private post(message: unknown): void {
    void this.view?.webview.postMessage(message);
  }
}
