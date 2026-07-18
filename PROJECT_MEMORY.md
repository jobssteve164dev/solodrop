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
- Web sharing uses a private R2 bucket because a Cloudflare Worker cannot reliably create temporary Workers through the Claim Deployments API (`worker_subrequest_blocked`). Guest shares have bounded expiry; authenticated users may create persistent shares.
- The extension's formal share action uses the same R2-backed service as the website, so 1/7/30-day expiry, optional text watermarks and download presentation are one implementation across both surfaces. Existing Wrangler modules remain for compatibility with older records and focused regression coverage, not as a parallel sidebar publishing path.
- Web sharing is guest-first. Login and registration must never block the first temporary share; account creation is offered after the link works as an enhancement for future cross-device activity history.
- The public web experience has first-class Chinese (`/`) and English (`/en`) routes. Language switching covers sharing status, account flows, activity and legal pages; SEO/GEO content stays after the primary sharing action.

## Architecture Boundaries

- `src/preview.ts` owns the static content-first preview artifact.
- `src/linkService.ts` is the extension's only managed-link client.
- `worker/src/index.mjs` owns routing, short-link compatibility, sessions, rate limits and managed share orchestration. `worker/src/shares.mjs` owns R2 metadata/content storage, preview rendering, download policy, watermarking, expiry enforcement, owner/token deletion and scheduled cleanup.
- DOCX and PPTX previews use the same browser-rendering stack validated by SoloView: `docx-preview` and `@aiden0z/pptx-renderer`. The bundled viewer is served as a managed `drop.szlk.ai` asset; artifact bytes remain in the temporary preview Worker and are fetched directly by the recipient's browser.
- Web uploads are stored under separate R2 metadata and content keys. Metadata stores only a hash of the deletion token. Expired content returns `410` immediately and is physically removed by the hourly cleanup trigger.
- Hiding the download action is a presentation policy, not DRM: browser preview still requires readable content bytes. Custom text watermarks are non-interactive ownership/review overlays and must never block the artifact.
- Public and claim URLs remain separate; link-management tokens stay in extension state and are not sent to the sidebar Webview.
- Legacy plugin-side temporary deployment retries only Cloudflare temporary-account provisioning failures with explicit 429/502/503/504 evidence. The current sidebar share action does not use this Wrangler path.
- A successful Wrangler deploy can precede global `workers.dev` route availability. Public-preview verification allows about 60 seconds of progressive propagation and cache-busts each probe so a transient edge 404 does not falsely fail an otherwise successful share; the link is still accepted only after a real 2xx response.

## Verification

- Default CI: `.github/workflows/ci.yml`
- Default security checks: `.github/workflows/security.yml`
- Link-service bundle: `npm run worker:check`
- Production link-service deploy: `.github/workflows/deploy-worker.yml`

## Handoff Notes

-
