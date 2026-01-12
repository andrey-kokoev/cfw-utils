# Agent Notes (cfw-utils)

This repo is a `pnpm` workspace monorepo of Cloudflare Workers intended to be called via **Service Bindings** (no public routes configured).

## Layout

- Workers live under category folders (currently `ai/*`).
- Shared workspace packages live under `packages/*`:
  - `packages/schemas`: Zod schemas are the source of truth (types via `z.infer`).
  - `packages/worker-kit`: shared runtime helpers for Worker implementations (prefer `createSchemaHandler`).
  - `packages/client`: shared runtime helpers for calling utils via Service Bindings (prefer `createSchemaClient` + per-util adapters).
- Each worker is a self-contained Wrangler project with its own `wrangler.toml` and `src/`.

## Commands

- Install: `pnpm install`
- Dev (all packages): `pnpm -r --parallel dev`
- Deploy (one worker): `pnpm --filter=segments-to-chapters-ai deploy`
- Test: `pnpm test`
- Lint/format: `pnpm lint`, `pnpm format` (also `pnpm check`)

## Conventions

- Prefer small, single-purpose workers.
- Keep worker logic in small pure modules (easy to unit test), and keep `src/index.ts` thin.
- Define contracts as Zod schemas in `@cfw-utils/schemas` and validate both request and response.
- Use `createSchemaHandler` for worker entrypoints and `createSchemaClient` for callers to keep composition predictable.
- Service endpoints are modeled as Kleisli arrows returning a `Result` envelope: `{ ok: true, data } | { ok: false, error }`.
- Prefer endpoint convention: `GET /health` and `POST /run`.
- Don’t add `routes` in `wrangler.toml`; workers should be reachable only through Service Bindings.
- Prefer using Wrangler’s `ai = { binding = "AI" }` for Workers AI-backed utilities.
