import { z } from "zod";

export const HttpJobRunRequestSchema = z.object({
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
export type HttpJobRunRequest = z.infer<typeof HttpJobRunRequestSchema>;

export const HttpJobRunResponseSchema = z.object({
  jobId: z.string().min(1),
});
export type HttpJobRunResponse = z.infer<typeof HttpJobRunResponseSchema>;

export const HttpJobStatusSchema = z.object({
  jobId: z.string().min(1),
  status: z.enum(["queued", "running", "completed", "failed"]),
  httpStatus: z.number().int().optional().nullable(),
  responseKey: z.string().optional().nullable(),
  error: z.string().optional().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type HttpJobStatus = z.infer<typeof HttpJobStatusSchema>;

export const HttpJobResultSchema = z.object({
  jobId: z.string().min(1),
  httpStatus: z.number().int(),
  headers: z.record(z.string(), z.string()).default({}),
  body: z.string().optional(),
  truncated: z.boolean().optional(),
});
export type HttpJobResult = z.infer<typeof HttpJobResultSchema>;
