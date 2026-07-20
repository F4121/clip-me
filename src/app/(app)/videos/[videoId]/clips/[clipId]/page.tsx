import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ClipTimelineEditor } from "@/components/ClipTimelineEditor";
import { ExportPanel } from "@/components/ExportPanel";

export default async function ClipEditorPage({
  params,
}: {
  params: Promise<{ videoId: string; clipId: string }>;
}) {
  const session = await auth();
  const { videoId, clipId } = await params;

  const clip = await db.suggestedClip.findUnique({
    where: { id: clipId },
    include: {
      sourceVideo: true,
      exportedClips: { orderBy: { createdAt: "desc" } },
    },
  });

  if (
    !clip ||
    !session?.user ||
    clip.sourceVideo.userId !== session.user.id ||
    clip.sourceVideoId !== videoId ||
    !clip.sourceVideo.durationSeconds
  ) {
    notFound();
  }

  const latestExport = clip.exportedClips[0] ?? null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-start px-4 py-8">
      <Link href={`/videos/${videoId}`} className="text-sm text-zinc-600 underline">
        &larr; Back to suggestions
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{clip.title}</h1>
      <p className="mt-1 text-zinc-600">{clip.rationale}</p>

      <div className="mt-6 w-full">
        <ClipTimelineEditor
          clipId={clip.id}
          videoSrc={`/api/videos/${videoId}/source`}
          durationSeconds={clip.sourceVideo.durationSeconds}
          initialStart={clip.startSeconds}
          initialEnd={clip.endSeconds}
        />
      </div>

      <div className="mt-8 w-full border-t border-zinc-200 pt-6">
        <ExportPanel
          clipId={clip.id}
          initialExport={
            latestExport
              ? {
                  id: latestExport.id,
                  status: latestExport.status,
                  errorMessage: latestExport.errorMessage,
                }
              : null
          }
        />
      </div>
    </div>
  );
}
