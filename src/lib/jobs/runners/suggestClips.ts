import { db } from "@/lib/db";
import { SourceVideoStatus } from "@prisma/client";
import { suggestClips } from "@/lib/suggestions";
import type { TranscriptSegment } from "@/types";

export async function runSuggestClips(sourceVideoId: string): Promise<void> {
  const video = await db.sourceVideo.findUniqueOrThrow({
    where: { id: sourceVideoId },
  });

  if (!video.localAudioPath || !video.durationSeconds) {
    throw new Error("Cannot suggest clips: missing audio or duration");
  }

  await db.sourceVideo.update({
    where: { id: sourceVideoId },
    data: { status: SourceVideoStatus.SUGGESTING, errorMessage: null },
  });

  try {
    const transcript: TranscriptSegment[] = video.transcript
      ? JSON.parse(video.transcript)
      : [];

    const suggestions = await suggestClips({
      audioPath: video.localAudioPath,
      durationSeconds: video.durationSeconds,
      transcript,
    });

    await db.$transaction([
      db.suggestedClip.deleteMany({ where: { sourceVideoId } }),
      ...suggestions.map((s) =>
        db.suggestedClip.create({
          data: {
            sourceVideoId,
            startSeconds: s.startSeconds,
            endSeconds: s.endSeconds,
            title: s.title,
            rationale: s.rationale,
          },
        }),
      ),
      db.sourceVideo.update({
        where: { id: sourceVideoId },
        data: { status: SourceVideoStatus.SUGGESTED },
      }),
    ]);
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
