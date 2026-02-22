import {
  FeedbackSubmissionSchema,
  FeedbackEnqueueResponseSchema,
  type FeedbackSubmission,
  type FeedbackEnqueueResponse,
} from "@cfw-utils/schemas";
import { createSchemaClient, type ServiceFetcher } from "./schema-client";

export interface FeedbackGitopsClientConfig {
  /** Service binding to feedback-gitops worker */
  service: ServiceFetcher;
  /** Base URL for the worker (used for constructing widget.js URL) */
  workerUrl: string;
  /** API key for accessing protected endpoints */
  apiKey: string;
}

/**
 * Creates a client for the feedback-gitops worker.
 * Use this when calling the worker via Service Binding from another Worker/Pages Function.
 */
export function createFeedbackGitopsClient(config: FeedbackGitopsClientConfig) {
  // Create a wrapped fetcher that adds the API key header
  const fetcherWithAuth: ServiceFetcher = {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set("X-API-Key", config.apiKey);
      return config.service.fetch(input, { ...init, headers });
    },
  };

  const enqueueFeedback = createSchemaClient<typeof FeedbackSubmissionSchema, typeof FeedbackEnqueueResponseSchema>({
    fetcher: fetcherWithAuth,
    url: `${config.workerUrl}/api/issue`,
    method: "POST",
    req: FeedbackSubmissionSchema,
    res: FeedbackEnqueueResponseSchema,
  });

  return {
    /** Submit feedback to be queued and turned into a GitHub issue */
    enqueue: enqueueFeedback,
    /** Get the URL for the widget.js script */
    getWidgetUrl: () => `${config.workerUrl}/widget.js`,
  };
}

export type FeedbackGitopsClient = ReturnType<typeof createFeedbackGitopsClient>;
