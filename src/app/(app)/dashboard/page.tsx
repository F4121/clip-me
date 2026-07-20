import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-zinc-100 text-zinc-700",
  DOWNLOADING: "bg-blue-100 text-blue-700",
  DOWNLOADED: "bg-blue-100 text-blue-700",
  TRANSCRIBING: "bg-blue-100 text-blue-700",
  TRANSCRIBED: "bg-blue-100 text-blue-700",
  SUGGESTING: "bg-blue-100 text-blue-700",
  SUGGESTED: "bg-green-100 text-green-700",
  FAILED: "bg-red-100 text-red-700",
};

export default async function DashboardPage() {
  const session = await auth();
  const videos = session?.user
    ? await db.sourceVideo.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
      })
    : [];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <Link
          href="/new"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
        >
          New Clip
        </Link>
      </div>

      {videos.length === 0 ? (
        <p className="mt-6 text-zinc-600">
          No videos yet. Paste a YouTube URL to get started.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {videos.map((video) => (
            <li key={video.id}>
              <Link
                href={`/videos/${video.id}`}
                className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-400"
              >
                <div>
                  <p className="font-medium">
                    {video.title ?? video.youtubeUrl}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {new Date(video.createdAt).toLocaleString()}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    STATUS_BADGE[video.status] ?? "bg-zinc-100 text-zinc-700"
                  }`}
                >
                  {video.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
