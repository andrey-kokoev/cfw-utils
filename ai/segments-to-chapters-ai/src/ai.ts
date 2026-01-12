import type { SegmentsToChaptersAiRequest, SegmentsToChaptersAiResponse } from "@cfw-utils/schemas";
import { SegmentsToChaptersAiResponseSchema } from "@cfw-utils/schemas";

type AiBinding = {
  run(model: string, input: unknown): Promise<unknown>;
};

function extractFirstJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = text.slice(start, end + 1);
  return JSON.parse(slice) as unknown;
}

export async function summarizeWithAi(
  ai: AiBinding,
  request: SegmentsToChaptersAiRequest,
): Promise<SegmentsToChaptersAiResponse> {
  const model = request.model ?? "@cf/meta/llama-3.1-8b-instruct";
  const temperature = request.temperature ?? 0.9;
  const maxChapters = request.maxChapters ?? 6;

  const inputText =
    typeof request.text === "string"
      ? request.text
      : (request.segments ?? [])
          .map((s) => `[${s.startSec}-${s.endSec}] ${s.text}`)
          .join("\n");

  const requireTimestamps = Array.isArray(request.segments);

  const system = [
    "You are a careful summarizer.",
    "Return ONLY valid JSON matching this TypeScript type:",
    '{ chapters: Array<{ title: string; summary: string; keyPoints: string[]; keywords: string[]; startSec: number | null; endSec: number | null }> }',
    `Constraints: chapters.length <= ${maxChapters}.`,
    requireTimestamps
      ? "You are given a timestamped transcript. Each chapter MUST have integer startSec and endSec in seconds (not null) aligned to the transcript timeline."
      : "If no timestamps are provided, set startSec and endSec to null.",
    "Keep summaries concise and factual.",
  ].join("\n");

  const user = [
    "Summarize the following text into chapter-like sections.",
    "",
    inputText,
  ].join("\n");

  const result = await ai.run(model, {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature,
  });

  const candidateText =
    typeof result === "string"
      ? result
      : result && typeof result === "object" && "response" in (result as Record<string, unknown>)
        ? String((result as Record<string, unknown>).response ?? "")
        : JSON.stringify(result);

  const parsedUnknown = extractFirstJsonObject(candidateText);
  const parsed = SegmentsToChaptersAiResponseSchema.safeParse(parsedUnknown);
  if (!parsed.success) {
    throw new Error("Invalid AI response");
  }

  if (requireTimestamps) {
    for (const chapter of parsed.data.chapters) {
      if (chapter.startSec === null || chapter.endSec === null) {
        throw new Error("Missing chapter timestamps");
      }
    }
  }

  return parsed.data;
}
