# PROJECT_MEMORY.md

This file stores stable project facts future agents should reuse. Do not paste run logs, prompts, terminal output, or one-off debugging notes here.

## Project Identity

- Name: solodrop
- Type: Infrastructure / tooling foundation
- Users:
- Current stage:

## Stable Decisions

- Managed short links use `drop.szlk.ai`; short-link failure falls back to the already verified original preview instead of blocking delivery.
- Preview content is independent of the managed component. The platform-owned action, attribution and statistics cannot become prerequisites for reading or downloading an artifact.
- The share-page action is designed and controlled by SoloDrop. Sharing users only choose an artifact and must never be asked to configure action copy, destination or monetization policy.
- The platform action renders from the managed embed even when a preview is opened through its original `workers.dev` URL or managed-link configuration is unavailable. Short-link markers enhance configuration and statistics; they are not a visibility prerequisite for the action.
- The first web version validates demand with Cloudflare temporary accounts only. SoloDrop may retain Passport-linked account sessions and activity metadata, but must not persist artifact bytes in Durable Objects, R2, or another product-owned store.
- Web sharing is guest-first. Login and registration must never block the first temporary share; account creation is offered after the link works as an enhancement for future cross-device activity history.
- The public web experience has first-class Chinese (`/`) and English (`/en`) routes. Language switching covers sharing status, account flows, activity and legal pages; SEO/GEO content stays after the primary sharing action.

## Architecture Boundaries

- `src/preview.ts` owns the static content-first preview artifact.
- `src/linkService.ts` is the extension's only managed-link client.
- `worker/src/index.mjs` owns short-link validation, lifecycle, the platform action, visit counts, rate limits and management-token deletion. It does not proxy or store artifact contents.
- DOCX and PPTX previews use the same browser-rendering stack validated by SoloView: `docx-preview` and `@aiden0z/pptx-renderer`. The bundled viewer is served as a managed `drop.szlk.ai` asset; artifact bytes remain in the temporary preview Worker and are fetched directly by the recipient's browser.
- The web upload request forwards file bytes directly into a temporary Cloudflare Worker deployment and discards its temporary API token after the request. The claim URL is returned only in that share request's browser response and is never written to general activity records or logs.
- Public and claim URLs remain separate; link-management tokens stay in extension state and are not sent to the sidebar Webview.
- Plugin-side temporary deployment retries only Cloudflare temporary-account provisioning failures with explicit 429/502/503/504 evidence, including Wrangler's temporary-account creation and proof-of-work challenge request stages. Worker upload and other ambiguous deployment failures are not blindly retried; this avoids turning resilience into duplicate publishing.
- A successful Wrangler deploy can precede global `workers.dev` route availability. Public-preview verification allows about 60 seconds of progressive propagation and cache-busts each probe so a transient edge 404 does not falsely fail an otherwise successful share; the link is still accepted only after a real 2xx response.

## Verification

- Default CI: `.github/workflows/ci.yml`
- Default security checks: `.github/workflows/security.yml`
- Link-service bundle: `npm run worker:check`
- Production link-service deploy: `.github/workflows/deploy-worker.yml`

## Handoff Notes

-
