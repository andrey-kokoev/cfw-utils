import { z } from "zod";

export const DocxConversionEnqueueRequestSchema = z.object({
  documentId: z.number().int().positive(),
  storageKey: z.string().min(1),
  filename: z.string().min(1).optional(),
});
export type DocxConversionEnqueueRequest = z.infer<typeof DocxConversionEnqueueRequestSchema>;

export const DocxConversionEnqueueResponseSchema = z.object({
  enqueued: z.literal(true),
});
export type DocxConversionEnqueueResponse = z.infer<typeof DocxConversionEnqueueResponseSchema>;

export const DocxConversionProcessRequestSchema = DocxConversionEnqueueRequestSchema;
export type DocxConversionProcessRequest = DocxConversionEnqueueRequest;

export const DocxConversionProcessResponseSchema = z.object({
  processed: z.literal(true),
});
export type DocxConversionProcessResponse = z.infer<typeof DocxConversionProcessResponseSchema>;
