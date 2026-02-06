import { err, json, parseJsonWithSchema } from "@cfw-utils/worker-kit";
import { HealthResponseSchema, type HealthResponse } from "@cfw-utils/schemas";
import { z } from "zod";

const JOBS_TABLE = "http_jobs";

type Env = {
  DB: D1Database;
  BLOB: R2Bucket;
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

const run = async (request: Request, env: Env): Promise<Response> => {
  const parsed = await parseJsonWithSchema(request, httpJobRunRequestSchema);
  if (!parsed.ok) return parsed.response;

  const value = parsed.value;
  const jobId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  await env.DB.prepare(
    `INSERT INTO ${JOBS_TABLE} (id, project_id, requested_by, status, request_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(jobId, value.meta.projectId, value.meta.requestedBy, "queued", JSON.stringify(value), now, now)
    .run();

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
