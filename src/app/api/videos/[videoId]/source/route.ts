import fs from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ videoId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { videoId } = await params;
  const video = await db.sourceVideo.findUnique({ where: { id: videoId } });
  if (!video || video.userId !== session.user.id || !video.localFilePath) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const stat = await fs.promises.stat(video.localFilePath);
  const range = req.headers.get("range");

  if (!range) {
    const stream = Readable.toWeb(
      fs.createReadStream(video.localFilePath),
    ) as ReadableStream;
    return new NextResponse(stream, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(stat.size),
        "Accept-Ranges": "bytes",
      },
    });
  }

  const match = /bytes=(\d+)-(\d+)?/.exec(range);
  const start = match?.[1] ? parseInt(match[1], 10) : 0;
  const end = match?.[2] ? parseInt(match[2], 10) : stat.size - 1;
  const chunkSize = end - start + 1;

  const stream = Readable.toWeb(
    fs.createReadStream(video.localFilePath, { start, end }),
  ) as ReadableStream;

  return new NextResponse(stream, {
    status: 206,
    headers: {
      "Content-Type": "video/mp4",
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": String(chunkSize),
    },
  });
}
