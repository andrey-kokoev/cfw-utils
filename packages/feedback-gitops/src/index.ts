import { json, err, createSchemaHandler } from "@cfw-utils/worker-kit";
import {
  FeedbackSubmissionSchema,
  FeedbackEnqueueResponseSchema,
  type FeedbackSubmission,
  type FeedbackEnqueueResponse,
} from "@cfw-utils/schemas";
import { generateWidgetScript } from "./widget";
import { createIssueConsumer, type ConsumerConfig } from "./consumer";

export { createIssueConsumer };
export type { ConsumerConfig };

export interface FeedbackWidgetConfig {
  queue: Queue;
  github: {
    pat: string;
    owner: string;
    repo: string;
    labels?: string[];
  };
  cors?: {
    origins?: string[];
  };
}

interface Env {
  FEEDBACK_QUEUE: Queue;
  GITHUB_PAT: string;
  GITHUB_REPO_OWNER: string;
  GITHUB_REPO_NAME: string;
}

/**
 * Creates a fetch handler for the feedback widget endpoint and widget.js script.
 */
export function createFeedbackWidget(config: FeedbackWidgetConfig) {
  const defaultLabels = config.github.labels || ["agent-execute"];
  const repo = `${config.github.owner}/${config.github.repo}`;

  return async (request: Request, env: Env): Promise<Response> => {
    const url = new URL(request.url);

    // CORS headers
    const corsOrigin = config.cors?.origins?.includes(request.headers.get("Origin") || "")
      ? request.headers.get("Origin") || "*"
      : "*";

    const corsHeaders = {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // GET /widget.js - Return the widget script
    if (request.method === "GET" && url.pathname === "/widget.js") {
      const endpoint = `${url.origin}/api/issue`;
      const script = generateWidgetScript(endpoint, repo, defaultLabels);

      return new Response(script, {
        headers: {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
          ...corsHeaders,
        },
      });
    }

    // GET /health - Health check
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "feedback-gitops" }, { headers: corsHeaders });
    }

    // POST /api/issue - Submit feedback
    if (request.method === "POST" && url.pathname === "/api/issue") {
      const handler = createSchemaHandler<typeof FeedbackSubmissionSchema, typeof FeedbackEnqueueResponseSchema, Env>({
        method: "POST",
        req: FeedbackSubmissionSchema,
        res: FeedbackEnqueueResponseSchema,
        impl: async (data: FeedbackSubmission) => {
          try {
            await config.queue.send(data);
            return { success: true };
          } catch (error) {
            console.error("Failed to enqueue feedback:", error);
            return json(err({ error: "Failed to enqueue feedback", code: "QUEUE_ERROR" }), { status: 500 });
          }
        },
      });

      const response = await handler(request, env);
      // Add CORS headers to response
      const newHeaders = new Headers(response.headers);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        newHeaders.set(key, value);
      });
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    }

    return json(err({ error: "Not Found", code: "NOT_FOUND" }), { status: 404, headers: corsHeaders });
  };
}

// Default export for direct worker usage
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const config: FeedbackWidgetConfig = {
      queue: env.FEEDBACK_QUEUE,
      github: {
        pat: env.GITHUB_PAT,
        owner: env.GITHUB_REPO_OWNER,
        repo: env.GITHUB_REPO_NAME,
        labels: ["agent-execute"],
      },
    };

    return createFeedbackWidget(config)(request, env);
  },

  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    const config: ConsumerConfig = {
      github: {
        pat: env.GITHUB_PAT,
        owner: env.GITHUB_REPO_OWNER,
        repo: env.GITHUB_REPO_NAME,
        labels: ["agent-execute"],
      },
    };

    const consumer = createIssueConsumer<unknown>(config);
    return consumer(batch, env);
  },
};
