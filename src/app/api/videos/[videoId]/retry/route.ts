import { NextResponse } from "next/server";
import { JobType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { enqueueJob } from "@/lib/jobs/queue";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ videoId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { videoId } = await params;
  const video = await db.sourceVideo.findUnique({ where: { id: videoId } });
  if (!video || video.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (video.status !== "FAILED") {
    return NextResponse.json({ error: "Video is not in a failed state" }, { status: 400 });
  }

  let jobType: JobType;
  if (!video.localFilePath) {
    jobType = JobType.DOWNLOAD;
  } else if (!video.transcript) {
    jobType = JobType.TRANSCRIBE;
  } else {
    jobType = JobType.SUGGEST;
  }

  await enqueueJob({ type: jobType, sourceVideoId: video.id });

  return NextResponse.json({ ok: true });
}
