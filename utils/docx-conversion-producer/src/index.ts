import { createSchemaHandler, err, json } from "@cfw-utils/worker-kit";
import {
  DocxConversionEnqueueRequestSchema,
  DocxConversionEnqueueResponseSchema,
  HealthResponseSchema,
  type HealthResponse,
} from "@cfw-utils/schemas";

type Env = {
  DOCX_CONVERSION_QUEUE: {
    send(message: unknown): Promise<void>;
  };
};

const run = createSchemaHandler({
  method: "POST",
  req: DocxConversionEnqueueRequestSchema,
  res: DocxConversionEnqueueResponseSchema,
  async impl(value, _request, env: Env) {
    await env.DOCX_CONVERSION_QUEUE.send(value);
    return { enqueued: true };
  },
});

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      const health: HealthResponse = { ok: true, service: "docx-conversion-producer" };
      return json(HealthResponseSchema.parse(health));
    }
    if (request.method !== "POST" || url.pathname !== "/run") {
      return json(err({ error: "Not Found", code: "NOT_FOUND" }), { status: 404 });
    }
    return run(request, env);
  },
};
