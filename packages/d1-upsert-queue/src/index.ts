import type { D1UpsertMessage, D1UpsertJob, Env } from "./types"

export type { D1UpsertMessage, D1UpsertJob, Env }

/**
 * Validates a table/column name to prevent SQL injection
 * Only allows alphanumeric and underscore, must start with letter
 */
function isValidIdentifier(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)
}

/**
 * Generates parameterized INSERT ... ON CONFLICT DO UPDATE SQL
 */
function generateUpsertSQL(
  table: string,
  primaryKey: string,
  record: Record<string, unknown>
): { sql: string; params: unknown[] } {
  if (!isValidIdentifier(table)) {
    throw new Error(`Invalid table name: ${table}`)
  }
  if (!isValidIdentifier(primaryKey)) {
    throw new Error(`Invalid primary key: ${primaryKey}`)
  }

  const columns = Object.keys(record)
  
  // Validate all column names
  for (const col of columns) {
    if (!isValidIdentifier(col)) {
      throw new Error(`Invalid column name: ${col}`)
    }
  }

  const placeholders = columns.map(() => "?").join(", ")
  const columnNames = columns.join(", ")
  
  // Columns to update (all except primary key)
  const updateColumns = columns.filter(col => col !== primaryKey)
  const updateClause = updateColumns.length > 0
    ? updateColumns.map(col => `${col} = excluded.${col}`).join(", ")
    : `${primaryKey} = excluded.${primaryKey}` // No-op if only PK

  const sql = `
    INSERT INTO ${table} (${columnNames})
    VALUES (${placeholders})
    ON CONFLICT(${primaryKey}) DO UPDATE SET
      ${updateClause}
  `

  const params = columns.map(col => record[col] ?? null)

  return { sql, params }
}

/**
 * Updates job progress in the target D1 database
 * Uses atomic increment to handle concurrent message processing
 */
async function updateJobProgress(
  db: D1Database,
  jobId: string,
  total: number,
  processedIncrement: number = 0,
  failedIncrement: number = 0,
  error?: string
): Promise<void> {
  // First, ensure the job record exists
  await db.prepare(`
    INSERT OR IGNORE INTO d1_upsert_jobs 
    (id, status, total_records, processed_records, failed_records, error_message, created_at, updated_at)
    VALUES (?, 'processing', ?, 0, 0, NULL, datetime('now'), datetime('now'))
  `).bind(jobId, total).run()

  // Atomically increment counters and determine new status
  const result = await db.prepare(`
    UPDATE d1_upsert_jobs
    SET 
      processed_records = processed_records + ?,
      failed_records = failed_records + ?,
      error_message = COALESCE(?, error_message),
      status = CASE 
        WHEN (processed_records + ?) + (failed_records + ?) >= total_records THEN 
          CASE WHEN (failed_records + ?) > 0 THEN 'failed' ELSE 'completed' END
        ELSE 'processing'
      END,
      updated_at = datetime('now')
    WHERE id = ?
    RETURNING status, processed_records, failed_records
  `).bind(
    processedIncrement,
    failedIncrement,
    error ?? null,
    processedIncrement,
    failedIncrement,
    failedIncrement,
    jobId
  ).first<{ status: string; processed_records: number; failed_records: number }>()

  if (!result) {
    throw new Error(`Failed to update job progress for ${jobId}`)
  }
  
  console.log(`[d1-upsert-queue] Job ${jobId} progress: ${result.processed_records}/${total} processed, status: ${result.status}`)
}

/**
 * Queue consumer handler
 */
/**
 * Validates the message format to prevent processing errors
 */
function validateMessage(msg: unknown): msg is D1UpsertMessage {
  if (!msg || typeof msg !== 'object') return false
  
  const m = msg as Record<string, unknown>
  
  // Required fields
  const required = ['jobId', 'database', 'table', 'primaryKey', 'record', 'index', 'total']
  for (const field of required) {
    if (!(field in m)) {
      console.error(`Missing required field: ${field}`)
      return false
    }
  }
  
  // Type checks
  if (typeof m.jobId !== 'string') return false
  if (typeof m.database !== 'string') return false
  if (typeof m.table !== 'string') return false
  if (typeof m.primaryKey !== 'string') return false
  if (typeof m.record !== 'object' || m.record === null) return false
  if (typeof m.index !== 'number') return false
  if (typeof m.total !== 'number') return false
  
  // Sanity checks
  if (m.index < 0 || m.index >= m.total) {
    console.error(`Invalid index ${m.index} for total ${m.total}`)
    return false
  }
  
  if (m.total > 100000) {
    console.error(`Suspiciously large job: ${m.total} records`)
    return false
  }
  
  return true
}

// Circuit breaker state per database
const circuitBreakers = new Map<string, { failures: number; lastFailure: number; open: boolean }>()
const CIRCUIT_BREAKER_THRESHOLD = 5
const CIRCUIT_BREAKER_TIMEOUT_MS = 60000 // 1 minute

/**
 * Check if circuit breaker is open for a database
 */
function isCircuitOpen(database: string): boolean {
  const cb = circuitBreakers.get(database)
  if (!cb) return false
  
  if (cb.open) {
    // Check if we should try closing
    if (Date.now() - cb.lastFailure > CIRCUIT_BREAKER_TIMEOUT_MS) {
      console.log(`Circuit breaker for ${database} timeout elapsed, attempting reset`)
      cb.open = false
      cb.failures = 0
      return false
    }
    return true
  }
  return false
}

/**
 * Record success for circuit breaker
 */
function recordSuccess(database: string): void {
  const cb = circuitBreakers.get(database)
  if (cb) {
    cb.failures = 0
    cb.open = false
  }
}

/**
 * Record failure for circuit breaker
 */
function recordFailure(database: string): void {
  const cb = circuitBreakers.get(database) || { failures: 0, lastFailure: 0, open: false }
  cb.failures++
  cb.lastFailure = Date.now()
  
  if (cb.failures >= CIRCUIT_BREAKER_THRESHOLD) {
    cb.open = true
    console.error(`Circuit breaker OPENED for ${database} after ${cb.failures} failures`)
  }
  
  circuitBreakers.set(database, cb)
}

async function handleQueue(
  batch: MessageBatch<D1UpsertMessage>,
  env: Env
): Promise<void> {
  console.log(`[d1-upsert-queue] Processing batch of ${batch.messages.length} messages`)
  
  // Validate message batch size (prevent memory issues)
  if (batch.messages.length > 100) {
    console.warn(`Large batch received: ${batch.messages.length} messages`)
  }
  
  // Group messages by database for circuit breaker efficiency
  const messagesByDb = new Map<string, typeof batch.messages>()
  for (const message of batch.messages) {
    if (!validateMessage(message.body)) {
      console.error("Invalid message format, acknowledging to prevent retry loop:", message.body)
      message.ack()
      continue
    }
    
    const db = message.body.database
    const list = messagesByDb.get(db) || []
    list.push(message)
    messagesByDb.set(db, list)
  }
  
  // Process each database group
  for (const [database, messages] of messagesByDb) {
    // Check circuit breaker
    if (isCircuitOpen(database)) {
      console.warn(`Circuit breaker is OPEN for ${database}, retrying all messages`)
      for (const msg of messages) {
        msg.retry()
      }
      continue
    }
    
    const db = env[database] as D1Database | undefined
    if (!db) {
      console.error(`[d1-upsert-queue] Database binding not found: ${database}`)
      console.error(`[d1-upsert-queue] Available env keys: ${Object.keys(env).join(', ')}`)
      recordFailure(database)
      for (const msg of messages) {
        msg.retry()
      }
      continue
    }
    
    console.log(`[d1-upsert-queue] Processing ${messages.length} messages for database: ${database}`)
    
    // Process messages for this database
    for (const message of messages) {
      const { jobId, table, primaryKey, record, index, total } = message.body

      try {
        // Generate and execute upsert SQL
        const { sql, params } = generateUpsertSQL(table, primaryKey, record)
        await db.prepare(sql).bind(...params).run()

        // Update job progress (increment by 1)
        await updateJobProgress(db, jobId, total, 1, 0)

        // Record success for circuit breaker
        recordSuccess(database)

        // Acknowledge successful processing
        message.ack()
        console.log(`[d1-upsert-queue] Processed record ${index + 1}/${total} for job ${jobId}`)

      } catch (error) {
        console.error(`Failed to upsert record ${index} for job ${jobId}:`, error)
        recordFailure(database)

        // Try to update job with failure info
        try {
          await updateJobProgress(
            db,
            jobId,
            total,
            0,
            1,
            String(error)
          )
        } catch (e) {
          console.error("Failed to update job progress:", e)
        }

        // Retry the message
        message.retry()
      }
    }
  }
}

/**
 * SQL to create the job tracking table
 * Consumers should run this in their D1 database
 */
export const JOB_TRACKING_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS d1_upsert_jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'queued',
  total_records INTEGER NOT NULL,
  processed_records INTEGER NOT NULL DEFAULT 0,
  failed_records INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_d1_upsert_jobs_status ON d1_upsert_jobs(status);
CREATE INDEX IF NOT EXISTS idx_d1_upsert_jobs_created ON d1_upsert_jobs(created_at);
`

export default {
  async queue(batch: MessageBatch<D1UpsertMessage>, env: Env): Promise<void> {
    return handleQueue(batch, env)
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "POST") {
      await env.D1_UPSERT_QUEUE.send({
        jobId: "test-job-" + Date.now(),
        database: "DB",
        table: "employees",
        primaryKey: "number",
        record: { number: 999999, firstName: "Test", lastName: "User" },
        index: 0,
        total: 1
      });
      return new Response("Sent test message to queue");
    }
    return new Response("Queue consumer is running");
  }
}
