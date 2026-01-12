import type { ApiError, SegmentsToChaptersAiRequest, SegmentsToChaptersAiResponse } from "@cfw-utils/schemas";
import {
  SegmentsToChaptersAiRequestSchema,
  SegmentsToChaptersAiResponseSchema,
} from "@cfw-utils/schemas";
import { createSchemaClient, type ServiceFetcher } from "./schema-client";

export function createSegmentsToChaptersAiClient(
  fetcher: ServiceFetcher,
  options?: { url?: string },
): (
  request: SegmentsToChaptersAiRequest,
) => Promise<{ ok: true; data: SegmentsToChaptersAiResponse } | { ok: false; error: ApiError }> {
  const url = options?.url ?? "https://internal/run";
  return createSchemaClient({
    fetcher,
    url,
    method: "POST",
    req: SegmentsToChaptersAiRequestSchema,
    res: SegmentsToChaptersAiResponseSchema,
  });
}
