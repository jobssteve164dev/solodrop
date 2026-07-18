# SoloDrop Product Direction

## Purpose

SoloDrop closes the gap between an agent creating a file and another person being able to understand it. The product turns a local artifact into a clean browser preview, checks that it is safe to share, publishes it, verifies the public result and returns one link.

## Primary user action

> Drop or select an artifact, then share its verified preview.

The user should not need to understand Workers, static assets, temporary accounts or deployment credentials. Those are implementation details absorbed by the plugin.

On the web, this action must remain available before login. The user's immediate job is to get a file shared; registration is a post-success enhancement for future activity history, not a gate in front of the first result.

## First release boundary

- Entry points: sidebar drag-and-drop, file picker, active editor and Explorer context menu.
- Preview types: Markdown, text, code, JSON, images, PDF, CSV and HTML.
- Delivery: authenticated Cloudflare deployment when available; otherwise a temporary deployment that must be claimed within 60 minutes. A verified SoloDrop short link is returned when the managed link service is available, with the original verified preview URL as a delivery fallback.
- Safety: explicit public-upload confirmation, common credential detection, isolated preview generation and separation of public and claim URLs.
- Verification: every successful share is opened over HTTP before the public link is copied.
- Web trust: the public site uses the official SoloDrop mark, consistent navigation, legal routes, explicit data handling and a professional responsive interface. Trust is established with verifiable boundaries, not vague security claims.
- Web discovery: Chinese and English are first-class, switchable site routes. Each language keeps the same sharing, account and legal journey while publishing its own canonical URL, reciprocal language alternatives and self-contained answers about the product's real limits.

## Product boundaries

- SoloDrop does not describe a public link as private.
- SoloDrop does not promise a custom expiry for Cloudflare Drop deployments.
- SoloDrop does not expose Cloudflare credentials in the webview, logs or share history.
- The managed link service controls short links, synchronized temporary expiry, the platform-owned share-page action and basic click counts. Sharing users do not configure that action. The service does not proxy or store artifact contents.
- Anonymous web visitors can create a temporary share. Their file and share metadata are not attached to an activity account. After success, SoloDrop may invite them to register for future history without withholding the completed link.
- High-fidelity Office conversion, access control, large-file delivery and custom expiry still require a later managed Worker/R2 service and are not represented as current capabilities.

## Success criteria

- A supported artifact can go from VS Code to a verified public preview without leaving the editor.
- The receiver can read the result in a browser without installing the source application.
- Failure messages state whether selection, safety checking, preview generation, deployment or verification failed.
- The main sidebar action remains understandable without documentation.
- Search and AI answer optimization must remain below the immediate sharing action; discoverability cannot turn the homepage into an article or delay the first share.
