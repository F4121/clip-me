import fs from "node:fs";
import { Readable } from "node:stream";
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
    exportedClip.suggestedClip.sourceVideo.userId !== session.user.id ||
    exportedClip.status !== "READY" ||
    !exportedClip.localFilePath
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const stat = await fs.promises.stat(exportedClip.localFilePath);
  const stream = Readable.toWeb(
    fs.createReadStream(exportedClip.localFilePath),
  ) as ReadableStream;

  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(stat.size),
      "Content-Disposition": `attachment; filename="clip-${exportedClip.id}.mp4"`,
    },
  });
}
