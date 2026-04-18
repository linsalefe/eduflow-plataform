#!/bin/bash

MEDIA_DIR="/home/ubuntu/eduflow/backend/media"
THUMBS_DIR="$MEDIA_DIR/thumbs"

mkdir -p "$THUMBS_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "Iniciando limpeza de videos..."

find "$MEDIA_DIR" -maxdepth 1 -name "*.mp4" -type f -mmin +1440 | while read -r VIDEO; do
    FILENAME=$(basename "$VIDEO" .mp4)
    THUMB="$THUMBS_DIR/${FILENAME}.jpg"

    log "Gerando thumbnail: $THUMB"
    if ffmpeg -i "$VIDEO" -ss 00:00:01 -vframes 1 -vf "scale=320:-1" -q:v 5 "$THUMB" -y < /dev/null 2>/dev/null; then
        log "Thumbnail gerado (ss=1s): $THUMB"
    elif ffmpeg -i "$VIDEO" -ss 00:00:00 -vframes 1 -vf "scale=320:-1" -q:v 5 "$THUMB" -y < /dev/null 2>/dev/null; then
        log "Thumbnail gerado (ss=0s): $THUMB"
    else
        log "Video corrompido removido: $VIDEO"
    fi

    rm "$VIDEO"
    log "Video removido: $VIDEO"
done

log "Limpeza finalizada."
