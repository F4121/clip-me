import path from "node:path";

export const STORAGE_ROOT = path.join(process.cwd(), "storage");

export function sourceVideoDir(sourceVideoId: string) {
  return path.join(STORAGE_ROOT, "videos", sourceVideoId);
}

export function sourceVideoFilePath(sourceVideoId: string) {
  return path.join(sourceVideoDir(sourceVideoId), "source.mp4");
}

export function sourceAudioFilePath(sourceVideoId: string) {
  return path.join(sourceVideoDir(sourceVideoId), "audio.wav");
}

export function exportedClipDir(exportedClipId: string) {
  return path.join(STORAGE_ROOT, "clips", exportedClipId);
}

export function exportedClipCaptionsPath(exportedClipId: string) {
  return path.join(exportedClipDir(exportedClipId), "captions.ass");
}

export function exportedClipOutputPath(exportedClipId: string) {
  return path.join(exportedClipDir(exportedClipId), "output.mp4");
}
