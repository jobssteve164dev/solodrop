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
- The first web version validates demand with Cloudflare temporary accounts only. SoloDrop may retain Passport-linked account sessions and activity metadata, but must not persist artifact bytes in Durable Objects, R2, or another product-owned store.
- Web sharing is guest-first. Login and registration must never block the first temporary share; account creation is offered after the link works as an enhancement for future cross-device activity history.

## Architecture Boundaries

- `src/preview.ts` owns the static content-first preview artifact.
- `src/linkService.ts` is the extension's only managed-link client.
- `worker/src/index.mjs` owns short-link validation, lifecycle, the platform action, visit counts, rate limits and management-token deletion. It does not proxy or store artifact contents.
- The web upload request forwards file bytes directly into a temporary Cloudflare Worker deployment and discards its temporary API token after the request. The claim URL is returned only in that share request's browser response and is never written to general activity records or logs.
- Public and claim URLs remain separate; link-management tokens stay in extension state and are not sent to the sidebar Webview.

## Verification

- Default CI: `.github/workflows/ci.yml`
- Default security checks: `.github/workflows/security.yml`
- Link-service bundle: `npm run worker:check`
- Production link-service deploy: `.github/workflows/deploy-worker.yml`

## Handoff Notes

-
