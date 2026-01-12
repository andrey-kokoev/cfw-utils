import type { TranscriptSegment } from "@cfw-utils/schemas";

type CandidateSegment = {
  text?: unknown;
  start?: unknown;
  offset?: unknown;
  startSec?: unknown;
  duration?: unknown;
  dur?: unknown;
  durationSec?: unknown;
  end?: unknown;
  endSec?: unknown;
};

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toSeconds(value: number, unit: "s" | "ms"): number {
  return unit === "ms" ? value / 1000 : value;
}

function toIntSeconds(value: number): number {
  return Math.max(0, Math.floor(value));
}

export function normalizeYouTubeTranscriptJson(
  input: unknown,
  options?: { timeUnit?: "s" | "ms" },
): TranscriptSegment[] {
  const timeUnit = options?.timeUnit ?? "s";

  if (!Array.isArray(input)) throw new Error("youtubeTranscript must be an array");

  const rows: Array<{ text: string; startSec: number; endSec: number }> = [];

  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const record = item as CandidateSegment;

    const text = typeof record.text === "string" ? record.text.trim() : "";
    if (!text) continue;

    const startRaw =
      asNumber(record.startSec) ??
      asNumber(record.start) ??
      asNumber(record.offset) ??
      asNumber((record as Record<string, unknown>).offsetSec);

    if (startRaw === null) continue;
    const startSec = toSeconds(startRaw, timeUnit);

    const durationRaw =
      asNumber(record.durationSec) ?? asNumber(record.duration) ?? asNumber(record.dur);
    const endRaw = asNumber(record.endSec) ?? asNumber(record.end);

    let endSec: number;
    if (endRaw !== null) {
      endSec = toSeconds(endRaw, timeUnit);
    } else if (durationRaw !== null) {
      endSec = startSec + toSeconds(durationRaw, timeUnit);
    } else {
      endSec = startSec;
    }

    rows.push({ text, startSec, endSec });
  }

  rows.sort((a, b) => a.startSec - b.startSec);

  const segments: TranscriptSegment[] = [];
  for (let index = 0; index < rows.length; index++) {
    const current = rows[index];
    const next = rows[index + 1];
    const startSec = toIntSeconds(current.startSec);
    const endSec = toIntSeconds(
      Math.max(current.endSec, next ? Math.min(current.endSec, next.startSec) : current.endSec),
    );
    segments.push({
      startSec,
      endSec: Math.max(endSec, startSec),
      text: current.text.slice(0, 2000),
    });
  }

  if (segments.length === 0) throw new Error("No transcript segments found");
  return segments;
}

