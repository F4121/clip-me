# Clip Me

Turn a long YouTube video into a handful of short (30–60s), vertical,
caption-burned clips.

Paste a YouTube URL and the app will:

1. Download the video locally (`yt-dlp`)
2. Transcribe it locally (`whisper.cpp` — free, no API key)
3. Suggest a few 30–60s candidate clips using a free audio heuristic
   (silence + loudness analysis — no LLM)
4. Let you preview and trim each suggestion on a timeline
5. Export a vertical (9:16) MP4 with burned-in captions

Everything runs locally. No paid API keys are required for this MVP.

## Prerequisites

You need three system binaries on your `PATH` (none of this is npm-installable):

- **[ffmpeg](https://ffmpeg.org/)** — `apt install ffmpeg` / `brew install ffmpeg`
- **[yt-dlp](https://github.com/yt-dlp/yt-dlp)** — `pipx install yt-dlp` (recommended over distro packages, which lag behind)
- **[whisper.cpp](https://github.com/ggml-org/whisper.cpp)** — build from source:

  ```bash
  git clone https://github.com/ggml-org/whisper.cpp.git
  cd whisper.cpp
  cmake -B build -DCMAKE_BUILD_TYPE=Release
  cmake --build build -j
  ```

  This produces `build/bin/whisper-cli`. Point `WHISPER_CPP_BIN` in `.env` at
  it (see below).

## Setup

```bash
npm install
cp .env.example .env
# edit .env: set NEXTAUTH_SECRET (openssl rand -base64 32), and
# WHISPER_CPP_BIN to your whisper.cpp build's whisper-cli path

npx prisma migrate dev

# Download the local transcription model (~140MB, free, no key)
./scripts/download-model.sh base.en

npm run check-deps   # verifies ffmpeg / yt-dlp / whisper-cli / model are all found

npm run dev
```

Open http://localhost:3000, sign up, and paste a YouTube URL.

## Environment variables

See `.env.example`. The MVP needs no paid API keys — `OPENAI_API_KEY` /
`ANTHROPIC_API_KEY` are placeholders reserved for a future phase (see below).

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | SQLite file path, e.g. `file:./dev.db` |
| `NEXTAUTH_SECRET` | Session signing secret — generate with `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Base URL, `http://localhost:3000` for local dev |
| `WHISPER_CPP_BIN` | Path to your whisper.cpp `whisper-cli` binary |
| `WHISPER_MODEL_PATH` | Path to the downloaded ggml model file |

## How it works

- **Processing pipeline**: an in-process job queue (`src/lib/jobs/queue.ts`)
  runs download → transcribe → suggest automatically as each stage
  completes; export is triggered per-clip by the user. There's no
  Redis/BullMQ — this is a single-user local app, so an in-memory queue
  inside the same Next.js process is enough. If the dev server restarts
  mid-job, that job is marked failed on the next boot (use the Retry button).
- **Clip suggestions** (`src/lib/suggestions.ts`) are picked with a free,
  local heuristic: ffmpeg's `silencedetect` finds clean cut points, and
  `volumedetect` over candidate windows is used as a proxy for "energetic"
  moments. This is intentionally rough — it's a starting point for you to
  review and adjust, not real virality detection.
- **Captions** are burned in via ffmpeg's `subtitles` filter, generated
  from the whisper.cpp transcript sliced to each clip's time range.
- **Export** center-crops to 9:16 and encodes with libx264/aac. Face-tracking
  crop is out of scope for this MVP.

## Known limitations (MVP)

- Supports multiple accounts, but each user only sees their own videos —
  there's no sharing/collaboration.
- The job queue is in-memory — it doesn't survive a server restart mid-job
  (use the Retry button on a failed video/export).
- Clip suggestions are a rough audio heuristic, not AI-driven virality
  detection.
- Vertical crop is a fixed center-crop, not subject-aware.

## Future phase: adding paid AI

Once the MVP is working end-to-end, two modules are the intended swap
points for smarter (paid) AI:

- `src/lib/suggestions.ts` → replace the heuristic with a Claude-backed
  suggester that reads the transcript and proposes segments with real
  rationale (`ANTHROPIC_API_KEY`).
- `src/lib/transcription.ts` → optionally replace local whisper.cpp with a
  cloud Whisper API for faster/more accurate transcription
  (`OPENAI_API_KEY`).

Both are called with plain data in/out (`TranscriptSegment[]`,
`ClipSuggestion[]`), so swapping the implementation shouldn't require
touching the job queue, data model, or UI.
