import { spawn } from "node:child_process";
import fs from "node:fs";

const WHISPER_CPP_BIN = process.env.WHISPER_CPP_BIN ?? "whisper-cli";
const WHISPER_MODEL_PATH = process.env.WHISPER_MODEL_PATH ?? "./models/ggml-base.bin";

function checkBinary(name: string, cmd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args);
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

async function main() {
  let ok = true;

  const ffmpegOk = await checkBinary("ffmpeg", "ffmpeg", ["-version"]);
  console.log(ffmpegOk ? "[ok] ffmpeg found" : "[fail] ffmpeg not found on PATH");
  ok &&= ffmpegOk;

  const ytDlpOk = await checkBinary("yt-dlp", "yt-dlp", ["--version"]);
  console.log(ytDlpOk ? "[ok] yt-dlp found" : "[fail] yt-dlp not found on PATH");
  ok &&= ytDlpOk;

  const whisperOk = await checkBinary("whisper-cli", WHISPER_CPP_BIN, ["--help"]);
  console.log(
    whisperOk
      ? `[ok] whisper-cli found (${WHISPER_CPP_BIN})`
      : `[fail] whisper-cli not found at ${WHISPER_CPP_BIN} (set WHISPER_CPP_BIN)`,
  );
  ok &&= whisperOk;

  const modelOk = fs.existsSync(WHISPER_MODEL_PATH);
  console.log(
    modelOk
      ? `[ok] whisper model found (${WHISPER_MODEL_PATH})`
      : `[fail] whisper model not found at ${WHISPER_MODEL_PATH} (run scripts/download-model.sh)`,
  );
  ok &&= modelOk;

  if (!ok) {
    console.error("\nSome dependencies are missing. See README.md for setup instructions.");
    process.exit(1);
  }
  console.log("\nAll dependencies found.");
}

main();
