#!/bin/bash
# Generates both Python and JS outputs for a set of test cases,
# exports both to SVG (flat top-down projection), and diffs them.

CASES=(
  'pred "Basic Label"'
  'pred "{nut}M3"'
  'pred "{nut}M3qq"'
  'pred "{washer}{...}M4"'
  'pred "{bolt(20)}\nM2x20"'
  'pred "{head(hex)}{...}M3" --width 1'
  'pred "{nut}M3{|}a"'
  'plain "Hello" --width 40 --height 15'
  'pred "{variable_resistor}"'
  'pred "{threaded_insert}"'
  'pred "{sym(resistor)}"'
  'pred "{sym(capacitor,iec)}"'
  'pred "{head(triangle,security)}"'
)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PY_DIR="$(dirname "$PROJECT_DIR")/gflabel-py"

mkdir -p /tmp/gflabel-compare/{py,js}

FORMAT="${1:-svg}"

for case in "${CASES[@]}"; do
  slug=$(echo "$case" | tr ' {}()/' '_____' | tr -s '_')
  echo "=== $case ==="
  eval "cd \"$PY_DIR\" && uv run gflabel $case -o /tmp/gflabel-compare/py/${slug}.${FORMAT}" 2>&1
  eval "cd \"$PROJECT_DIR\" && npx tsx src/cli.ts $case -o /tmp/gflabel-compare/js/${slug}.${FORMAT}" 2>&1
done

echo "Outputs written to /tmp/gflabel-compare/ (format: ${FORMAT})"
