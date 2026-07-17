import * as vscode from 'vscode';

export type SupportedLocale = 'en' | 'zh-cn';

export interface Strings {
  tagline: string; dropHere: string; dropToShare: string; releaseHere: string; noFile: string; dragOrChoose: string;
  sharePreview: string; chooseFile: string; linkCopied: string; open: string; copyAgain: string; keepPreview: string;
  recent: string; refresh: string; emptyHistory: string; buildingChecking: string; dropOneFile: string; droppedFileLimit: string;
  active: string; expired: string; shareAgain: string; chooseToShareAgain: string;
  temporary: string; persistent: string; justNow: string; minutesAgo: string; hoursAgo: string; daysAgo: string;
  temporaryMeta: string; persistentMeta: string; buildingPreview: string; publishing: string; checkingLink: string;
  shareTitle: string; publicConfirm: string; shareAction: string; sensitiveTitle: string; sensitiveDetail: string; shareAnyway: string;
  readyMessage: string; openPreview: string; showOutput: string; failurePrefix: string; actionFailure: string;
  localOnly: string; temporaryLimit: string; notConnected: string; switchLanguage: string;
  sharePageAction: string; sharePageActionHint: string; ctaLabel: string; ctaUrl: string; optional: string;
  creatingShortLink: string; shortLinkFallback: string; managedTemporaryMeta: string; managedPersistentMeta: string;
  views: string;
}

const translations: Record<SupportedLocale, Strings> = {
  en: {
    tagline: 'Share the result, not the file path.', dropHere: 'Drop a file here', dropToShare: 'Drop to share', releaseHere: 'Release the file here', noFile: 'No file selected', dragOrChoose: 'Drag from Explorer or choose a file.',
    sharePreview: 'Share preview', chooseFile: 'Choose a file', linkCopied: 'Link copied', open: 'Open', copyAgain: 'Copy again', keepPreview: 'Keep this preview', recent: 'Recent', refresh: 'Refresh', emptyHistory: 'Shared previews will appear here.', active: 'Active', expired: 'Expired', shareAgain: 'Share again', chooseToShareAgain: 'Choose the original file to share again',
    buildingChecking: 'Building and checking your public preview…', dropOneFile: 'Drop one file from Explorer or your computer.', droppedFileLimit: 'Files dragged from your computer are limited to 5 MB. Use Choose a file for larger artifacts.',
    temporary: 'Temporary', persistent: 'Persistent', justNow: 'just now', minutesAgo: '{count}m ago', hoursAgo: '{count}h ago', daysAgo: '{count}d ago', temporaryMeta: 'Temporary preview · claim within 60 minutes', persistentMeta: 'Persistent Cloudflare preview',
    buildingPreview: 'Building preview…', publishing: 'Publishing to Cloudflare…', checkingLink: 'Checking the public link…', shareTitle: 'Sharing {name}', publicConfirm: 'Share {name} ({size}) on a public preview URL?', shareAction: 'Share preview',
    sensitiveTitle: 'SoloDrop found possible sensitive content ({findings}) in {name}.', sensitiveDetail: 'Review the file before publishing it to a public URL.', shareAnyway: 'Share anyway', readyMessage: '{name} is ready. The preview link is on your clipboard.', openPreview: 'Open preview', showOutput: 'Show output', failurePrefix: 'SoloDrop could not share this file: {message}', actionFailure: 'SoloDrop could not continue: {message}', localOnly: 'SoloDrop can only share local files.', temporaryLimit: 'Temporary Cloudflare previews accept files up to 5 MB. Sign in to Wrangler or choose a smaller file.', notConnected: 'Cloudflare is not connected. Run Wrangler Login or switch SoloDrop deployment mode to Auto.', switchLanguage: '切换到简体中文',
    sharePageAction: 'Share page action', sharePageActionHint: 'Optional · give readers one clear next step', ctaLabel: 'Button label', ctaUrl: 'HTTPS destination', optional: 'Optional', creatingShortLink: 'Creating and checking the short link…', shortLinkFallback: 'The preview is ready, but the short-link service was unavailable. The verified original link was copied instead.', managedTemporaryMeta: 'Short link · temporary preview', managedPersistentMeta: 'Short link · persistent preview', views: '{count} views'
  },
  'zh-cn': {
    tagline: '分享结果，不再解释文件路径。', dropHere: '将文件拖到这里', dropToShare: '松手即可分享', releaseHere: '文件将在这里生成预览', noFile: '尚未选择文件', dragOrChoose: '从资源管理器拖入，或选择一个文件。',
    sharePreview: '分享预览', chooseFile: '选择文件', linkCopied: '链接已复制', open: '打开', copyAgain: '再次复制', keepPreview: '保留这个预览', recent: '最近分享', refresh: '刷新', emptyHistory: '分享过的预览会显示在这里。', active: '有效', expired: '已过期', shareAgain: '重新分享', chooseToShareAgain: '选择原文件并重新分享',
    buildingChecking: '正在生成并检查公开预览…', dropOneFile: '请从资源管理器或电脑拖入一个文件。', droppedFileLimit: '从电脑直接拖入的文件不能超过 5 MB；更大的文件请使用“选择文件”。',
    temporary: '临时', persistent: '长期', justNow: '刚刚', minutesAgo: '{count} 分钟前', hoursAgo: '{count} 小时前', daysAgo: '{count} 天前', temporaryMeta: '临时预览 · 请在 60 分钟内认领', persistentMeta: '长期 Cloudflare 预览',
    buildingPreview: '正在生成预览…', publishing: '正在发布到 Cloudflare…', checkingLink: '正在检查公开链接…', shareTitle: '正在分享 {name}', publicConfirm: '将 {name}（{size}）发布为公开预览链接？', shareAction: '分享预览',
    sensitiveTitle: 'SoloDrop 在 {name} 中发现可能的敏感内容（{findings}）。', sensitiveDetail: '发布到公开链接前，请先确认文件内容。', shareAnyway: '仍然分享', readyMessage: '{name} 已可访问，预览链接已复制。', openPreview: '打开预览', showOutput: '查看输出', failurePrefix: 'SoloDrop 无法分享这个文件：{message}', actionFailure: 'SoloDrop 无法继续：{message}', localOnly: 'SoloDrop 只能分享本地文件。', temporaryLimit: 'Cloudflare 临时预览的单文件上限为 5 MB。请登录 Wrangler，或选择更小的文件。', notConnected: '尚未连接 Cloudflare。请运行 Wrangler 登录，或将 SoloDrop 发布模式切换为自动。', switchLanguage: 'Switch to English',
    sharePageAction: '分享页行动按钮', sharePageActionHint: '可选 · 给接收者一个明确的下一步', ctaLabel: '按钮文案', ctaUrl: 'HTTPS 目标地址', optional: '可选', creatingShortLink: '正在生成并检查短链接…', shortLinkFallback: '预览已可访问，但短链服务暂时不可用；已改为复制验证过的原始链接。', managedTemporaryMeta: '短链接 · 临时预览', managedPersistentMeta: '短链接 · 长期预览', views: '{count} 次访问'
  }
};

export function resolveLocale(): SupportedLocale {
  const configured = vscode.workspace.getConfiguration('solodrop').get<string>('language', 'auto').toLowerCase();
  if (configured === 'zh-cn' || configured === 'zh') return 'zh-cn';
  if (configured === 'en') return 'en';
  return vscode.env.language.toLowerCase().startsWith('zh') ? 'zh-cn' : 'en';
}

export function strings(): Strings { return translations[resolveLocale()]; }

export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key) => String(values[key] ?? `{${key}}`));
}
