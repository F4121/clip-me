"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const MIN_CLIP = 30;
const MAX_CLIP = 60;

interface Props {
  clipId: string;
  videoSrc: string;
  durationSeconds: number;
  initialStart: number;
  initialEnd: number;
}

type DragHandle = "start" | "end" | null;

export function ClipTimelineEditor({
  clipId,
  videoSrc,
  durationSeconds,
  initialStart,
  initialEnd,
}: Props) {
  const router = useRouter();
  const trackRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stateRef = useRef({ start: initialStart, end: initialEnd });

  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [dragging, setDragging] = useState<DragHandle>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    stateRef.current = { start, end };
  }, [start, end]);

  useEffect(() => {
    if (!dragging) return;

    function onMove(e: PointerEvent) {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const timeSec = ratio * durationSeconds;
      const { start: curStart, end: curEnd } = stateRef.current;

      if (dragging === "start") {
        let newStart = Math.max(0, Math.min(timeSec, curEnd - MIN_CLIP));
        newStart = Math.max(newStart, curEnd - MAX_CLIP);
        setStart(newStart);
      } else {
        let newEnd = Math.min(durationSeconds, Math.max(timeSec, curStart + MIN_CLIP));
        newEnd = Math.min(newEnd, curStart + MAX_CLIP);
        setEnd(newEnd);
      }
      setSaved(false);
    }

    function onUp() {
      setDragging(null);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, durationSeconds]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);

    const res = await fetch(`/api/clips/${clipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startSeconds: start, endSeconds: end }),
    });

    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to save");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  function previewFromStart() {
    if (videoRef.current) {
      videoRef.current.currentTime = start;
      void videoRef.current.play();
    }
  }

  const startPct = (start / durationSeconds) * 100;
  const endPct = (end / durationSeconds) * 100;

  return (
    <div className="w-full space-y-4">
      <video
        ref={videoRef}
        src={videoSrc}
        controls
        className="w-full rounded-lg bg-black"
      />

      <div>
        <div ref={trackRef} className="relative h-3 w-full rounded-full bg-zinc-200">
          <div
            className="absolute h-3 rounded-full bg-zinc-900"
            style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
          />
          <button
            type="button"
            aria-label="Clip start handle"
            onPointerDown={() => setDragging("start")}
            className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none rounded-full border-2 border-white bg-zinc-900 shadow"
            style={{ left: `${startPct}%` }}
          />
          <button
            type="button"
            aria-label="Clip end handle"
            onPointerDown={() => setDragging("end")}
            className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none rounded-full border-2 border-white bg-zinc-900 shadow"
            style={{ left: `${endPct}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-sm text-zinc-600">
          <span>{formatTime(start)}</span>
          <span>{Math.round(end - start)}s selected</span>
          <span>{formatTime(end)}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={previewFromStart}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        >
          Preview from start
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save trim"}
        </button>
        {saved && <span className="text-sm text-green-700">Saved</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
