import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ exportId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { exportId } = await params;
  const exportedClip = await db.exportedClip.findUnique({
    where: { id: exportId },
    include: { suggestedClip: { include: { sourceVideo: true } } },
  });

  if (
    !exportedClip ||
    exportedClip.suggestedClip.sourceVideo.userId !== session.user.id
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    exportedClip: {
      id: exportedClip.id,
      status: exportedClip.status,
      errorMessage: exportedClip.errorMessage,
    },
  });
}
