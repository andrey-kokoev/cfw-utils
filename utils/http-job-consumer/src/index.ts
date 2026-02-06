import { err, json } from "@cfw-utils/worker-kit";
import { HealthResponseSchema, HttpJobRunRequestSchema, type HealthResponse } from "@cfw-utils/schemas";
import type { MessageBatch } from "@cloudflare/workers-types";

const JOBS_TABLE = "http_jobs";
const DEFAULT_TIMEOUT_SECONDS = 300;
const DEFAULT_MAX_BYTES = 1_000_000;

type Env = {
  DB: D1Database;
  BLOB: R2Bucket;
};

type JobRow = {
  id: string;
  status: string;
  request_json: string;
};

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

async function loadJob(env: Env, jobId: string): Promise<JobRow | null> {
  const row = await env.DB.prepare(
    `SELECT id, status, request_json FROM ${JOBS_TABLE} WHERE id = ?`,
  )
    .bind(jobId)
    .first<JobRow>();
  return row ?? null;
}

async function updateJob(
  env: Env,
  jobId: string,
  fields: { status?: string; responseStatus?: number | null; responseKey?: string | null; error?: string | null },
) {
  const status = fields.status;
  const responseStatus = fields.responseStatus ?? null;
  const responseKey = fields.responseKey ?? null;
  const error = fields.error ?? null;
  const updatedAt = nowSeconds();
  await env.DB.prepare(
    `UPDATE ${JOBS_TABLE}
     SET status = COALESCE(?, status),
         response_status = COALESCE(?, response_status),
         response_key = COALESCE(?, response_key),
         error = ?,
         updated_at = ?
     WHERE id = ?`,
  )
    .bind(status, responseStatus, responseKey, error, updatedAt, jobId)
    .run();
}

async function readResponseBody(response: Response, maxBytes: number) {
  const reader = response.body?.getReader();
  if (!reader) {
    return { text: "", truncated: false };
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      const nextSize = received + value.length;
      if (nextSize > maxBytes) {
        const slice = value.slice(0, Math.max(0, maxBytes - received));
        if (slice.length) chunks.push(slice);
        truncated = true;
        break;
      }
      chunks.push(value);
      received = nextSize;
    }
  }

  if (truncated) {
    await reader.cancel();
  }

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }
  const text = new TextDecoder().decode(buffer);
  return { text, truncated };
}

async function processJob(env: Env, jobId: string) {
  const job = await loadJob(env, jobId);
  if (!job) return;

  let requestData: HttpJobRunRequest;
  try {
    requestData = HttpJobRunRequestSchema.parse(JSON.parse(job.request_json));
  } catch (error) {
    const details =
      error instanceof Error
        ? error.message
        : "Unknown parse error";
    await updateJob(env, jobId, {
      status: "failed",
      error: `Invalid request payload: ${details}`.slice(0, 500),
    });
    return;
  }

  await updateJob(env, jobId, { status: "running", error: null });

  const timeoutSeconds = requestData.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
  const responseMaxBytes = requestData.responseMaxBytes ?? DEFAULT_MAX_BYTES;
  const requestHeaders = { ...(requestData.headers ?? {}) };
  if (requestData.meta?.projectId && requestData.meta.requestedBy) {
    requestHeaders["x-harmonia-project-id"] = String(requestData.meta.projectId);
    requestHeaders["x-harmonia-requested-by"] = requestData.meta.requestedBy;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutSeconds * 1000);

  try {
    const response = await fetch(requestData.url, {
      method: requestData.method,
      headers: requestHeaders,
      body: requestData.body,
      signal: controller.signal,
    });

    const { text, truncated } = await readResponseBody(response, responseMaxBytes);
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const responseKey = `http-jobs/${jobId}.json`;
    const payload = {
      jobId,
      httpStatus: response.status,
      headers: responseHeaders,
      body: text,
      truncated,
    };

    await env.BLOB.put(responseKey, JSON.stringify(payload), {
      httpMetadata: { contentType: "application/json" },
    });

    await updateJob(env, jobId, {
      status: "completed",
      responseStatus: response.status,
      responseKey,
      error: null,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.slice(0, 500)
        : "Request failed";
    await updateJob(env, jobId, { status: "failed", error: message });
  } finally {
    clearTimeout(timeout);
  }
}

export default {
  async queue(batch: MessageBatch, env: Env): Promise<void> {
    for (const message of batch.messages) {
      const body = message.body as { jobId?: string };
      if (!body?.jobId) {
        message.ack();
        continue;
      }
      try {
        await processJob(env, body.jobId);
      } finally {
        message.ack();
      }
    }
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      const health: HealthResponse = { ok: true, service: "http-job-consumer" };
      return json(HealthResponseSchema.parse(health));
    }
    return json(err({ error: "Not Found", code: "NOT_FOUND" }), { status: 404 });
  },
};
