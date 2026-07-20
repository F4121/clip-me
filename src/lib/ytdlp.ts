import { spawn } from "node:child_process";

export interface YoutubeMetadata {
  id: string;
  title: string;
  durationSeconds: number;
  thumbnailUrl: string | null;
}

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (err) => {
      reject(new Error(`Failed to spawn ${cmd}: ${err.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`${cmd} exited with code ${code}: ${stderr.slice(-4000)}`));
      }
    });
  });
}

export async function fetchYoutubeMetadata(url: string): Promise<YoutubeMetadata> {
  const stdout = await run("yt-dlp", ["-J", "--no-playlist", url]);
  const data = JSON.parse(stdout);
  return {
    id: data.id,
    title: data.title,
    durationSeconds: data.duration,
    thumbnailUrl: data.thumbnail ?? null,
  };
}

export async function downloadYoutubeVideo(
  url: string,
  outputPath: string,
): Promise<void> {
  await run("yt-dlp", [
    "-f",
    "bv*[height<=1080]+ba/b[height<=1080]",
    "--merge-output-format",
    "mp4",
    "--no-playlist",
    "-o",
    outputPath,
    url,
  ]);
}
