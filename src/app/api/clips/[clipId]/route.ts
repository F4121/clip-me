import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { clipUpdateSchema } from "@/lib/validation";

export const runtime = "nodejs";

const MIN_CLIP_SECONDS = 30;
const MAX_CLIP_SECONDS = 60;

async function getOwnedClip(clipId: string, userId: string) {
  const clip = await db.suggestedClip.findUnique({
    where: { id: clipId },
    include: { sourceVideo: true },
  });
  if (!clip || clip.sourceVideo.userId !== userId) return null;
  return clip;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clipId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { clipId } = await params;
  const clip = await getOwnedClip(clipId, session.user.id);
  if (!clip) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ clip });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ clipId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { clipId } = await params;
  const clip = await getOwnedClip(clipId, session.user.id);
  if (!clip) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = clipUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { startSeconds, endSeconds } = parsed.data;
  const duration = endSeconds - startSeconds;

  if (duration < MIN_CLIP_SECONDS || duration > MAX_CLIP_SECONDS) {
    return NextResponse.json(
      { error: `Clip duration must be between ${MIN_CLIP_SECONDS} and ${MAX_CLIP_SECONDS} seconds` },
      { status: 400 },
    );
  }
  if (startSeconds < 0) {
    return NextResponse.json({ error: "Start time cannot be negative" }, { status: 400 });
  }
  if (clip.sourceVideo.durationSeconds && endSeconds > clip.sourceVideo.durationSeconds) {
    return NextResponse.json({ error: "End time exceeds video duration" }, { status: 400 });
  }

  const updated = await db.suggestedClip.update({
    where: { id: clipId },
    data: { startSeconds, endSeconds },
  });

  return NextResponse.json({ clip: updated });
}
