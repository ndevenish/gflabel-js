#!/bin/bash
# Generates both Python and JS outputs for a set of test cases,
# exports both to SVG (flat top-down projection), and diffs them.

CASES=(
  'pred "Basic Label"'
  'pred "{nut}M3"'
  'pred "{washer}{...}M4"'
  'pred "{bolt(20)}\nM2x20"'
  'pred "{head(hex)}{...}M3" --width 1'
  'plain "Hello" --width 40 --height 15'
)

mkdir -p /tmp/gflabel-compare/{py,js}

for case in "${CASES[@]}"; do
  slug=$(echo "$case" | tr ' {}()/' '_____' | tr -s '_')
  eval "uv run gflabel $case -o /tmp/gflabel-compare/py/${slug}.svg"
  eval "node dist/cli.js $case -o /tmp/gflabel-compare/js/${slug}.svg"
done

echo "Outputs written. Open /tmp/gflabel-compare/ to compare."
