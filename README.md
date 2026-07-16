# SoloDrop

SoloDrop turns files created by coding agents into clean browser previews and gives you a link to share.

## What it does

- Drag a file into the SoloDrop sidebar, share the active editor file, or choose a file.
- Preview Markdown, text, code, JSON, images, PDF, CSV and HTML in a browser.
- Check common secret patterns before publishing.
- Use an authenticated Cloudflare account when available, or create a temporary preview without signing in.
- Copy the public preview link and keep the ownership link separate.
- Follow the VS Code display language automatically, with manual English and Simplified Chinese switching in Settings.

## Use

1. Open SoloDrop from the Activity Bar.
2. Select the artifact you want to share.
3. Choose **Share preview**.
4. SoloDrop builds the preview, verifies the deployment and copies its public URL.

Set **SoloDrop: Language** to `Auto`, `English` or `简体中文`. Changes apply to the sidebar and notifications immediately; `Auto` follows the VS Code display language.

Temporary previews must be claimed within 60 minutes to remain online. The ownership link is sensitive and is never copied as the public share link.

## Development

```bash
npm ci
npm run check
npm run package
```

Press `F5` in VS Code to run the Extension Development Host.

## Publishing

Pushes to `main` run CI and security checks. The publish workflow increments the patch version, packages the VSIX, publishes to Visual Studio Marketplace and Open VSX, and creates a GitHub release.

Repository secrets required:

- `VSCE_PAT`
- `OVSX_PAT`

## Research

See [the Cloudflare Drop research report](docs/research/cloudflare-drop-vscode-plugin.md).
