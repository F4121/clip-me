import fs from "node:fs/promises";
import { db } from "@/lib/db";
import { ExportedClipStatus } from "@prisma/client";
import { buildSrt } from "@/lib/subtitles";
import { exportVerticalClip } from "@/lib/ffmpeg";
import {
  exportedClipDir,
  exportedClipCaptionsPath,
  exportedClipOutputPath,
} from "@/lib/paths";
import type { TranscriptSegment } from "@/types";

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

    let srtPath: string | null = null;
    if (sourceVideo.transcript) {
      const segments: TranscriptSegment[] = JSON.parse(sourceVideo.transcript);
      const srt = buildSrt(segments, exportedClip.startSeconds, exportedClip.endSeconds);
      if (srt.trim().length > 0) {
        srtPath = exportedClipCaptionsPath(exportedClipId);
        await fs.writeFile(srtPath, srt, "utf-8");
      }
    }

    const outputPath = exportedClipOutputPath(exportedClipId);
    await exportVerticalClip({
      sourcePath: sourceVideo.localFilePath,
      outputPath,
      startSeconds: exportedClip.startSeconds,
      durationSeconds: exportedClip.endSeconds - exportedClip.startSeconds,
      srtPath,
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
