import { spawn } from "node:child_process";

export function runFfmpeg(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", ["-y", ...args]);
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (err) => {
      reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stderr);
      } else {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-4000)}`));
      }
    });
  });
}

export async function extractAudioWav(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  await runFfmpeg([
    "-i",
    inputPath,
    "-ar",
    "16000",
    "-ac",
    "1",
    "-c:a",
    "pcm_s16le",
    outputPath,
  ]);
}

// Mean volume (dB) of a slice of audio, used both for clip-suggestion
// scoring and for zoom-moment detection. Louder (closer to 0) is higher.
export async function measureLoudness(
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

const ZOOM_AMOUNT = 0.14;
const ZOOM_PULSE_HALF_WIDTH_SECONDS = 0.25;

export interface ExportVerticalClipParams {
  sourcePath: string;
  outputPath: string;
  startSeconds: number;
  durationSeconds: number;
  /** Path to a .ass captions file (styling, including font size, is baked into the file itself). */
  assPath: string | null;
  /** Seconds relative to clip start where a brief punch-zoom should trigger. */
  zoomTimestamps?: number[];
  /** Path to a short sound effect burned in at each zoom moment. Ignored if zoomTimestamps is empty. */
  whooshPath?: string | null;
}

// Center-crop to 9:16, optionally punch-zoom on emphasis moments with a
// whoosh sound, and burn in captions if a transcript was available.
// Face-tracking crop is out of scope for the MVP.
export async function exportVerticalClip({
  sourcePath,
  outputPath,
  startSeconds,
  durationSeconds,
  assPath,
  zoomTimestamps = [],
  whooshPath = null,
}: ExportVerticalClipParams): Promise<void> {
  const useZoom = zoomTimestamps.length > 0 && Boolean(whooshPath);

  if (!useZoom) {
    // No zoom/sfx requested: keep the original, simpler single-input
    // command so the common case has the smallest possible surface area.
    const cropScale = "crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920";
    const vf = assPath
      ? `${cropScale},${subtitlesFilter(assPath)}`
      : cropScale;

    await runFfmpeg([
      "-ss",
      String(startSeconds),
      "-i",
      sourcePath,
      "-t",
      String(durationSeconds),
      "-vf",
      vf,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      outputPath,
    ]);
    return;
  }

  // crop's w/h are only evaluated once at init (only x/y are per-frame), so
  // a single dynamic crop can't pulse-zoom over time. Instead, cut the clip
  // into alternating "normal" and "zoomed" segments (each a static crop) and
  // concat them back together — a jump-cut punch-zoom rather than a smooth
  // animated one, but far more robust and exactly how many real short-form
  // edits do it anyway.
  const zoomFactor = 1 - ZOOM_AMOUNT;
  const normalCrop = "crop=ih*9/16:ih:(iw-ih*9/16)/2:0";
  const zoomedCrop = `crop=ih*9/16*${zoomFactor}:ih*${zoomFactor}:(iw-ih*9/16*${zoomFactor})/2:(ih-ih*${zoomFactor})/2`;

  // concat requires every input to already share identical dimensions, so
  // scale each segment to the final output size individually — the zoomed
  // crop's smaller region and the normal crop's larger region must both
  // land on 1080x1920 *before* concat, not after.
  const segments = buildZoomSegments(durationSeconds, zoomTimestamps);
  const segLabels: string[] = [];
  let videoChain = "";
  segments.forEach((seg, i) => {
    const crop = seg.zoomed ? zoomedCrop : normalCrop;
    videoChain += `[0:v]trim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},setpts=PTS-STARTPTS,${crop},scale=1080:1920,setsar=1[vseg${i}];`;
    segLabels.push(`[vseg${i}]`);
  });
  videoChain += `${segLabels.join("")}concat=n=${segments.length}:v=1:a=0[vcat]`;

  let videoOutLabel = "[vcat]";
  if (assPath) {
    videoChain += `;[vcat]${subtitlesFilter(assPath)}[vout]`;
    videoOutLabel = "[vout]";
  }

  const n = zoomTimestamps.length;
  const splitLabels = Array.from({ length: n }, (_, i) => `[s${i}]`).join("");
  let audioChain = `[1:a]asplit=${n}${splitLabels};`;
  const delayLabels: string[] = [];
  zoomTimestamps.forEach((t, i) => {
    const ms = Math.max(0, Math.round(t * 1000));
    audioChain += `[s${i}]adelay=${ms}:all=1[d${i}];`;
    delayLabels.push(`[d${i}]`);
  });
  audioChain += `[0:a]${delayLabels.join("")}amix=inputs=${n + 1}:duration=first:dropout_transition=0[aout]`;

  const filterComplex = `${videoChain};${audioChain}`;

  await runFfmpeg([
    "-ss",
    String(startSeconds),
    "-i",
    sourcePath,
    "-i",
    whooshPath!,
    "-filter_complex",
    filterComplex,
    "-map",
    videoOutLabel,
    "-map",
    "[aout]",
    "-t",
    String(durationSeconds),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    outputPath,
  ]);
}

function subtitlesFilter(assPath: string): string {
  // Use the explicit `filename=` key rather than relying on positional-arg
  // inference for the subtitles filter's first option — newer ffmpeg
  // (8.x) rejects mixing a positional path with subsequent named options
  // ("No option name near ..."), even when the path itself is quoted.
  //
  // No force_style here: styling (font, size, color, alignment) is baked
  // into the .ass file's own [V4+ Styles] section, with an explicit
  // PlayResX/PlayResY matching the real output frame — see subtitles.ts
  // for why that matters.
  return `subtitles=filename='${escapeFilterPath(assPath)}'`;
}

interface ZoomSegment {
  start: number;
  end: number;
  zoomed: boolean;
}

// Splits [0, durationSeconds] into alternating normal/zoomed segments, one
// zoomed segment centered on each timestamp. Overlapping zoom windows (not
// expected given the caller's minimum spacing, but cheap to guard) are
// merged so segments never overlap.
function buildZoomSegments(
  durationSeconds: number,
  timestampsSeconds: number[],
): ZoomSegment[] {
  if (timestampsSeconds.length === 0) {
    return [{ start: 0, end: durationSeconds, zoomed: false }];
  }

  const zoomIntervals = timestampsSeconds
    .map((t) => ({
      start: Math.max(0, t - ZOOM_PULSE_HALF_WIDTH_SECONDS),
      end: Math.min(durationSeconds, t + ZOOM_PULSE_HALF_WIDTH_SECONDS),
    }))
    .sort((a, b) => a.start - b.start);

  const merged: { start: number; end: number }[] = [];
  for (const interval of zoomIntervals) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }

  const segments: ZoomSegment[] = [];
  let cursor = 0;
  for (const interval of merged) {
    if (interval.start > cursor) {
      segments.push({ start: cursor, end: interval.start, zoomed: false });
    }
    segments.push({ start: interval.start, end: interval.end, zoomed: true });
    cursor = interval.end;
  }
  if (cursor < durationSeconds) {
    segments.push({ start: cursor, end: durationSeconds, zoomed: false });
  }

  return segments.filter((s) => s.end - s.start > 0.01);
}

function escapeFilterPath(filePath: string): string {
  return filePath.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}
