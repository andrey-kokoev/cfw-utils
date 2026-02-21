```markdown
# feedback-gitops

Event-sourced feedback loop for Cloudflare Pages. Embeddable widget submits to GitHub Issues via Queue, triggering agent execution and automatic deployment.

## Prerequisites

- Cloudflare account with Queues enabled
- GitHub repository with Pages-connected `main` branch
- GitHub Personal Access Token (classic) with `repo` scope
- Repository secret `AGENT_PAT` for GitHub Actions

## Installation

```bash
npm install @cfw-utils/feedback-gitops
```

## Configuration

### wrangler.toml

```toml
name = "feedback-loop"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[queues.producers]]
queue = "feedback-queue"
binding = "FEEDBACK_QUEUE"

[[queues.consumers]]
queue = "feedback-queue"
max_batch_size = 10
max_batch_timeout = 30
```

### Environment Variables

```bash
wrangler secret put GITHUB_PAT          # Repo-scoped PAT
wrangler secret put GITHUB_REPO_OWNER   # "andrey-kokoev"
wrangler secret put GITHUB_REPO_NAME    # "my-site"
```

## Usage

### 1. Worker Setup

```typescript
import { createFeedbackWidget, createIssueConsumer } from '@andrey-kokoev/cfw-utils/patterns/feedback-loop';

interface Env {
  FEEDBACK_QUEUE: Queue;
  GITHUB_PAT: string;
  GITHUB_REPO_OWNER: string;
  GITHUB_REPO_NAME: string;
}

const config = {
  queue: env.FEEDBACK_QUEUE,
  github: {
    pat: env.GITHUB_PAT,
    owner: env.GITHUB_REPO_OWNER,
    repo: env.GITHUB_REPO_NAME,
    labels: ['agent-execute']
  }
};

export default {
  fetch: createFeedbackWidget(config),
  queue: createIssueConsumer(config)
};
```

### 2. Widget Embed

Add to any Cloudflare Pages site (or external site):

```html
<script 
  src="https://feedback-loop.your-account.workers.dev/widget.js"
  data-endpoint="https://feedback-loop.your-account.workers.dev/api/issue"
  data-repo="owner/repo"
  data-labels="bug,agent-execute">
</script>
```

The script injects a floating button and modal form. Submissions create Issues with metadata:

```json
{
  "title": "User feedback: Button not responsive",
  "body": "Description...\n\n**Context:**\n- URL: https://example.com/page\n- UserAgent: Mozilla/5.0...
- Timestamp: 2024-01-15T10:30:00Z",
  "labels": ["agent-execute", "bug"]
}
```

### 3. Agent Configuration

Create `.github/workflows/agent.yml`:

```yaml
name: Agent Execution
on:
  issues:
    types: [opened, labeled]

jobs:
  execute:
    if: contains(github.event.issue.labels.*.name, 'agent-execute')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Agent
        run: |
          npm install -g @anthropic-ai/claude-code
          claude-code --version
      - name: Execute Issue
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          ISSUE_BODY: ${{ github.event.issue.body }}
        run: |
          # Your agent logic here
          echo "$ISSUE_BODY" | claude-code --stdin --output ./changes.patch
          git apply ./changes.patch
          git add .
          git commit -m "fix: resolve #${{ github.event.issue.number }}"
          git push origin main
```

## Architecture

```
User Submission
      │
      ▼
┌─────────────┐
│   Widget    │  (Vanilla JS injected into DOM)
│   (Client)  │
└──────┬──────┘
       │
       POST /api/issue
       │
       ▼
┌─────────────┐     ┌─────────────┐
│   Worker    │────▶│    Queue    │  (Durability buffer)
│   (Edge)    │     │             │
└─────────────┘     └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  Consumer   │  (Batch processor)
                    │   Worker    │
                    └──────┬──────┘
                           │
                           POST GitHub API
                           │
                           ▼
                    ┌─────────────┐
                    │ GitHub      │
                    │ Issues      │
                    └──────┬──────┘
                           │
                    Webhook trigger
                           │
                           ▼
                    ┌─────────────┐
                    │ GitHub      │
                    │ Actions     │  (Agent sandbox)
                    └──────┬──────┘
                           │
                    git push origin main
                           │
                           ▼
                    ┌─────────────┐
                    │ Cloudflare  │
                    │ Pages       │  (Auto-deploy)
                    └─────────────┘
```

## API Reference

### `createFeedbackWidget(config)`

Returns a Cloudflare Worker fetch handler serving both the widget bundle and ingestion endpoint.

**Config:**
- `queue`: Bound Queue instance
- `github.pat`: Personal Access Token
- `github.owner`: Repository owner
- `github.repo`: Repository name
- `github.labels`: Array of labels to apply (default: `["agent-execute"]`)
- `cors`: CORS configuration for cross-origin embedding

**Routes:**
- `GET /widget.js` - Returns minified widget script
- `POST /api/issue` - Accepts JSON payload, enqueues to Queue

### `createIssueConsumer(config)`

Returns Queue consumer function processing batches.

**Behavior:**
- Batch size: 10 messages (configurable via wrangler.toml)
- Retry: 3 attempts with exponential backoff
- Dead letter: Failed issues tagged with `failed-to-create` label after exhaustion

### Widget Frontend

The injected script exposes global `window.CFWidget` with:

- `open()` - Programmatically open modal
- `close()` - Close modal
- `submit(data)` - Submit issue programmatically

## Security

- **PAT Storage**: Never expose GitHub token in client-side code; Queue consumer operates in Worker isolate
- **Rate Limiting**: Widget implements 60-second cooldown per IP (Cloudflare Rate Limiting API)
- **Validation**: Worker validates payload schema before enqueueing; rejects HTML/JS injection attempts
- **CORS**: Whitelist domains in config to prevent abuse on unauthorized sites

## Limitations

- Queue consumer timeout: 30 seconds max per batch
- GitHub API rate limit: 5000 requests/hour (sufficient for <1000 issues/hour)
- Widget bundle size: ~12kb gzipped (includes screenshot capture via html2canvas-lite)

