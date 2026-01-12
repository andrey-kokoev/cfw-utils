import { createSchemaHandler, err, json } from "@cfw-utils/worker-kit";
import {
  SegmentsToChaptersAiRequestSchema,
  SegmentsToChaptersAiResponseSchema,
  type SegmentsToChaptersAiResponse,
  type HealthResponse,
} from "@cfw-utils/schemas";
import { summarizeWithAi } from "./ai";

type Env = {
  AI?: {
    run(model: string, input: unknown): Promise<unknown>;
  };
};

const summarizeHandler = createSchemaHandler({
  method: "POST",
  req: SegmentsToChaptersAiRequestSchema,
  res: SegmentsToChaptersAiResponseSchema,
  async impl(value, _request, env: Env): Promise<SegmentsToChaptersAiResponse | Response> {
    if (!env.AI) return json(err({ error: "AI binding required", code: "CONFIG_ERROR" }), { status: 500 });
    try {
      return await summarizeWithAi(env.AI, value);
    } catch {
      return json(err({ error: "AI request failed", code: "UPSTREAM_ERROR" }), { status: 502 });
    }
  },
});

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      const health: HealthResponse = { ok: true, service: "segments-to-chapters-ai" };
      return json(health);
    }
    if (request.method !== "POST" || url.pathname !== "/run") {
      return json(err({ error: "Not Found", code: "NOT_FOUND" }), { status: 404 });
    }

    return summarizeHandler(request, env);
  },
};
