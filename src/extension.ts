import * as vscode from 'vscode';
import { prepareShareHistorySync, SoloDropSidebarProvider } from './sidebarProvider';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  await prepareShareHistorySync(context);
  const output = vscode.window.createOutputChannel('SoloDrop', { log: true });
  const provider = new SoloDropSidebarProvider(context, output);
  context.subscriptions.push(
    output,
    vscode.window.registerWebviewViewProvider(SoloDropSidebarProvider.viewType, provider),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('solodrop.language')) provider.rerender();
    }),
    vscode.commands.registerCommand('solodrop.openSidebar', () => vscode.commands.executeCommand('workbench.view.extension.solodrop-sidebar-container')),
    vscode.commands.registerCommand('solodrop.chooseAndShare', async () => {
      await provider.chooseFile();
      await provider.shareSelection();
    }),
    vscode.commands.registerCommand('solodrop.shareCurrentFile', async (resource?: vscode.Uri) => {
      const uri = resource?.scheme === 'file' ? resource : vscode.window.activeTextEditor?.document.uri;
      if (!uri || uri.scheme !== 'file') {
        await provider.chooseFile();
      } else {
        await provider.select(uri.fsPath);
      }
      await vscode.commands.executeCommand('workbench.view.extension.solodrop-sidebar-container');
      await provider.shareSelection();
    })
  );
}

export function deactivate(): void {}
