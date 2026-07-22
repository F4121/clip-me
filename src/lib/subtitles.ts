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
    .filter(
      (seg) => seg.end > seg.start && seg.text.length > 0 && !isNonSpeechAnnotation(seg.text),
    );

  return relevant
    .map(
      (seg, i) =>
        `${i + 1}\n${toSrtTimestamp(seg.start)} --> ${toSrtTimestamp(seg.end)}\n${seg.text}\n`,
    )
    .join("\n");
}

// Whisper labels segments with no clear speech (background music, sound
// effects) as a bracketed/parenthesized tag like "[Music]" or "(applause)"
// instead of transcribing words. Burning those in as captions would show
// them as if they were spoken dialogue, so drop them.
export function isNonSpeechAnnotation(text: string): boolean {
  const trimmed = text.trim();
  if (/^[[(].*[\])]$/.test(trimmed)) return true;
  if (/^[♩-♯\s]+$/.test(trimmed)) return true; // bare music-note glyphs
  return false;
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
