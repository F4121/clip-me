import { db } from "@/lib/db";
import { SourceVideoStatus } from "@prisma/client";
import { extractAudioWav } from "@/lib/ffmpeg";
import { transcribeAudio } from "@/lib/transcription";
import { sourceAudioFilePath } from "@/lib/paths";

export async function runTranscribe(sourceVideoId: string): Promise<void> {
  const video = await db.sourceVideo.findUniqueOrThrow({
    where: { id: sourceVideoId },
  });

  if (!video.localFilePath) {
    throw new Error("Cannot transcribe: source video has no local file");
  }

  await db.sourceVideo.update({
    where: { id: sourceVideoId },
    data: { status: SourceVideoStatus.TRANSCRIBING, errorMessage: null },
  });

  try {
    const audioPath = sourceAudioFilePath(sourceVideoId);
    await extractAudioWav(video.localFilePath, audioPath);

    const segments = await transcribeAudio(audioPath);

    await db.sourceVideo.update({
      where: { id: sourceVideoId },
      data: {
        status: SourceVideoStatus.TRANSCRIBED,
        localAudioPath: audioPath,
        transcript: JSON.stringify(segments),
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
