# demo-consumer

Example worker that consumes `youtube-transcript-json-to-chapters-ai` via a Service Binding.

## Request

- `POST /run` JSON: `{ "youtubeTranscript": unknown, "timeUnit"?: "s" | "ms", "maxChapters"?: number, "temperature"?: number, "model"?: string }`

## Response

- Proxies the downstream `Result` envelope.
