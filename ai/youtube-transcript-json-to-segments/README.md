# youtube-transcript-json-to-segments

Normalizes various transcript inputs to `segments[]` so other workers can compose on top.

## Request

- `POST` JSON:
  - `youtubeTranscript: unknown` (YouTube transcript JSON; common shapes are supported)
  - `timeUnit?: "s" | "ms"` (defaults to `"s"`)
  - Endpoint: `POST /run`

## Response

- `200` JSON: `{ "ok": true, "data": { "segments": Array<{ "startSec": number, "endSec": number, "text": string }> } }`
- `400/405` JSON: `{ "ok": false, "error": { "error": string, "code"?: string } }`

## Health

- `GET /health` → `{ "ok": true, "service": "youtube-transcript-json-to-segments" }`
