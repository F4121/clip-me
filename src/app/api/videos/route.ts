import { NextResponse } from "next/server";
import { JobType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { newVideoSchema } from "@/lib/validation";
import { enqueueJob } from "@/lib/jobs/queue";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const videos = await db.sourceVideo.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ videos });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = newVideoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const video = await db.sourceVideo.create({
    data: { userId: session.user.id, youtubeUrl: parsed.data.youtubeUrl },
  });

  await enqueueJob({ type: JobType.DOWNLOAD, sourceVideoId: video.id });

  return NextResponse.json({ video }, { status: 201 });
}
