import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ProcessingStatus, type VideoData } from "@/components/ProcessingStatus";

export default async function VideoStatusPage({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  const session = await auth();
  const { videoId } = await params;

  const video = await db.sourceVideo.findUnique({
    where: { id: videoId },
    include: { suggestedClips: { orderBy: { startSeconds: "asc" } } },
  });

  if (!video || !session?.user || video.userId !== session.user.id) {
    notFound();
  }

  const videoData: VideoData = {
    id: video.id,
    title: video.title,
    thumbnailUrl: video.thumbnailUrl,
    status: video.status,
    errorMessage: video.errorMessage,
    durationSeconds: video.durationSeconds,
    suggestedClips: video.suggestedClips.map((clip) => ({
      id: clip.id,
      title: clip.title,
      rationale: clip.rationale,
      startSeconds: clip.startSeconds,
      endSeconds: clip.endSeconds,
    })),
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-start px-4 py-8">
      <ProcessingStatus initialVideo={videoData} />
    </div>
  );
}
