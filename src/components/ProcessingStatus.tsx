"use client";

import { useEffect, useState } from "react";
import { ClipCard } from "@/components/ClipCard";

interface SuggestedClipData {
  id: string;
  title: string;
  rationale: string;
  startSeconds: number;
  endSeconds: number;
}

export interface VideoData {
  id: string;
  title: string | null;
  thumbnailUrl: string | null;
  status: string;
  errorMessage: string | null;
  durationSeconds: number | null;
  suggestedClips: SuggestedClipData[];
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Queued...",
  DOWNLOADING: "Downloading video from YouTube...",
  DOWNLOADED: "Downloaded. Extracting audio...",
  TRANSCRIBING: "Transcribing audio locally (this can take a while)...",
  TRANSCRIBED: "Transcribed. Picking clip candidates...",
  SUGGESTING: "Analyzing audio for clip-worthy moments...",
  SUGGESTED: "Done",
  FAILED: "Failed",
};

const TERMINAL_STATUSES = new Set(["SUGGESTED", "FAILED"]);

export function ProcessingStatus({ initialVideo }: { initialVideo: VideoData }) {
  const [video, setVideo] = useState(initialVideo);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (TERMINAL_STATUSES.has(video.status)) return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/videos/${video.id}`);
      if (!res.ok) return;
      const data = await res.json();
      setVideo(data.video);
    }, 2000);
    return () => clearInterval(interval);
  }, [video.id, video.status]);

  async function handleRetry() {
    setRetrying(true);
    const res = await fetch(`/api/videos/${video.id}/retry`, { method: "POST" });
    setRetrying(false);
    if (!res.ok) return;
    const refreshed = await fetch(`/api/videos/${video.id}`);
    if (refreshed.ok) {
      const data = await refreshed.json();
      setVideo(data.video);
    }
  }

  return (
    <div className="w-full max-w-3xl space-y-6">
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">
              {video.title ?? "Fetching video info..."}
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              {STATUS_LABEL[video.status] ?? video.status}
            </p>
          </div>
          {!TERMINAL_STATUSES.has(video.status) && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
          )}
        </div>
        {video.status === "FAILED" && (
          <div className="mt-3 space-y-2">
            {video.errorMessage && (
              <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">
                {video.errorMessage}
              </p>
            )}
            <button
              type="button"
              onClick={handleRetry}
              disabled={retrying}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              {retrying ? "Retrying..." : "Retry"}
            </button>
          </div>
        )}
      </div>

      {video.status === "SUGGESTED" && (
        <div>
          <h3 className="mb-3 text-lg font-semibold">Suggested clips</h3>
          {video.suggestedClips.length === 0 ? (
            <p className="text-sm text-zinc-600">No candidates found.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {video.suggestedClips.map((clip) => (
                <ClipCard key={clip.id} clip={clip} videoId={video.id} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
