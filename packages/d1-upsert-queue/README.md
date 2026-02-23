# @cfw-utils/d1-upsert-queue

Generic Cloudflare Queue consumer for D1 upsert operations.

## Purpose

Provides asynchronous, reliable bulk upserts to Cloudflare D1 databases via queues.

## Architecture

```
Producer (any Worker)          Queue                Consumer (this package)
       │                         │                          │
       │  send({ jobId, db,      │                          │
       │         table, pk,      ▼                          │
       │         record })  ┌─────────┐                     │
       └──────────────────▶│  Queue  │────────────────────▶│
                           └─────────┘                     │
                                                          │
                              ┌─────────────────────────────┘
                              ▼
                         ┌─────────┐
                         │    D1   │
                         │ (upsert)│
                         └─────────┘
```

## Usage

### 1. Producer Configuration

Add to your `wrangler.toml`:

```toml
[[queues.producers]]
queue = "d1-upsert-queue"
binding = "D1_UPSERT_QUEUE"
```

### 2. Create Job Tracking Table

Run in your D1 database:

```sql
CREATE TABLE d1_upsert_jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'queued',
  total_records INTEGER NOT NULL,
  processed_records INTEGER NOT NULL DEFAULT 0,
  failed_records INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Or use the exported SQL:

```typescript
import { JOB_TRACKING_TABLE_SQL } from "@cfw-utils/d1-upsert-queue";
```

### 3. Send Messages

```typescript
const queue = env.D1_UPSERT_QUEUE as Queue;

await queue.send({
  jobId: "uuid",
  database: "DB",      // D1 binding name
  table: "employees",
  primaryKey: "number",
  record: { number: 123, name: "John" },
  index: 0,
  total: 1000
});
```

### 4. Poll Job Status

Query the `d1_upsert_jobs` table in your D1 database.

## Message Format

```typescript
interface D1UpsertMessage {
  jobId: string;              // UUID for tracking
  database: string;           // D1 binding name
  table: string;              // Target table
  primaryKey: string;         // Conflict resolution column
  record: Record<string, unknown>;  // Column values
  index: number;              // Position (0-based)
  total: number;              // Total records
}
```

## Important: D1 Database Binding

The queue consumer **must have D1 bindings** that match the binding names used by producers. Edit `wrangler.toml` before deploying:

```toml
[[d1_databases]]
binding = "DB"  # Must match producer's binding name
database_name = "your-database"
database_id = "your-database-id"
```

**Note:** This makes the deployed worker specific to a particular D1 database. For multiple apps, either:
- Deploy separate instances with different D1 bindings
- Or fork/copy this package per app

## Deployment

```bash
# 1. Configure D1 bindings in wrangler.toml
# 2. Deploy
pnpm deploy
```

## Consumer Configuration

The consumer is configured in this package's `wrangler.toml`:

```toml
[[queues.consumers]]
queue = "d1-upsert-queue"
max_batch_size = 20
max_batch_timeout = 5
max_retries = 3
```

## Error Handling

- Failed messages are retried up to `max_retries`
- Job status updated with `failed_records` count
- Errors logged to console
