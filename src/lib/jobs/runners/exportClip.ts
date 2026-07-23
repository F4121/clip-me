import fs from "node:fs/promises";
import { db } from "@/lib/db";
import { ExportedClipStatus } from "@prisma/client";
import { exportVerticalClip } from "@/lib/ffmpeg";
import { exportedClipDir, exportedClipOutputPath } from "@/lib/paths";

export async function runExportClip(exportedClipId: string): Promise<void> {
  const exportedClip = await db.exportedClip.findUniqueOrThrow({
    where: { id: exportedClipId },
    include: { suggestedClip: { include: { sourceVideo: true } } },
  });

  const sourceVideo = exportedClip.suggestedClip.sourceVideo;
  if (!sourceVideo.localFilePath) {
    throw new Error("Cannot export: source video file is missing");
  }

  await db.exportedClip.update({
    where: { id: exportedClipId },
    data: { status: ExportedClipStatus.RENDERING, errorMessage: null },
  });

  try {
    await fs.mkdir(exportedClipDir(exportedClipId), { recursive: true });

    const clipDurationSeconds = exportedClip.endSeconds - exportedClip.startSeconds;

    // Captions, punch-zoom, and whoosh sfx are all disabled by request —
    // export is a plain crop/scale with the original audio untouched.
    // Zoom+whoosh required mixing the original audio through ffmpeg's
    // `amix`, which auto-reduces overall volume to avoid clipping even
    // though the whoosh itself is silent almost the whole clip — audible
    // as "quieter than the original". Skipping that path entirely (rather
    // than tuning amix's normalize/weights) avoids the volume loss and is
    // simplest to reason about, matching plain audio passthrough exactly.
    const assPath: string | null = null;
    const zoomTimestamps: number[] = [];
    const whooshPath: string | null = null;

    const outputPath = exportedClipOutputPath(exportedClipId);
    await exportVerticalClip({
      sourcePath: sourceVideo.localFilePath,
      outputPath,
      startSeconds: exportedClip.startSeconds,
      durationSeconds: clipDurationSeconds,
      assPath,
      zoomTimestamps,
      whooshPath,
    });

    await db.exportedClip.update({
      where: { id: exportedClipId },
      data: { status: ExportedClipStatus.READY, localFilePath: outputPath },
    });
  } catch (err) {
    await db.exportedClip.update({
      where: { id: exportedClipId },
      data: {
        status: ExportedClipStatus.FAILED,
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
}
