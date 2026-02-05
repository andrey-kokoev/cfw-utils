import { z } from "zod";

export const ApiErrorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export function ResultSchema<TDataSchema extends z.ZodTypeAny>(data: TDataSchema) {
  return z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), data }),
    z.object({ ok: z.literal(false), error: ApiErrorSchema }),
  ]);
}

export const ChapterSchema = z
  .object({
    title: z.string(),
    summary: z.string(),
    keyPoints: z.array(z.string()).default([]),
    keywords: z.array(z.string()).default([]),
    startSec: z.number().int().nonnegative().nullable(),
    endSec: z.number().int().nonnegative().nullable(),
  })
  .refine(
    (value) =>
      (value.startSec === null && value.endSec === null) ||
      (typeof value.startSec === "number" &&
        typeof value.endSec === "number" &&
        value.endSec >= value.startSec),
    { message: "Invalid chapter timestamps" },
  );
export type Chapter = z.infer<typeof ChapterSchema>;

export const TranscriptSegmentSchema = z
  .object({
    startSec: z.number().int().nonnegative(),
    endSec: z.number().int().nonnegative(),
    text: z.string().max(2000),
  })
  .refine((value) => value.endSec >= value.startSec, { message: "Invalid segment timestamps" });
export type TranscriptSegment = z.infer<typeof TranscriptSegmentSchema>;

export const YouTubeTranscriptJsonToSegmentsRequestSchema = z.object({
  youtubeTranscript: z.unknown(),
  timeUnit: z.enum(["s", "ms"]).optional(),
});
export type YouTubeTranscriptJsonToSegmentsRequest = z.infer<
  typeof YouTubeTranscriptJsonToSegmentsRequestSchema
>;

export const YouTubeTranscriptJsonToSegmentsResponseSchema = z.object({
  segments: z.array(TranscriptSegmentSchema),
});
export type YouTubeTranscriptJsonToSegmentsResponse = z.infer<
  typeof YouTubeTranscriptJsonToSegmentsResponseSchema
>;

export const YouTubeTranscriptJsonToChaptersAiRequestSchema = z.object({
  youtubeTranscript: z.unknown(),
  timeUnit: z.enum(["s", "ms"]).optional(),
  maxChapters: z.number().int().min(1).max(20).optional(),
  temperature: z.number().min(0).max(2).optional(),
  model: z.string().optional(),
});
export type YouTubeTranscriptJsonToChaptersAiRequest = z.infer<
  typeof YouTubeTranscriptJsonToChaptersAiRequestSchema
>;

export const SegmentsToChaptersAiRequestSchema = z
  .object({
    text: z
      .string()
      .max(50_000, { message: "`text` is too large" })
      .refine((value) => value.trim().length > 0, { message: "`text` is required" })
      .optional(),
    segments: z.array(TranscriptSegmentSchema).min(1).max(5000).optional(),
    maxChapters: z.number().int().min(1).max(20).optional(),
    temperature: z.number().min(0).max(2).optional(),
    model: z.string().optional(),
  })
  .refine((value) => typeof value.text === "string" || Array.isArray(value.segments), {
    message: "Provide either `text` or `segments`",
  });
export type SegmentsToChaptersAiRequest = z.infer<typeof SegmentsToChaptersAiRequestSchema>;

export const SegmentsToChaptersAiResponseSchema = z.object({
  chapters: z.array(ChapterSchema),
});
export type SegmentsToChaptersAiResponse = z.infer<typeof SegmentsToChaptersAiResponseSchema>;

export const HealthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export {
  DocxConversionEnqueueRequestSchema,
  DocxConversionEnqueueResponseSchema,
  DocxConversionProcessRequestSchema,
  DocxConversionProcessResponseSchema,
} from "./docx-conversion";
export type {
  DocxConversionEnqueueRequest,
  DocxConversionEnqueueResponse,
  DocxConversionProcessRequest,
  DocxConversionProcessResponse,
} from "./docx-conversion";
