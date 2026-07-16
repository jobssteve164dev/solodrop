<p align="center">
  <img src="https://raw.githubusercontent.com/jobssteve164dev/solodrop/main/resources/logo.png" width="128" alt="SoloDrop Logo" />
</p>

<h1 align="center">SoloDrop — Share Agent Artifacts in One Click / 一键分享 Agent 产物</h1>

<p align="center">
  <strong>Your Agent made the file. SoloDrop makes it ready to share.</strong><br />
  <strong>Agent 负责产出，SoloDrop 负责让别人看懂。</strong>
</p>

<p align="center">
  Turn local Markdown, code, images, PDFs and more into a clean, verified browser preview—without leaving VS Code.<br />
  无需离开 VS Code，即可把本地 Markdown、代码、图片、PDF 等文件变成清晰、已验证的网页预览。
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=SZLK.solodrop"><img src="https://img.shields.io/badge/VS%20Code-Marketplace-blue?style=flat-square&logo=visual-studio-code" alt="Visual Studio Marketplace" /></a>
  <a href="https://open-vsx.org/extension/SZLK/solodrop"><img src="https://img.shields.io/badge/Open%20VSX-Install-purple?style=flat-square" alt="Open VSX" /></a>
  <a href="https://github.com/jobssteve164dev/solodrop/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-emerald?style=flat-square" alt="MIT License" /></a>
</p>

---

## From “done” to “delivered” / 从“做完了”到“交付了”

Coding agents can create a report, prototype, chart or document in seconds. Sharing the result still means finding the file, checking it for secrets, choosing how to render it, publishing it and confirming the link actually works.

编程 Agent 几秒钟就能生成报告、原型、图表或文档，但真正分享时，你仍要找文件、检查敏感信息、处理预览格式、完成发布，还要确认链接真的能打开。

**SoloDrop turns that entire handoff into one action:** choose or drop the file, then share a browser-ready preview.

**SoloDrop 把整段交付流程收成一个动作：** 选择或拖入文件，然后分享一个任何人都能直接打开的网页预览。

## Why SoloDrop / 为什么选择 SoloDrop

### ⚡ Share without breaking your flow / 不打断工作流

Drag a file into the sidebar, share the active editor, choose a file, or use the Explorer context menu. SoloDrop builds the preview and copies the public link to your clipboard.

拖入侧边栏、分享当前编辑器文件、手动选择文件，或直接使用资源管理器右键菜单。SoloDrop 会生成预览，并把公开链接复制到剪贴板。

### 👀 Make artifacts easy to read / 让产物打开就能看

Give recipients a clean browser experience instead of asking them to download a raw file or install the right application.

无需让接收者下载原始文件或安装对应软件，打开浏览器就能清晰查看内容。

Supported previews / 支持的预览类型：

- Markdown, text, code and JSON / Markdown、文本、代码与 JSON
- Images and PDF / 图片与 PDF
- CSV tables / CSV 表格
- HTML / HTML 页面

### 🛡️ Catch risky content before it goes public / 公开前先检查风险

SoloDrop checks common credential and secret patterns before publishing. You always see the exact filename and size before upload unless you choose to disable confirmation.

SoloDrop 会在发布前检查常见凭据和密钥特征。默认情况下，上传前会明确显示文件名和大小，由你做最后确认。

### ✅ Share a link that has already been checked / 分享一个已经验证过的链接

A successful deployment is not enough. SoloDrop opens the published URL over HTTP first and only then copies the public preview link.

部署成功不等于交付成功。SoloDrop 会先通过 HTTP 确认预览地址可访问，再复制公开链接。

### 🌍 Start now, sign in when you need more / 无需登录也能开始

If Wrangler is signed in, SoloDrop uses your authenticated Cloudflare account for a persistent preview. Otherwise, it creates a temporary preview that you can claim within 60 minutes.

Wrangler 已登录时，SoloDrop 会使用你的 Cloudflare 账户生成长期预览；未登录时，则直接生成可在 60 分钟内认领的临时预览。

## Quick start / 60 秒开始分享

1. Install SoloDrop and open it from the VS Code Activity Bar.<br />
   安装 SoloDrop，并从 VS Code 活动栏打开。
2. Drop a file, use the active editor, or choose a local file.<br />
   拖入文件、使用当前编辑器文件，或选择本地文件。
3. Select **Share preview / 分享预览**.<br />
   点击 **Share preview / 分享预览**。
4. Send the verified link already copied to your clipboard.<br />
   将已复制到剪贴板的有效链接发给对方。

## Built for the handoff / 为真正的交付而设计

- **Public link and ownership link stay separate.** A sensitive claim URL is never copied as the link you send to others.<br />
  **公开链接与所有权链接严格分开。** 敏感的认领地址绝不会被当作分享链接复制。
- **Recent previews stay useful across devices.** Share metadata follows VS Code Settings Sync, while local source paths remain on the device where they belong.<br />
  **最近分享可跨设备查看。** 分享记录跟随 VS Code 设置同步，本地源文件路径仍只保留在原设备。
- **Expired temporary previews can be shared again.** SoloDrop reuses the local source when available, or asks you to choose it again on another device.<br />
  **过期的临时预览可以再次分享。** 原文件仍在本机时直接复用；换到其他设备时，只需重新选择文件。
- **English and Simplified Chinese are built in.** Use the **中 / EN** button for instant switching, or follow the VS Code display language automatically.<br />
  **内置英文与简体中文。** 点击 **中 / EN** 即时切换，也可以自动跟随 VS Code 显示语言。

> Temporary previews must be claimed within 60 minutes to remain online. SoloDrop does not describe public previews as private links.<br />
> 临时预览需要在 60 分钟内完成认领才能持续在线。SoloDrop 不会把公开预览描述成私密链接。

## Feedback and support / 反馈与支持

SoloDrop is built for developers who want Agent output to reach teammates, clients and users with less friction.

SoloDrop 服务于希望把 Agent 产物更顺畅地交付给同事、客户和用户的开发者。

- Found a problem or have a format request? [Open a GitHub issue](https://github.com/jobssteve164dev/solodrop/issues).<br />
  遇到问题或希望支持新的文件格式？欢迎[提交 GitHub Issue](https://github.com/jobssteve164dev/solodrop/issues)。
- If SoloDrop saves you time, leave a rating on the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=SZLK.solodrop).<br />
  如果 SoloDrop 帮你节省了时间，欢迎在 [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=SZLK.solodrop) 留下评价。

---

## Development / 开发

```bash
npm ci
npm run check
npm run package
```

Press `F5` in VS Code to run the Extension Development Host.<br />
在 VS Code 中按 `F5` 启动插件开发宿主。

## Publishing / 发布

Pushes to `main` run CI and security checks. The publish workflow increments the patch version, packages the VSIX, publishes to Visual Studio Marketplace and Open VSX, and creates a GitHub release.<br />
推送到 `main` 会运行 CI 与安全检查。发布工作流会递增补丁版本、打包 VSIX、发布到 Visual Studio Marketplace 与 Open VSX，并创建 GitHub Release。

Repository secrets required / 所需仓库密钥：

- `VSCE_PAT`
- `OVSX_PAT`

## Research / 调研

See [the Cloudflare Drop research report](docs/research/cloudflare-drop-vscode-plugin.md).<br />
参阅 [Cloudflare Drop 调研报告](docs/research/cloudflare-drop-vscode-plugin.md)。
