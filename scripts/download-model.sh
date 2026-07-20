#!/usr/bin/env bash
# Downloads the whisper.cpp ggml model used for local, free transcription.
# No API key required. ~140MB one-time download.
set -euo pipefail

MODEL="${1:-base.en}"
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
