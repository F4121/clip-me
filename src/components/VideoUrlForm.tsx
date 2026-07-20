"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function VideoUrlForm() {
  const router = useRouter();
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const res = await fetch("/api/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ youtubeUrl }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Failed to start processing");
      setSubmitting(false);
      return;
    }

    router.push(`/videos/${data.video.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-lg space-y-3">
      <label className="block text-sm font-medium" htmlFor="youtubeUrl">
        YouTube URL
      </label>
      <input
        id="youtubeUrl"
        type="url"
        required
        placeholder="https://www.youtube.com/watch?v=..."
        value={youtubeUrl}
        onChange={(e) => setYoutubeUrl(e.target.value)}
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {submitting ? "Starting..." : "Get Clips"}
      </button>
    </form>
  );
}
