import { err, json } from "@cfw-utils/worker-kit";
import { HealthResponseSchema, type HealthResponse } from "@cfw-utils/schemas";
import { z } from "zod";

const JOBS_TABLE = "http_jobs";

type Env = {
  DB: D1Database;
  BLOB: R2Bucket;
  KV: KVNamespace;
  HTTP_JOB_QUEUE: {
    send(message: unknown): Promise<void>;
  };
};

const httpJobRunRequestSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().max(200_000).optional(),
  timeoutSeconds: z.number().int().min(1).max(900).optional(),
  responseMaxBytes: z.number().int().min(1024).max(5_000_000).optional(),
  meta: z.object({
    projectId: z.number().int().positive(),
    requestedBy: z.string().min(1),
  }),
});

const httpJobRunResponseSchema = z.object({
  jobId: z.string().min(1),
});

const SECRET_HEADERS_TTL_SECONDS = 60 * 60 * 24;

function splitHeadersBySensitivity(headers?: Record<string, string>) {
  const persisted: Record<string, string> = {};
  const secret: Record<string, string> = {};
  if (!headers) {
    return { persisted, secret };
  }
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (lower === "authorization" || lower === "x-api-key" || lower === "proxy-authorization") {
      secret[key] = value;
    } else {
      persisted[key] = value;
    }
  }
  return { persisted, secret };
}

const run = async (request: Request, env: Env): Promise<Response> => {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return json(err({ error: "Invalid JSON", code: "VALIDATION_ERROR" }), { status: 400 });
  }

  const parsed = httpJobRunRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const message =
      parsed.error.issues[0]?.message && typeof parsed.error.issues[0]?.message === "string"
        ? parsed.error.issues[0].message
        : "Invalid request body";
    return json(err({ error: message, code: "VALIDATION_ERROR" }), { status: 400 });
  }

  const value = parsed.data;
  const jobId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const { persisted, secret } = splitHeadersBySensitivity(value.headers);
  const persistedRequest = {
    ...value,
    headers: Object.keys(persisted).length > 0 ? persisted : undefined,
  };

  await env.DB.prepare(
    `INSERT INTO ${JOBS_TABLE} (id, project_id, requested_by, status, request_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      jobId,
      value.meta.projectId,
      value.meta.requestedBy,
      "queued",
      JSON.stringify(persistedRequest),
      now,
      now,
    )
    .run();

  if (Object.keys(secret).length > 0) {
    await env.KV.put(`http-jobs:secret-headers:${jobId}`, JSON.stringify(secret), {
      expirationTtl: SECRET_HEADERS_TTL_SECONDS,
    });
  }

  await env.HTTP_JOB_QUEUE.send({ jobId });
  return json({ ok: true, data: httpJobRunResponseSchema.parse({ jobId }) });
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      const health: HealthResponse = { ok: true, service: "http-job-producer" };
      return json(HealthResponseSchema.parse(health));
    }
    if (request.method !== "POST" || url.pathname !== "/run") {
      return json(err({ error: "Not Found", code: "NOT_FOUND" }), { status: 404 });
    }
    return run(request, env);
  },
};
