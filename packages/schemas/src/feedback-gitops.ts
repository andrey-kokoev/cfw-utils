import { z } from "zod";

export const FeedbackSubmissionSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(5000),
  url: z.string().url().optional(),
  userAgent: z.string().max(1000).optional(),
  labels: z.array(z.string()).optional(),
});
export type FeedbackSubmission = z.infer<typeof FeedbackSubmissionSchema>;

export const FeedbackEnqueueResponseSchema = z.object({
  success: z.boolean(),
  messageId: z.string().optional(),
});
export type FeedbackEnqueueResponse = z.infer<typeof FeedbackEnqueueResponseSchema>;

export const GitHubIssuePayloadSchema = z.object({
  title: z.string(),
  body: z.string(),
  labels: z.array(z.string()),
});
export type GitHubIssuePayload = z.infer<typeof GitHubIssuePayloadSchema>;

export const FeedbackWidgetConfigSchema = z.object({
  endpoint: z.string().url(),
  repo: z.string(),
  labels: z.string().optional(),
});
export type FeedbackWidgetConfig = z.infer<typeof FeedbackWidgetConfigSchema>;
