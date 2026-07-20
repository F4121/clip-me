import { NextResponse } from "next/server";
import { JobType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { enqueueJob } from "@/lib/jobs/queue";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ clipId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { clipId } = await params;
  const clip = await db.suggestedClip.findUnique({
    where: { id: clipId },
    include: { sourceVideo: true },
  });
  if (!clip || clip.sourceVideo.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const exportedClip = await db.exportedClip.create({
    data: {
      suggestedClipId: clip.id,
      startSeconds: clip.startSeconds,
      endSeconds: clip.endSeconds,
    },
  });

  await enqueueJob({ type: JobType.EXPORT, exportedClipId: exportedClip.id });

  return NextResponse.json({ exportedClip }, { status: 201 });
}
