import { runFfmpeg } from "@/lib/ffmpeg";
import type { ClipSuggestion, TranscriptSegment } from "@/types";

const MIN_CLIP_SECONDS = 30;
const MAX_CLIP_SECONDS = 60;
const TARGET_CLIP_SECONDS = 45;
const MAX_SUGGESTIONS = 6;
const MAX_CANDIDATE_WINDOWS = 60;
const SILENCE_SNAP_TOLERANCE = 3;

interface Interval {
  start: number;
  end: number;
}

export interface SuggestClipsInput {
  audioPath: string;
  durationSeconds: number;
  transcript: TranscriptSegment[];
}

// Free, local, no-LLM heuristic: use silence gaps as natural cut points and
// relative loudness as a proxy for "energetic" moments. This is the seam to
// swap for a Claude-backed suggester later.
export async function suggestClips({
  audioPath,
  durationSeconds,
  transcript,
}: SuggestClipsInput): Promise<ClipSuggestion[]> {
  if (durationSeconds <= MIN_CLIP_SECONDS) {
    return [
      buildSuggestion(0, durationSeconds, transcript, "Full video (too short to trim further)"),
    ];
  }

  const silenceIntervals = await detectSilence(audioPath);
  const candidateWindows = buildCandidateWindows(durationSeconds);

  const scored = await Promise.all(
    candidateWindows.map(async (window) => ({
      window,
      loudness: await measureLoudness(audioPath, window.start, window.end - window.start),
    })),
  );

  scored.sort((a, b) => b.loudness - a.loudness);

  // Snap to silence boundaries before dedup: snapping can shift a window's
  // edges by a few seconds, so two windows that didn't overlap pre-snap can
  // end up overlapping after — checking post-snap avoids showing the user
  // two "distinct" suggestions that actually share footage.
  const chosen: Interval[] = [];
  for (const { window } of scored) {
    if (chosen.length >= MAX_SUGGESTIONS) break;
    const snapped = snapToSilence(window, silenceIntervals, durationSeconds);
    if (chosen.some((c) => overlaps(c, snapped))) continue;
    chosen.push(snapped);
  }
  chosen.sort((a, b) => a.start - b.start);

  return chosen.map((window) =>
    buildSuggestion(
      window.start,
      window.end,
      transcript,
      "High-energy segment identified from audio loudness",
    ),
  );
}

async function detectSilence(audioPath: string): Promise<Interval[]> {
  const stderr = await runFfmpeg([
    "-i",
    audioPath,
    "-af",
    "silencedetect=noise=-30dB:d=0.5",
    "-f",
    "null",
    "-",
  ]);

  const starts: number[] = [];
  const ends: number[] = [];
  const startRe = /silence_start:\s*([\d.]+)/g;
  const endRe = /silence_end:\s*([\d.]+)/g;

  let match: RegExpExecArray | null;
  while ((match = startRe.exec(stderr))) starts.push(parseFloat(match[1]));
  while ((match = endRe.exec(stderr))) ends.push(parseFloat(match[1]));

  const intervals: Interval[] = [];
  for (let i = 0; i < Math.min(starts.length, ends.length); i++) {
    intervals.push({ start: starts[i], end: ends[i] });
  }
  return intervals;
}

async function measureLoudness(
  audioPath: string,
  start: number,
  duration: number,
): Promise<number> {
  const stderr = await runFfmpeg([
    "-ss",
    String(start),
    "-t",
    String(duration),
    "-i",
    audioPath,
    "-af",
    "volumedetect",
    "-f",
    "null",
    "-",
  ]);
  const match = stderr.match(/mean_volume:\s*(-?[\d.]+)\s*dB/);
  return match ? parseFloat(match[1]) : -Infinity;
}

function buildCandidateWindows(durationSeconds: number): Interval[] {
  const stride = MIN_CLIP_SECONDS / 2;
  const windows: Interval[] = [];
  for (let start = 0; start + MIN_CLIP_SECONDS <= durationSeconds; start += stride) {
    const end = Math.min(start + TARGET_CLIP_SECONDS, durationSeconds);
    if (end - start >= MIN_CLIP_SECONDS) {
      windows.push({ start, end });
    }
    if (windows.length >= MAX_CANDIDATE_WINDOWS) break;
  }
  return windows;
}

function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

function snapToSilence(
  window: Interval,
  silences: Interval[],
  durationSeconds: number,
): Interval {
  let start = window.start;
  let end = window.end;

  for (const silence of silences) {
    if (Math.abs(silence.end - start) <= SILENCE_SNAP_TOLERANCE) start = silence.end;
    if (Math.abs(silence.start - end) <= SILENCE_SNAP_TOLERANCE) end = silence.start;
  }

  start = Math.max(0, start);
  end = Math.min(durationSeconds, end);

  let length = end - start;
  if (length < MIN_CLIP_SECONDS) {
    end = Math.min(durationSeconds, start + MIN_CLIP_SECONDS);
    length = end - start;
    if (length < MIN_CLIP_SECONDS) {
      start = Math.max(0, end - MIN_CLIP_SECONDS);
    }
  } else if (length > MAX_CLIP_SECONDS) {
    end = start + MAX_CLIP_SECONDS;
  }

  return { start, end };
}

function buildSuggestion(
  start: number,
  end: number,
  transcript: TranscriptSegment[],
  rationale: string,
): ClipSuggestion {
  const overlapping = transcript.filter((seg) => seg.end > start && seg.start < end);
  const text = overlapping
    .map((s) => s.text)
    .join(" ")
    .trim();
  const title = text ? truncateTitle(text) : `Clip at ${formatTime(start)}`;

  return {
    startSeconds: round2(start),
    endSeconds: round2(end),
    title,
    rationale,
  };
}

function truncateTitle(text: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  const truncated = words.slice(0, 8).join(" ");
  return words.length > 8 ? `${truncated}...` : truncated;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
