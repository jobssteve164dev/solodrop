# SoloDrop Product Direction

## Purpose

SoloDrop closes the gap between an agent creating a file and another person being able to understand it. The product turns a local artifact into a clean browser preview, checks that it is safe to share, publishes it, verifies the public result and returns one link.

## Primary user action

> Drop or select an artifact, then share its verified preview.

The user should not need to understand Workers, static assets, temporary accounts or deployment credentials. Those are implementation details absorbed by the plugin.

## First release boundary

- Entry points: sidebar drag-and-drop, file picker, active editor and Explorer context menu.
- Preview types: Markdown, text, code, JSON, images, PDF, CSV and HTML.
- Delivery: authenticated Cloudflare deployment when available; otherwise a temporary deployment that must be claimed within 60 minutes. A verified SoloDrop short link is returned when the managed link service is available, with the original verified preview URL as a delivery fallback.
- Safety: explicit public-upload confirmation, common credential detection, isolated preview generation and separation of public and claim URLs.
- Verification: every successful share is opened over HTTP before the public link is copied.

## Product boundaries

- SoloDrop does not describe a public link as private.
- SoloDrop does not promise a custom expiry for Cloudflare Drop deployments.
- SoloDrop does not expose Cloudflare credentials in the webview, logs or share history.
- The managed link service controls short links, synchronized temporary expiry, optional CTA configuration and basic click counts. It does not proxy or store artifact contents.
- High-fidelity Office conversion, access control, large-file delivery and custom expiry still require a later managed Worker/R2 service and are not represented as current capabilities.

## Success criteria

- A supported artifact can go from VS Code to a verified public preview without leaving the editor.
- The receiver can read the result in a browser without installing the source application.
- Failure messages state whether selection, safety checking, preview generation, deployment or verification failed.
- The main sidebar action remains understandable without documentation.
