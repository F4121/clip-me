#!/usr/bin/env bash
# Downloads the whisper.cpp ggml model used for local, free transcription.
# No API key required. ~140MB one-time download.
#
# Defaults to the multilingual "base" model (not "base.en") so languages
# other than English — e.g. Indonesian — can be transcribed. Pass "small"
# or "medium" instead for meaningfully better non-English accuracy, at the
# cost of a larger download and slower transcription:
#   ./scripts/download-model.sh small
set -euo pipefail

MODEL="${1:-base}"
DEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/models"
DEST_FILE="$DEST_DIR/ggml-$MODEL.bin"
URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-$MODEL.bin"

mkdir -p "$DEST_DIR"

if [ -f "$DEST_FILE" ]; then
  echo "Model already present at $DEST_FILE"
  exit 0
fi

echo "Downloading $MODEL model to $DEST_FILE ..."
curl -L --fail -o "$DEST_FILE" "$URL"
echo "Done. Set WHISPER_MODEL_PATH=$DEST_FILE in .env if it differs from the default."
