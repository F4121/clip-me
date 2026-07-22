import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { TranscriptSegment } from "@/types";

const WHISPER_CPP_BIN = process.env.WHISPER_CPP_BIN ?? "whisper-cli";
// Must be a multilingual model (no ".en" suffix) — the English-only models
// cannot transcribe Indonesian (or any other language) at all.
const WHISPER_MODEL_PATH =
  process.env.WHISPER_MODEL_PATH ?? "./models/ggml-base.bin";

interface WhisperJsonSegment {
  offsets: { from: number; to: number };
  text: string;
}

interface WhisperJsonOutput {
  transcription: WhisperJsonSegment[];
}

// Local, free, no-API-key speech-to-text via whisper.cpp. This is the seam
// to swap for a cloud transcription API later — callers only depend on
// TranscriptSegment[], not on whisper.cpp specifics.
export async function transcribeAudio(
  audioPath: string,
): Promise<TranscriptSegment[]> {
  const outputBase = path.join(
    os.tmpdir(),
    `whisper-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );

  await new Promise<void>((resolve, reject) => {
    const child = spawn(WHISPER_CPP_BIN, [
      "-m",
      WHISPER_MODEL_PATH,
      "-f",
      audioPath,
      "-oj",
      "-of",
      outputBase,
      "-np",
      "-nt",
      // Force near-word-level segmentation (rather than whole sentences) so
      // captions can be grouped into short, punchy phrases with tight
      // per-word timing instead of one long line per sentence.
      "-ml",
      "1",
      "-sow",
      // whisper.cpp otherwise defaults to assuming English regardless of
      // the model — auto-detect so English and Indonesian (or anything
      // else the multilingual model supports) are both transcribed
      // correctly without the caller having to know the language upfront.
      "-l",
      "auto",
    ]);
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (err) => {
      reject(new Error(`Failed to spawn whisper-cli: ${err.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`whisper-cli exited with code ${code}: ${stderr.slice(-4000)}`));
      }
    });
  });

  const jsonPath = `${outputBase}.json`;
  const raw = await fs.readFile(jsonPath, "utf-8");
  const data = JSON.parse(raw) as WhisperJsonOutput;
  await fs.unlink(jsonPath).catch(() => {});

  return data.transcription.map((segment) => ({
    start: segment.offsets.from / 1000,
    end: segment.offsets.to / 1000,
    text: segment.text.trim(),
  }));
}
