import fs from "node:fs/promises";
import path from "node:path";
import { runFfmpeg } from "@/lib/ffmpeg";

const WHOOSH_PATH = path.join(process.cwd(), "storage", "sfx", "whoosh.wav");

// A short, synthesized percussive noise burst standing in for a "whoosh"
// sound on zoom moments — free and local, no sound-effect asset/license
// needed. Generated once and cached; every export reuses the same file.
export async function ensureWhooshSfx(): Promise<string> {
  try {
    await fs.access(WHOOSH_PATH);
    return WHOOSH_PATH;
  } catch {
    // not generated yet, fall through
  }

  await fs.mkdir(path.dirname(WHOOSH_PATH), { recursive: true });

  await runFfmpeg([
    "-f",
    "lavfi",
    "-i",
    "anoisesrc=d=0.3:c=white:a=1",
    "-af",
    "highpass=f=800,lowpass=f=6000,afade=t=in:d=0.02,afade=t=out:st=0.15:d=0.15,volume=2",
    "-ac",
    "2",
    WHOOSH_PATH,
  ]);

  return WHOOSH_PATH;
}
