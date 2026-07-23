# Clip Me

Turn a long YouTube video into a handful of short (30–60s), vertical clips.
Transcription auto-detects the spoken language (English, Indonesian, and
anything else the whisper.cpp model supports).

Paste a YouTube URL and the app will:

1. Download the video locally (`yt-dlp`)
2. Transcribe it locally, word-by-word (`whisper.cpp` — free, no API key)
3. Suggest a few 30–60s candidate clips using a free audio heuristic
   (silence + loudness analysis — no LLM)
4. Let you preview and trim each suggestion on a timeline
5. Export a vertical (9:16) MP4 with a brief punch-zoom + whoosh sound
   effect on loud/emphasis moments

Everything runs locally. No paid API keys are required for this MVP.

**Captions are not burned into the export.** Free local transcription isn't
reliable enough on real-world audio (background music, multiple speakers)
to trust as final, on-screen text — see
[Improving transcription accuracy](#improving-transcription-accuracy) if you
want to try anyway, or [Captions (currently disabled)](#captions-currently-disabled)
for how to re-enable burning them in.

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
| `WHISPER_LANGUAGE` | Defaults to `auto` (detect per video). Set to a language code (e.g. `id`, `en`) to skip detection — see [Improving transcription accuracy](#improving-transcription-accuracy) |

## Improving transcription accuracy

If captions come out wrong (words, not just timing), try these in order:

1. **Force the language instead of `auto`.** Auto-detect only looks at the
   first ~30s of audio and uses that guess for the whole file — a
   music/non-speech intro, or a video that briefly opens in a different
   language, can lock in the wrong language for everything after it. If most
   of your videos are a known language, set `WHISPER_LANGUAGE` (e.g. `id`
   for Indonesian) in `.env` and skip this failure mode entirely.
2. **Upgrade the model** if `base` isn't accurate enough, especially for
   non-English audio (smaller Whisper models are noticeably weaker on
   lower-resource languages than on English):
   ```bash
   ./scripts/download-model.sh small   # ~470MB, meaningfully better accuracy
   ```
   then set `WHISPER_MODEL_PATH=./models/ggml-small.bin` in `.env`. `medium`
   (~1.5GB) is better still if your machine can handle the extra transcription
   time.
3. **Background music/noise and overlapping speakers** degrade any Whisper
   model's accuracy — this is a fundamental limitation of the approach, not
   something size or language settings fix. The audio fed to whisper.cpp is
   automatically run through a light denoise filter first (`src/lib/
   transcription.ts`), which helps somewhat with broadband noise, but won't
   remove music that overlaps the speech frequency range.

Any of these require re-transcribing — resubmit the video's URL to get a
fresh transcript.

## Captions (currently disabled)

Burned-in captions were tried and turned off by default — free local
transcription (see above) wasn't reliable enough on real-world audio to
trust as permanent on-screen text, and manually correcting a wrong caption
that's already baked into the video is worse than just adding captions
yourself in an editor afterward.

The caption pipeline itself is still in the codebase, just unwired from
export (`src/lib/subtitles.ts`, `src/lib/jobs/runners/exportClip.ts`):

- Whisper's word-level timestamps are grouped into short 1-2 word phrases
  and rendered as a native `.ass` file (not `.srt` — styling like font/size/
  position needs to be baked into the file itself, with an explicit
  `PlayResX`/`PlayResY` matching the real output frame, or ffmpeg's
  automatic SRT→ASS conversion inflates the font size unpredictably).
- Timing uses whisper.cpp's DTW-aligned timestamps rather than its default
  (laggier) cross-attention estimation, plus export-time polish
  (`polishCaptionTiming`): each phrase appears ~180ms before its word is
  spoken, phrases hold on screen until the next one starts when the gap is
  under 1s, and short words get a minimum display duration.

To re-enable: in `runExportClip` (`src/lib/jobs/runners/exportClip.ts`),
replace the `assPath = null` line with the caption-building block (build
the phrases from `sourceVideo.transcript` via `groupIntoCaptionPhrases`,
write the result of `buildAss` to `exportedClipCaptionsPath`, pass that path
as `assPath`) — everything downstream in `exportVerticalClip` already
supports it.

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
- **Transcription** uses whisper.cpp's DTW-aligned timestamps
  (`src/lib/transcription.ts`) rather than its default cross-attention
  estimation, which has a known systematic lag, plus a denoise pass to help
  with background music/noise — see
  [Improving transcription accuracy](#improving-transcription-accuracy). The
  transcript isn't burned into the export (see
  [Captions](#captions-currently-disabled)) but is still used for clip
  titles and for weighting suggestions toward windows that contain actual
  speech, not just loud music.
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
