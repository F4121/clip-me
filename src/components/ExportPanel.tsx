"use client";

import { useEffect, useState } from "react";

interface ExportState {
  id: string;
  status: string;
  errorMessage: string | null;
}

const TERMINAL_STATUSES = new Set(["READY", "FAILED"]);

export function ExportPanel({
  clipId,
  initialExport,
}: {
  clipId: string;
  initialExport: ExportState | null;
}) {
  const [exportState, setExportState] = useState<ExportState | null>(initialExport);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!exportState || TERMINAL_STATUSES.has(exportState.status)) return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/exports/${exportState.id}`);
      if (!res.ok) return;
      const data = await res.json();
      setExportState(data.exportedClip);
    }, 2000);
    return () => clearInterval(interval);
  }, [exportState]);

  async function handleExport() {
    setStarting(true);
    const res = await fetch(`/api/clips/${clipId}/export`, { method: "POST" });
    setStarting(false);
    if (!res.ok) return;
    const data = await res.json();
    setExportState({
      id: data.exportedClip.id,
      status: data.exportedClip.status,
      errorMessage: null,
    });
  }

  const isRendering = exportState !== null && !TERMINAL_STATUSES.has(exportState.status);

  return (
    <div>
      <h2 className="text-lg font-semibold">Export</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Renders a vertical (9:16) MP4 with burned-in captions.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleExport}
          disabled={starting || isRendering}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {isRendering ? "Rendering..." : "Export clip"}
        </button>

        {exportState?.status === "READY" && (
          <a
            href={`/api/exports/${exportState.id}/download`}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium"
          >
            Download MP4
          </a>
        )}
      </div>

      {exportState?.status === "FAILED" && exportState.errorMessage && (
        <p className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-700">
          {exportState.errorMessage}
        </p>
      )}
    </div>
  );
}
