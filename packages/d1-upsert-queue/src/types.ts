/**
 * Message type for D1 upsert queue
 */
export interface D1UpsertMessage {
  /** Unique job identifier */
  jobId: string
  /** D1 database binding name */
  database: string
  /** Table name */
  table: string
  /** Primary key column name for conflict resolution */
  primaryKey: string
  /** Record to upsert */
  record: Record<string, unknown>
  /** Position in job (0-based) */
  index: number
  /** Total records in job */
  total: number
}

/**
 * Job status tracking (stored in target D1)
 */
export interface D1UpsertJob {
  id: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  totalRecords: number
  processedRecords: number
  failedRecords: number
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Environment bindings for the worker
 */
export interface Env {
  /** Queue binding */
  D1_UPSERT_QUEUE: Queue<D1UpsertMessage>
  /** Dynamic D1 bindings - accessed via env[databaseName] */
  [databaseName: string]: unknown
}
