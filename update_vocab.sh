#!/bin/zsh

SRC="$HOME/Downloads/vocab.json"
DEST="$HOME/Documents/duocards-widget/output/vocab.json"
LOGFILE="$HOME/Documents/duocards-widget/export.log"

if [ ! -f "$SRC" ]; then
  echo "$(date): No vocab.json found in Downloads. Please export from DuoCards first." >> "$LOGFILE"
  exit 1
fi

mkdir -p "$(dirname "$DEST")"

if cp "$SRC" "$DEST"; then
  echo "$(date): Updated vocab.json successfully from Downloads" >> "$LOGFILE"
  echo "Updated vocab.json successfully."
else
  echo "$(date): Failed to copy vocab.json" >> "$LOGFILE"
  echo "Failed to copy vocab.json"
  exit 1
fi
