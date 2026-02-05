import type {
  ApiError,
  DocxConversionEnqueueRequest,
  DocxConversionEnqueueResponse,
} from "@cfw-utils/schemas";
import {
  DocxConversionEnqueueRequestSchema,
  DocxConversionEnqueueResponseSchema,
} from "@cfw-utils/schemas";
import { createSchemaClient, type ServiceFetcher } from "./schema-client";

export function createDocxConversionProducerClient(
  fetcher: ServiceFetcher,
  options?: { url?: string },
): (
  request: DocxConversionEnqueueRequest,
) => Promise<{ ok: true; data: DocxConversionEnqueueResponse } | { ok: false; error: ApiError }> {
  const url = options?.url ?? "https://internal/run";
  return createSchemaClient({
    fetcher,
    url,
    method: "POST",
    req: DocxConversionEnqueueRequestSchema,
    res: DocxConversionEnqueueResponseSchema,
  });
}
