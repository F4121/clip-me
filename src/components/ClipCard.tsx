import Link from "next/link";

interface ClipCardProps {
  clip: {
    id: string;
    title: string;
    rationale: string;
    startSeconds: number;
    endSeconds: number;
  };
  videoId: string;
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ClipCard({ clip, videoId }: ClipCardProps) {
  return (
    <Link
      href={`/videos/${videoId}/clips/${clip.id}`}
      className="block rounded-lg border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-400"
    >
      <p className="text-xs font-medium text-zinc-500">
        {formatTime(clip.startSeconds)} - {formatTime(clip.endSeconds)} (
        {Math.round(clip.endSeconds - clip.startSeconds)}s)
      </p>
      <h3 className="mt-1 font-semibold">{clip.title}</h3>
      <p className="mt-1 text-sm text-zinc-600">{clip.rationale}</p>
    </Link>
  );
}
