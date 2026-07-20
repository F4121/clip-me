import fs from "node:fs/promises";
import { db } from "@/lib/db";
import { SourceVideoStatus } from "@prisma/client";
import { fetchYoutubeMetadata, downloadYoutubeVideo } from "@/lib/ytdlp";
import { sourceVideoDir, sourceVideoFilePath } from "@/lib/paths";

export async function runDownloadVideo(sourceVideoId: string): Promise<void> {
  const video = await db.sourceVideo.findUniqueOrThrow({
    where: { id: sourceVideoId },
  });

  await db.sourceVideo.update({
    where: { id: sourceVideoId },
    data: { status: SourceVideoStatus.DOWNLOADING, errorMessage: null },
  });

  try {
    const metadata = await fetchYoutubeMetadata(video.youtubeUrl);
    await fs.mkdir(sourceVideoDir(sourceVideoId), { recursive: true });
    const outputPath = sourceVideoFilePath(sourceVideoId);
    await downloadYoutubeVideo(video.youtubeUrl, outputPath);

    await db.sourceVideo.update({
      where: { id: sourceVideoId },
      data: {
        status: SourceVideoStatus.DOWNLOADED,
        youtubeVideoId: metadata.id,
        title: metadata.title,
        durationSeconds: metadata.durationSeconds,
        thumbnailUrl: metadata.thumbnailUrl,
        localFilePath: outputPath,
      },
    });
  } catch (err) {
    await db.sourceVideo.update({
      where: { id: sourceVideoId },
      data: {
        status: SourceVideoStatus.FAILED,
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
}
