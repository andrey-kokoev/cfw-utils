# Pipeline Worker Template

This template shows the standard “Kleisli pipeline” pattern used in this repo:

- Validate input with Zod schema (`@cfw-utils/schemas`)
- Use `createSchemaHandler` (`@cfw-utils/worker-kit`) for the entrypoint
- Call downstream bindings with typed clients (`@cfw-utils/client/*`)
- Propagate `Result` errors unchanged (usually as `502`)

Copy an existing pipeline worker (e.g. `ai/youtube-transcript-json-to-chapters-ai`) and adjust:

- the request schema
- bindings in `wrangler.toml`
- which clients are called and how their outputs are threaded

