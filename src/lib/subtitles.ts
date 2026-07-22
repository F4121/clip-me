import type { TranscriptSegment } from "@/types";

const MAX_WORDS_PER_PHRASE = 2;
const MAX_PHRASE_GAP_SECONDS = 0.6;
const MAX_PHRASE_DURATION_SECONDS = 2.2;

// Groups near-word-level transcript segments (from whisper.cpp's -ml 1 mode)
// into short 1-2 word phrases with tight timing — the "one punchy phrase at
// a time" caption style common in short-form video, rather than one cue per
// full sentence. A new phrase starts on a natural pause, once the word count
// cap is hit, or once the phrase has been on screen long enough.
export function groupIntoCaptionPhrases(words: TranscriptSegment[]): TranscriptSegment[] {
  const realWords = words.filter(
    (w) => !isNonSpeechAnnotation(w.text) && w.text.trim().length > 0,
  );

  const phrases: TranscriptSegment[] = [];
  let current: TranscriptSegment[] = [];

  function flush() {
    if (current.length === 0) return;
    phrases.push({
      start: current[0].start,
      end: current[current.length - 1].end,
      text: current.map((w) => w.text.trim()).join(" "),
    });
    current = [];
  }

  for (const word of realWords) {
    if (current.length > 0) {
      const prev = current[current.length - 1];
      const gap = word.start - prev.end;
      const wouldBeDuration = word.end - current[0].start;
      if (
        gap > MAX_PHRASE_GAP_SECONDS ||
        current.length >= MAX_WORDS_PER_PHRASE ||
        wouldBeDuration > MAX_PHRASE_DURATION_SECONDS
      ) {
        flush();
      }
    }
    current.push(word);
  }
  flush();

  return phrases;
}

interface ClipRelativeSegment {
  start: number;
  end: number;
  text: string;
}

function clipRelativeSegments(
  segments: TranscriptSegment[],
  clipStartSeconds: number,
  clipEndSeconds: number,
): ClipRelativeSegment[] {
  return segments
    .filter((seg) => seg.end > clipStartSeconds && seg.start < clipEndSeconds)
    .map((seg) => ({
      start: Math.max(0, seg.start - clipStartSeconds),
      end: Math.min(clipEndSeconds - clipStartSeconds, seg.end - clipStartSeconds),
      text: seg.text.trim(),
    }))
    .filter(
      (seg) => seg.end > seg.start && seg.text.length > 0 && !isNonSpeechAnnotation(seg.text),
    );
}

// Timing polish that mirrors what polished short-form caption tools do.
// Whisper timestamps — even DTW-aligned ones — retain a residual lag on
// real-world audio, and viewers read "caption slightly after speech onset"
// as late while "slightly before" reads as in-sync. So:
//   1. Shift each phrase's start earlier by a small fixed lead.
//   2. If the gap to the next phrase is small, hold the current phrase on
//      screen until the next one starts — continuous captions, no flicker.
//   3. Enforce a minimum display duration so single short words don't blink.
// Starts never overlap the previous phrase and ends never cross the next
// phrase's (already-shifted) start, so ordering is preserved.
const CAPTION_LEAD_SECONDS = 0.18;
const MAX_HOLD_GAP_SECONDS = 1.0;
const MIN_DISPLAY_SECONDS = 0.35;

function polishCaptionTiming(
  segments: ClipRelativeSegment[],
  clipDurationSeconds: number,
): ClipRelativeSegment[] {
  const polished = segments.map((seg) => ({ ...seg }));

  for (let i = 0; i < polished.length; i++) {
    const floor = i > 0 ? polished[i - 1].start + 0.01 : 0;
    polished[i].start = Math.max(floor, polished[i].start - CAPTION_LEAD_SECONDS);
  }

  for (let i = 0; i < polished.length; i++) {
    const nextStart = i + 1 < polished.length ? polished[i + 1].start : clipDurationSeconds;
    let end = Math.max(polished[i].end, polished[i].start + MIN_DISPLAY_SECONDS);
    if (nextStart - polished[i].end <= MAX_HOLD_GAP_SECONDS) {
      end = nextStart;
    }
    polished[i].end = Math.min(Math.max(end, polished[i].start + 0.05), nextStart, clipDurationSeconds);
  }

  return polished.filter((seg) => seg.end > seg.start);
}

// PlayResX/PlayResY must match the actual export frame (1080x1920): when
// ffmpeg converts a plain .srt on the fly (no PlayRes of its own), it
// assumes an old default ASS design canvas and scales the render up to fit
// the real frame, inflating FontSize unpredictably (observed ~3-6x larger
// than requested). Writing a native .ass with an explicit PlayRes makes
// FontSize mean literally what it says, and is portable across ffmpeg/
// libass versions instead of a magic-number style hack.
const PLAY_RES_X = 1080;
const PLAY_RES_Y = 1920;
const ASS_STYLE_LINE =
  "Style: Caption,Arial,72,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,4,0,5,60,60,60,1";

export function buildAss(
  segments: TranscriptSegment[],
  clipStartSeconds: number,
  clipEndSeconds: number,
): string {
  const relevant = polishCaptionTiming(
    clipRelativeSegments(segments, clipStartSeconds, clipEndSeconds),
    clipEndSeconds - clipStartSeconds,
  );
  if (relevant.length === 0) return "";

  const header =
    `[Script Info]\n` +
    `ScriptType: v4.00+\n` +
    `PlayResX: ${PLAY_RES_X}\n` +
    `PlayResY: ${PLAY_RES_Y}\n` +
    `WrapStyle: 0\n` +
    `ScaledBorderAndShadow: yes\n\n` +
    `[V4+ Styles]\n` +
    `Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n` +
    `${ASS_STYLE_LINE}\n\n` +
    `[Events]\n` +
    `Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;

  const events = relevant
    .map(
      (seg) =>
        `Dialogue: 0,${toAssTimestamp(seg.start)},${toAssTimestamp(seg.end)},Caption,,0,0,0,,${escapeAssText(seg.text)}`,
    )
    .join("\n");

  return `${header}${events}\n`;
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

function escapeAssText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\n/g, "\\N");
}

function toAssTimestamp(seconds: number): string {
  const totalCs = Math.round(seconds * 100);
  const h = Math.floor(totalCs / 360_000);
  const m = Math.floor((totalCs % 360_000) / 6_000);
  const s = Math.floor((totalCs % 6_000) / 100);
  const cs = totalCs % 100;
  return `${h}:${pad(m, 2)}:${pad(s, 2)}.${pad(cs, 2)}`;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}
