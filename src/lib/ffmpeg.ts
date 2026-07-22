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

export interface ExportVerticalClipParams {
  sourcePath: string;
  outputPath: string;
  startSeconds: number;
  durationSeconds: number;
  srtPath: string | null;
}

// Center-crop to 9:16 and burn in captions if a transcript was available.
// Face-tracking crop is out of scope for the MVP.
export async function exportVerticalClip({
  sourcePath,
  outputPath,
  startSeconds,
  durationSeconds,
  srtPath,
}: ExportVerticalClipParams): Promise<void> {
  const cropScale = "crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920";
  // The subtitles path must be wrapped in its own quotes, separate from the
  // force_style value's quotes — without it, absolute paths can trip up the
  // filtergraph parser on some ffmpeg versions ("No option name near ...").
  const vf = srtPath
    ? `${cropScale},subtitles='${escapeFilterPath(srtPath)}':force_style='FontName=Arial,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Alignment=2,MarginV=80'`
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
}

function escapeFilterPath(filePath: string): string {
  return filePath.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}
