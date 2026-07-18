# SoloDrop Product Direction

## Purpose

SoloDrop closes the gap between an agent creating a file and another person being able to understand it. The product turns a local artifact into a clean browser preview, checks that it is safe to share, publishes it, verifies the public result and returns one link.

## Primary user action

> Drop or select an artifact, then share its verified preview.

The user should not need to understand Workers, static assets, temporary accounts or deployment credentials. Those are implementation details absorbed by the plugin.

On the web, this action remains available before login. Guest users choose a bounded lifetime; registration adds persistent links and cross-device activity history rather than gating the first result.

## Why a web preview instead of sending the file

The web preview is valuable when the recipient should be able to read before deciding whether to download, does not have the source application, or is reviewing a staged deliverable rather than receiving an editable original. It also gives the sender one stable presentation surface for client review, internal approval and external delivery.

This creates three sender controls:

- Download preference: the sender can remove the download action. This reduces casual redistribution but is not described as DRM because browser preview still transmits content to the recipient.
- Review watermark: optional repeated text communicates ownership, recipient or review purpose without blocking reading.
- Lifetime: guest links last 1, 7 or 30 days; authenticated users may keep a share until they delete it.

## First release boundary

- Entry points: sidebar drag-and-drop, file picker, active editor and Explorer context menu.
- Preview types: Markdown, text, code, JSON, images, PDF, CSV and HTML.
- Web delivery: the managed Worker stores artifact bytes in private Cloudflare R2 and serves a short preview URL directly. Expired objects are denied immediately and removed by scheduled cleanup.
- Extension delivery: existing authenticated or temporary Wrangler deployment remains available; the managed R2 web path does not expose cloud storage concepts in the extension's primary action.
- Safety: explicit public-upload confirmation, common credential detection, isolated preview generation and separation of public and claim URLs.
- Verification: every successful share is opened over HTTP before the public link is copied.
- Web trust: the public site uses the official SoloDrop mark, consistent navigation, legal routes, explicit data handling and a professional responsive interface. Trust is established with verifiable boundaries, not vague security claims.
- Web discovery: Chinese and English are first-class, switchable site routes. Each language keeps the same sharing, account and legal journey while publishing its own canonical URL, reciprocal language alternatives and self-contained answers about the product's real limits.

## Product boundaries

- SoloDrop does not describe a public link as private.
- SoloDrop does not describe hiding the download action or adding a watermark as copy protection.
- SoloDrop does not expose Cloudflare credentials in the webview, logs or share history.
- The managed service stores web-uploaded artifact bytes in a private R2 bucket only for the selected share lifecycle. Metadata includes presentation policy, expiry and a hashed management token; raw management tokens are returned only to the creating browser.
- Anonymous visitors can create bounded shares without an account. Their file and metadata are not attached to an activity account. Authenticated users can create persistent shares and see their activity across devices.
- Expiry is enforced on every preview and content request. Scheduled cleanup removes both metadata and content objects after expiry; owners can delete earlier.
- Public links remain bearer links: anyone who has the URL can view the page. Download preference controls the product action but cannot prevent a technically capable recipient from recovering bytes already delivered for browser rendering.

## Success criteria

- A supported artifact can go from VS Code to a verified public preview without leaving the editor.
- The receiver can read the result in a browser without installing the source application.
- Failure messages state whether selection, safety checking, preview generation, deployment or verification failed.
- The main sidebar action remains understandable without documentation.
- Search and AI answer optimization must remain below the immediate sharing action; discoverability cannot turn the homepage into an article or delay the first share.
