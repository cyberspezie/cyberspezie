#!/bin/sh
# Web video for a work: no audio, H.264 (plays everywhere, iPhone included), max 30 fps,
# two widths (portrait 720 / 1080, landscape 1280 / 1920; the site picks by shown width ×
# pixel ratio), +faststart.
# The first frame is saved as <name>-poster.png in the current folder: copy it into the media
# dir as image<N>.png and build it with build-images.js — it is the scrambled poster shown
# while the video loads.
# Usage: sh build-video.sh <input video> <output videos dir> <name, e.g. shadow-05> [audio]
# With a 4th argument "audio" the sound is kept (AAC 128k): only for videos marked `sound: true`
# in ARTWORK_VIDEOS (they get a sound on / off button); all the others stay silent.
# Prints the sizes JSON for ARTWORK_VIDEOS in index.html. Needs ffmpeg (brew install ffmpeg).
# Encodes in a temporary folder first (writing straight into OneDrive can time out).
set -e
IN="$1"; OUT="$2"; NAME="$3"
AUDIO="-an"; [ "$4" = "audio" ] && AUDIO="-c:a aac -b:a 128k"
TMP=$(mktemp -d)
mkdir -p "$OUT"
SRC=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$IN" | grep , | head -1)
# landscape frames are ~1.8× the pixels of portrait ones: a slightly higher CRF keeps the files light
if [ "${SRC%,*}" -gt "${SRC#*,}" ]; then WIDTHS="1280 1920"; BASE=26; else WIDTHS="720 1080"; BASE=23; fi
SMALL=${WIDTHS%% *}
for W in $WIDTHS; do
  CRF=$BASE; [ "$W" = "$SMALL" ] && CRF=$((BASE + 1))
  ffmpeg -hide_banner -loglevel error -y -i "$IN" -map 0:v:0 -map 0:a:0? $AUDIO -fpsmax 30 \
    -vf "scale='min($W,iw)':-2:flags=lanczos,format=yuv420p" \
    -c:v libx264 -preset slow -crf $CRF -profile:v high -movflags +faststart -tag:v avc1 "$TMP/$NAME-$W.mp4"
done
ffmpeg -hide_banner -loglevel error -y -i "$IN" -frames:v 1 "./$NAME-poster.png"
printf '['
SEP=''
for W in $WIDTHS; do
  F="$TMP/$NAME-$W.mp4"
  DIM=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$F" | grep , | head -1)
  V=$(md5 -q "$F" | cut -c1-8)
  printf '%s{"src": "videos/%s-%s.mp4", "w": %s, "h": %s, "v": "%s"}' "$SEP" "$NAME" "$W" "${DIM%,*}" "${DIM#*,}" "$V"
  SEP=', '
  cp "$F" "$OUT/"
done
printf ']\n'
rm -rf "$TMP"
