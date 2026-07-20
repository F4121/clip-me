import type { TranscriptSegment } from "@/types";

export function buildSrt(
  segments: TranscriptSegment[],
  clipStartSeconds: number,
  clipEndSeconds: number,
): string {
  const relevant = segments
    .filter((seg) => seg.end > clipStartSeconds && seg.start < clipEndSeconds)
    .map((seg) => ({
      start: Math.max(0, seg.start - clipStartSeconds),
      end: Math.min(clipEndSeconds - clipStartSeconds, seg.end - clipStartSeconds),
      text: seg.text.trim(),
    }))
    .filter((seg) => seg.end > seg.start && seg.text.length > 0);

  return relevant
    .map(
      (seg, i) =>
        `${i + 1}\n${toSrtTimestamp(seg.start)} --> ${toSrtTimestamp(seg.end)}\n${seg.text}\n`,
    )
    .join("\n");
}

function toSrtTimestamp(seconds: number): string {
  const totalMs = Math.round(seconds * 1000);
  const h = Math.floor(totalMs / 3_600_000);
  const m = Math.floor((totalMs % 3_600_000) / 60_000);
  const s = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms, 3)}`;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}
