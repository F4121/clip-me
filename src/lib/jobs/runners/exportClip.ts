import fs from "node:fs/promises";
import { db } from "@/lib/db";
import { ExportedClipStatus } from "@prisma/client";
import { exportVerticalClip } from "@/lib/ffmpeg";
import { detectZoomMoments } from "@/lib/zoomEffects";
import { ensureWhooshSfx } from "@/lib/soundEffects";
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

    // Captions are not burned in — transcription accuracy on real-world
    // audio (background music, multiple speakers) wasn't reliable enough,
    // and the user prefers to add captions manually in their own editor.
    // Zoom + whoosh stay: both are driven by audio loudness analysis, not
    // transcript content, so they're unaffected by transcription accuracy.
    const assPath: string | null = null;

    let zoomTimestamps: number[] = [];
    let whooshPath: string | null = null;
    if (sourceVideo.localAudioPath) {
      zoomTimestamps = await detectZoomMoments(
        sourceVideo.localAudioPath,
        exportedClip.startSeconds,
        clipDurationSeconds,
      );
      if (zoomTimestamps.length > 0) {
        whooshPath = await ensureWhooshSfx();
      }
    }

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
