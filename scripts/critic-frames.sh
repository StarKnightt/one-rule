#!/usr/bin/env bash
# Pull one frame from the middle of each form's hold (plus each morph) out of
# the finished video, for side-by-side comparison with reference material.
set -euo pipefail
in=${1:-output/one-rule.mp4}
out=${2:-build/critic}
mkdir -p "$out"
for pair in tree:6.0 fern:11.5 lightning:17.9 delta:24.6 lungs:31.5 forest:42.8 \
            m-tree-fern:8.0 m-fern-lightning:14.6 m-lightning-delta:21.2 m-delta-lungs:28.0 m-lungs-forest:35.3; do
  name=${pair%%:*}; t=${pair##*:}
  ffmpeg -loglevel error -y -ss "$t" -i "$in" -frames:v 1 "$out/$name.png"
done
ls "$out"
