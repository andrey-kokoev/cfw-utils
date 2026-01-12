# telegram-update-to-chapters-ai

Telegram webhook worker that turns a Telegram message into a call to `youtube-transcript-json-to-chapters-ai`, then replies with formatted chapters.

## Setup

- Set the Telegram webhook to `POST https://<worker-domain>/run`
- (Recommended) Configure Telegram webhook secret token and set Worker secret `TELEGRAM_WEBHOOK_SECRET`
- Set Worker secret `TELEGRAM_BOT_TOKEN`

Example:

- `wrangler secret put TELEGRAM_BOT_TOKEN`
- `wrangler secret put TELEGRAM_WEBHOOK_SECRET`

## Commands

- `/chapters <youtube transcript json>` (paste JSON after the command)

## Endpoints

- `GET /health`
- `POST /run` (Telegram webhook)
