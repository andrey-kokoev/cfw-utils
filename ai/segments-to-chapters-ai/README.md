# segments-to-chapters-ai

Internal utility Worker meant to be called via a Service Binding.

## Request

- `POST` JSON:
  - Provide either:
    - `text?: string` (max 50k chars)
    - `segments?: Array<{ startSec: number, endSec: number, text: string }>` (timestamped transcript)
  - `maxChapters?: number` (1–20)
  - `temperature?: number` (0–2)
  - `model?: string` (optional override)
  - Endpoint: `POST /run`

## Response

- `200` JSON: `{ "ok": true, "data": { "chapters": Array<{ "title": string, "summary": string, "keyPoints": string[], "keywords": string[], "startSec": number|null, "endSec": number|null }> } }`
- `400/405/500/502` JSON: `{ "ok": false, "error": { "error": string, "code"?: string } }`

This worker requires the `AI` binding (Workers AI).

## Health

- `GET /health` → `{ "ok": true, "service": "segments-to-chapters-ai" }`
