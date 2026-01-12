# cfw-utils

**Monorepo of lightweight, purpose-built Cloudflare Workers**  
designed to serve as reusable internal utilities across your Cloudflare projects — addressable exclusively via **Service Bindings**.

Think of this as a small celestial armory: a collection of precise, divinely-crafted tools (in the spirit of Viśvakarmā's forge), each Worker doing one thing extremely well.

## Philosophy

- Tiny & focused — each worker solves exactly one problem
- Zero public routes — only callable via Service Bindings (same-account internal traffic)
- Implicit strong authentication — no tokens, no headers, no mTLS needed inside the same Cloudflare account
- Fast, cheap, reliable — leverages Cloudflare's internal network & colocated execution
- Easy to compose — bind multiple utils together to build powerful pipelines

## Current Utilities

| Folder              | Worker Name              | Purpose                                                                 | Status     |
|---------------------|--------------------------|-------------------------------------------------------------------------|------------|
| `ai`                | `segments-to-chapters-ai`              | Summarizes timestamped `segments[]` into chapters via Workers AI  | Added      |
| `ai`                | `youtube-transcript-json-to-segments`  | Normalizes YouTube transcript JSON into timestamped `segments[]`  | Added      |
| `ai`                | `youtube-transcript-json-to-chapters-ai` | Pipeline: YouTube transcript JSON → segments → chapters (AI)     | Added      |
| `ai`                | `demo-consumer`                        | Example consumer of the pipeline via Service Binding              | Added      |
| `ai`                | `telegram-update-to-chapters-ai`       | Telegram webhook: `/chapters <json>` → pipeline → reply           | Added      |

*(This table will grow as more tools are forged…)*

## Workspace Packages

- `@cfw-utils/schemas` (`packages/schemas`): shared Zod schemas + inferred types (source of truth).
- `@cfw-utils/worker-kit` (`packages/worker-kit`): shared runtime helpers for Worker implementations (e.g. `createSchemaHandler`).
- `@cfw-utils/client` (`packages/client`): shared runtime helpers for calling utils via Service Bindings (e.g. `createSchemaClient` and per-util adapters).

## How to Use

1. **Add a binding** in the consumer Worker’s `wrangler.toml`:

```toml
[[services]]
binding = "SEGMENTS_TO_CHAPTERS_AI"  # ← env var name to access the binding
service = "segments-to-chapters-ai"  # ← name of the deployed worker in this monorepo
environment = "production"
```

2. **Call it** from your code (no URL, no auth header needed):

```ts
import { createSegmentsToChaptersAiClient } from "@cfw-utils/client/segments-to-chapters-ai";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const input = await request.text();

    const summarize = createSegmentsToChaptersAiClient(env.SEGMENTS_TO_CHAPTERS_AI);
    const result = await summarize({ text: input, maxChapters: 6 });
    if (!result.ok) {
      return new Response(result.error.error, { status: 502 });
    }
    return new Response(JSON.stringify(result.data, null, 2), {
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
};
```

## Composition Model

- Contracts are Zod schemas in `@cfw-utils/schemas`.
- Worker entrypoints are thin adapters built with `createSchemaHandler()` from `@cfw-utils/worker-kit`.
- Callers use per-util clients (built on `createSchemaClient()` from `@cfw-utils/client`) and compose pipelines by chaining Service Binding calls.

Example pipeline:

- `youtube-transcript-json-to-segments` → outputs `{ ok: true, data: { segments } }`
- `segments-to-chapters-ai` → accepts `{ segments }` and outputs `{ ok: true, data: { chapters } }`
- `youtube-transcript-json-to-chapters-ai` → composes the two steps behind one binding

Endpoint convention:

- `GET /health`
- `POST /run`

## Pipeline Pattern (Kleisli)

Treat each worker as a Kleisli arrow returning a `Result`:

- `A -> Result<B>` where `Result<B> = { ok: true, data: B } | { ok: false, error }`

In pipeline/orchestrator workers:

- Call the upstream binding client.
- If it returns `{ ok: false }`, propagate it (typically as `502`).
- Otherwise pass `data` into the next step.

`@cfw-utils/client` exports helpers like `andThenResult()` to make this style readable.

## Deployment

Each utility is deployed independently:

```bash
# From the root of the monorepo
pnpm --filter=segments-to-chapters-ai deploy
# or
cd ai/segments-to-chapters-ai && wrangler deploy
```

Recommended naming convention for deployed workers:  
`utils-<name>` → e.g. `utils-jwt-verifier`, `utils-rate-limiter`, etc.

## Development

```bash
# Install dependencies (monorepo root)
pnpm install

# Develop one worker (with local bindings simulation)
cd ai/segments-to-chapters-ai
pnpm dev

# Run all tests
pnpm test

# Lint & format everything
pnpm lint
pnpm format
```

## Why Service Bindings?

- **Security**: No public exposure, implicit same-account auth
- **Performance**: Often colocated, subrequests are extremely fast & free
- **Cost**: One billable request total (caller + callee CPU summed)
- **Simplicity**: No need to manage secrets, rotate tokens, or handle TLS certs internally
- **Maintainability**: Centralized logic, easy updates without redeploying callers
