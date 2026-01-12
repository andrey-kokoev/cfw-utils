# youtube-transcript-json-to-chapters-ai

Pipeline worker: normalizes a YouTube transcript JSON into timestamped `segments[]`, then summarizes to chapters via Workers AI.

## Request

- `POST /run` JSON: `{ "youtubeTranscript": unknown, "timeUnit"?: "s" | "ms", "maxChapters"?: number, "temperature"?: number, "model"?: string }`

## Response

- `200` JSON: `{ "ok": true, "data": { "chapters": [...] } }`
- `4xx/5xx` JSON: `{ "ok": false, "error": { "error": string, "code"?: string } }`

## Health

- `GET /health` → `{ "ok": true, "service": "youtube-transcript-json-to-chapters-ai" }`
