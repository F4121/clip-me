import { measureLoudness } from "@/lib/ffmpeg";

const WINDOW_SECONDS = 1;
const MIN_GAP_BETWEEN_ZOOMS_SECONDS = 2.5;
const MAX_ZOOMS = 6;
const SPIKE_MARGIN_DB = 4;

// Finds brief loudness spikes within a clip's own audio (laughter, shouting,
// emphasis) to trigger a punch-zoom + whoosh at those moments — the same
// "reacting to what's actually happening" idea used for clip suggestions,
// applied at finer granularity within a single clip.
export async function detectZoomMoments(
  audioPath: string,
  clipStartSeconds: number,
  clipDurationSeconds: number,
): Promise<number[]> {
  const windowCount = Math.floor(clipDurationSeconds / WINDOW_SECONDS);
  if (windowCount < 3) return [];

  const loudnessByWindow = await Promise.all(
    Array.from({ length: windowCount }, (_, i) =>
      measureLoudness(audioPath, clipStartSeconds + i * WINDOW_SECONDS, WINDOW_SECONDS),
    ),
  );

  const finiteValues = loudnessByWindow.filter((v) => Number.isFinite(v));
  if (finiteValues.length === 0) return [];
  const mean = finiteValues.reduce((a, b) => a + b, 0) / finiteValues.length;

  const candidates = loudnessByWindow
    .map((loudness, index) => ({ index, loudness }))
    .filter((c) => Number.isFinite(c.loudness) && c.loudness >= mean + SPIKE_MARGIN_DB);

  candidates.sort((a, b) => b.loudness - a.loudness);

  const chosen: number[] = [];
  for (const candidate of candidates) {
    if (chosen.length >= MAX_ZOOMS) break;
    const t = candidate.index * WINDOW_SECONDS + WINDOW_SECONDS / 2;
    if (chosen.some((existing) => Math.abs(existing - t) < MIN_GAP_BETWEEN_ZOOMS_SECONDS)) {
      continue;
    }
    chosen.push(t);
  }

  return chosen.sort((a, b) => a - b);
}
