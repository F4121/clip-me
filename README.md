# Clip Me

Turn a long YouTube video into a handful of short (30–60s), vertical,
caption-burned clips. Transcription auto-detects the spoken language
(English, Indonesian, and anything else the whisper.cpp model supports).

Paste a YouTube URL and the app will:

1. Download the video locally (`yt-dlp`)
2. Transcribe it locally, word-by-word (`whisper.cpp` — free, no API key)
3. Suggest a few 30–60s candidate clips using a free audio heuristic
   (silence + loudness analysis — no LLM)
4. Let you preview and trim each suggestion on a timeline
5. Export a vertical (9:16) MP4 with:
   - Bold, word-by-word "punch" captions (short phrases, not full sentences)
   - A brief punch-zoom + whoosh sound effect on loud/emphasis moments

Everything runs locally. No paid API keys are required for this MVP.

## Prerequisites

You need three system binaries on your `PATH` (none of this is npm-installable):

- **[ffmpeg](https://ffmpeg.org/)** — `apt install ffmpeg` / `brew install ffmpeg`
- **[yt-dlp](https://github.com/yt-dlp/yt-dlp)** — `pipx install yt-dlp`
  (recommended over distro packages, which lag behind). If `yt-dlp` isn't
  found afterward, run `pipx ensurepath` and open a new shell —
  `~/.local/bin` needs to be on your `PATH`.
- **[whisper.cpp](https://github.com/ggml-org/whisper.cpp)** — build from
  source, **from the root of this repo** (the default `WHISPER_CPP_BIN` in
  `.env.example` assumes it lives at `./whisper.cpp`; the directory is
  gitignored so it's safe to clone here):

  ```bash
  git clone https://github.com/ggml-org/whisper.cpp.git
  cd whisper.cpp
  cmake -B build -DCMAKE_BUILD_TYPE=Release
  cmake --build build -j
  cd ..
  ```

  This produces `whisper.cpp/build/bin/whisper-cli`. If you build it
  somewhere else instead, set `WHISPER_CPP_BIN` in `.env` to that path.

## Setup

```bash
npm install
cp .env.example .env
# edit .env: set NEXTAUTH_SECRET (openssl rand -base64 32), and
# WHISPER_CPP_BIN to your whisper.cpp build's whisper-cli path

npx prisma migrate dev

# Download the local transcription model (~140MB, free, no key)
# "base" is multilingual (auto-detects the spoken language, e.g. English or
# Indonesian). Pass "small" instead for meaningfully better non-English
# accuracy, at the cost of a larger download and slower transcription.
./scripts/download-model.sh base

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
- **Captions** are grouped into short 1-2 word phrases from whisper.cpp's
  word-level timestamps (`src/lib/subtitles.ts`), then burned in as a native
  `.ass` file via ffmpeg's `subtitles` filter — a plain `.srt` doesn't carry
  its own font/size/position, so styling is instead baked directly into the
  `.ass`'s style header, with an explicit `PlayResX`/`PlayResY` matching the
  real output frame (without that, ffmpeg's automatic SRT→ASS conversion
  assumes an old default design canvas and inflates the font size).
- **Punch-zoom + whoosh** (`src/lib/zoomEffects.ts`, `src/lib/soundEffects.ts`):
  loud/emphasis moments within a clip's own audio trigger a brief jump-cut
  zoom-in paired with a synthesized whoosh sound. Implemented as alternating
  "normal" and "zoomed" segments concatenated back together (ffmpeg's `crop`
  filter only re-evaluates `x`/`y` per frame, not `w`/`h`, so a smoothly
  *animated* zoom isn't straightforward — a jump-cut is also how a lot of
  real short-form editing does it anyway).
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
