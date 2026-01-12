import type {
  ApiError,
  YouTubeTranscriptJsonToSegmentsRequest,
  YouTubeTranscriptJsonToSegmentsResponse,
} from "@cfw-utils/schemas";
import {
  YouTubeTranscriptJsonToSegmentsRequestSchema,
  YouTubeTranscriptJsonToSegmentsResponseSchema,
} from "@cfw-utils/schemas";
import { createSchemaClient, type ServiceFetcher } from "./schema-client";

export function createYouTubeTranscriptJsonToSegmentsClient(
  fetcher: ServiceFetcher,
  options?: { url?: string },
): (
  request: YouTubeTranscriptJsonToSegmentsRequest,
) => Promise<{ ok: true; data: YouTubeTranscriptJsonToSegmentsResponse } | { ok: false; error: ApiError }> {
  const url = options?.url ?? "https://internal/run";
  return createSchemaClient({
    fetcher,
    url,
    method: "POST",
    req: YouTubeTranscriptJsonToSegmentsRequestSchema,
    res: YouTubeTranscriptJsonToSegmentsResponseSchema,
  });
}
