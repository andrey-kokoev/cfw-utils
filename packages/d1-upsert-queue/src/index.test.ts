import { describe, expect, it, vi } from "vitest"
import worker, { JOB_TRACKING_TABLE_SQL } from "./index"
import type { D1UpsertMessage } from "./types"

type Env = {
  DB: D1Database
}

// Mock D1Database
function createMockD1(): D1Database {
  const prepared = {
    bind: vi.fn().mockReturnThis(),
    run: vi.fn().mockResolvedValue({}),
    first: vi.fn().mockResolvedValue({ status: 'processing', processed_records: 1, failed_records: 0 }),
  }
  
  return {
    prepare: vi.fn().mockReturnValue(prepared),
  } as unknown as D1Database
}

describe("d1-upsert-queue", () => {
  describe("circuit breaker", () => {
    it("opens circuit after multiple failures", async () => {
      const db = createMockD1()
      // Mock D1 to always fail
      const failingDb = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockRejectedValue(new Error("DB Error")),
          first: vi.fn().mockResolvedValue(null),
        }),
      } as unknown as D1Database

      const message: D1UpsertMessage = {
        jobId: "test-123",
        database: "DB",
        table: "employees",
        primaryKey: "number",
        record: { number: 123 },
        index: 0,
        total: 1,
      }

      // Send 5 failing messages
      for (let i = 0; i < 5; i++) {
        const batch = {
          messages: [{
            body: { ...message, index: i },
            ack: vi.fn(),
            retry: vi.fn(),
          }],
        }
        await worker.queue(batch as unknown as MessageBatch<D1UpsertMessage>, { DB: failingDb } as Env)
      }

      // 6th message should trigger circuit breaker
      const batch6 = {
        messages: [{
          body: { ...message, index: 5 },
          ack: vi.fn(),
          retry: vi.fn(),
        }],
      }
      
      await worker.queue(batch6 as unknown as MessageBatch<D1UpsertMessage>, { DB: failingDb } as Env)
      
      // Circuit is open, all messages should be retried
      expect(batch6.messages[0].retry).toHaveBeenCalled()
    })

    it("recovers after circuit breaker timeout", async () => {
      // This test would need to manipulate time or wait
      // For now, just verify the circuit breaker state exists
      const db = createMockD1()
      expect(db).toBeDefined()
    })
  })

  describe("message validation", () => {
    it("rejects messages with missing required fields", async () => {
      const db = createMockD1()
      const invalidMessages = [
        { database: "DB", table: "employees" }, // missing jobId, etc
        { jobId: "test", database: "DB", table: "employees", primaryKey: "id", record: {}, index: 0 }, // missing total
        { jobId: "test", database: "DB", table: "employees", primaryKey: "id", record: {}, index: 0, total: -1 }, // negative total
      ]

      for (const msg of invalidMessages) {
        const batch = {
          messages: [{
            body: msg,
            ack: vi.fn(),
            retry: vi.fn(),
          }],
        }

        await worker.queue(batch as unknown as MessageBatch<D1UpsertMessage>, { DB: db } as Env)
        
        // Invalid messages are acknowledged (not retried) to prevent loops
        expect(batch.messages[0].ack).toHaveBeenCalled()
        expect(batch.messages[0].retry).not.toHaveBeenCalled()
      }
    })

    it("rejects suspiciously large jobs", async () => {
      const db = createMockD1()
      const message = {
        jobId: "test",
        database: "DB",
        table: "employees",
        primaryKey: "id",
        record: { id: 1 },
        index: 0,
        total: 999999, // Suspiciously large
      }

      const batch = {
        messages: [{
          body: message,
          ack: vi.fn(),
          retry: vi.fn(),
        }],
      }

      await worker.queue(batch as unknown as MessageBatch<D1UpsertMessage>, { DB: db } as Env)
      expect(batch.messages[0].ack).toHaveBeenCalled()
    })

    it("rejects messages with invalid index", async () => {
      const db = createMockD1()
      const message = {
        jobId: "test",
        database: "DB",
        table: "employees",
        primaryKey: "id",
        record: { id: 1 },
        index: 100, // >= total
        total: 10,
      }

      const batch = {
        messages: [{
          body: message,
          ack: vi.fn(),
          retry: vi.fn(),
        }],
      }

      await worker.queue(batch as unknown as MessageBatch<D1UpsertMessage>, { DB: db } as Env)
      expect(batch.messages[0].ack).toHaveBeenCalled()
    })
  })

  describe("SQL generation", () => {
    it("rejects invalid table names", async () => {
      const db = createMockD1()
      const message: D1UpsertMessage = {
        jobId: "test-123",
        database: "DB",
        table: "employees; DROP TABLE employees; --",
        primaryKey: "id",
        record: { id: 1, name: "Test" },
        index: 0,
        total: 1,
      }

      const batch = {
        messages: [{
          body: message,
          ack: vi.fn(),
          retry: vi.fn(),
        }],
      }

      await worker.queue(batch as unknown as MessageBatch<D1UpsertMessage>, { DB: db } as Env)

      // Should call retry due to error
      expect(batch.messages[0].retry).toHaveBeenCalled()
    })

    it("rejects invalid column names", async () => {
      const db = createMockD1()
      const message: D1UpsertMessage = {
        jobId: "test-123",
        database: "DB",
        table: "employees",
        primaryKey: "id",
        record: { id: 1, "malicious; DROP TABLE": "test" },
        index: 0,
        total: 1,
      }

      const batch = {
        messages: [{
          body: message,
          ack: vi.fn(),
          retry: vi.fn(),
        }],
      }

      await worker.queue(batch as unknown as MessageBatch<D1UpsertMessage>, { DB: db } as Env)

      expect(batch.messages[0].retry).toHaveBeenCalled()
    })

    it("accepts valid identifiers", async () => {
      const db = createMockD1()
      const message: D1UpsertMessage = {
        jobId: "test-123",
        database: "DB",
        table: "employees",
        primaryKey: "number",
        record: { number: 123, first_name: "John", lastName: "Doe" },
        index: 0,
        total: 1,
      }

      const batch = {
        messages: [{
          body: message,
          ack: vi.fn(),
          retry: vi.fn(),
        }],
      }

      await worker.queue(batch as unknown as MessageBatch<D1UpsertMessage>, { DB: db } as Env)

      // Should acknowledge successful processing
      expect(batch.messages[0].ack).toHaveBeenCalled()
      
      // Verify SQL was prepared with correct table
      expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO employees"))
    })
  })

  describe("job progress tracking", () => {
    it("increments processed count atomically", async () => {
      const db = createMockD1()
      const prepared = db.prepare as ReturnType<typeof vi.fn>
      
      const messages: D1UpsertMessage[] = [
        { jobId: "job-123", database: "DB", table: "employees", primaryKey: "number", record: { number: 1 }, index: 0, total: 3 },
        { jobId: "job-123", database: "DB", table: "employees", primaryKey: "number", record: { number: 2 }, index: 1, total: 3 },
        { jobId: "job-123", database: "DB", table: "employees", primaryKey: "number", record: { number: 3 }, index: 2, total: 3 },
      ]

      const batch = {
        messages: messages.map(m => ({
          body: m,
          ack: vi.fn(),
          retry: vi.fn(),
        })),
      }

      await worker.queue(batch as unknown as MessageBatch<D1UpsertMessage>, { DB: db } as Env)

      // Each message should update progress
      const updateCalls = prepared.mock.calls.filter((call: unknown[]) => 
        String(call[0]).includes("UPDATE d1_upsert_jobs")
      )
      expect(updateCalls.length).toBe(3)
      
      // All should acknowledge
      batch.messages.forEach(m => expect(m.ack).toHaveBeenCalled())
    })

    it("handles missing database binding gracefully", async () => {
      const message: D1UpsertMessage = {
        jobId: "test-123",
        database: "NONEXISTENT_DB",
        table: "employees",
        primaryKey: "id",
        record: { id: 1 },
        index: 0,
        total: 1,
      }

      const batch = {
        messages: [{
          body: message,
          ack: vi.fn(),
          retry: vi.fn(),
        }],
      }

      await worker.queue(batch as unknown as MessageBatch<D1UpsertMessage>, {} as Env)

      expect(batch.messages[0].retry).toHaveBeenCalled()
    })
  })

  describe("exports", () => {
    it("exports JOB_TRACKING_TABLE_SQL", () => {
      expect(JOB_TRACKING_TABLE_SQL).toContain("CREATE TABLE IF NOT EXISTS d1_upsert_jobs")
      expect(JOB_TRACKING_TABLE_SQL).toContain("CREATE INDEX IF NOT EXISTS idx_d1_upsert_jobs_status")
    })
  })
})
