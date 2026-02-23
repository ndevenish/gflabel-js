# gflabel-js

A slopcoded TypeScript/WebAssembly port of [gflabel](https://github.com/ndevenish/gflabel) for
generating 3D-printable Gridfinity labels. Runs as a web app or Node CLI.

Built with [replicad](https://replicad.xyz/) (OpenCascade WASM), [opentype.js](https://opentype.js.org/), React, and Three.js.

## Web App

```bash
npm install
npm run dev
```

Open the dev server URL, configure your label, and click Render. Export as STL, STEP, or SVG.

## CLI

```bash
npx tsx src/cli.ts <base> <labels...> [options]
```

### Examples

```bash
# Pred-style label with hex nut icon and "M3" text
npx tsx src/cli.ts pred "{nut}M3" -o label.stl

# Two-column label
npx tsx src/cli.ts pred "{nut}M3{|}Hex Nut" -o label.step

# Multi-line with bolt icon
npx tsx src/cli.ts pred '{bolt(20)}\nM2x20' -o label.stl

# Debossed plain label
npx tsx src/cli.ts plain "Hello" --width 40 --height 15 --style debossed -o label.stl

# SVG export (2D label drawing)
npx tsx src/cli.ts pred "{washer}{...}M4" -o label.svg
```

### Options

| Option | Default | Description |
|---|---|---|
| `-o, --output <file>` | `label.step` | Output file (.stl, .step, .stp, .svg) |
| `-w, --width <n>` | `1` | Width in gridfinity units (pred) or mm (plain) |
| `--height <mm>` | `11.5` | Height in mm |
| `--style <style>` | `embossed` | `embossed`, `debossed`, or `embedded` |
| `--depth <mm>` | `0.4` | Extrusion depth |
| `-d, --divisions <n>` | `1` | Number of label divisions |
| `--margin <mm>` | `0.4` | Margin around label content |
| `--column-gap <mm>` | `0.4` | Gap between columns |

## Label Spec Syntax

Text is rendered directly. Fragments are enclosed in `{braces}`:

### Hardware Fragments

| Fragment | Description |
|---|---|
| `{nut}` / `{hexnut}` | Hex nut icon |
| `{washer}` | Flat washer |
| `{lockwasher}` | Lock washer |
| `{bolt(length)}` | Bolt with specified length |
| `{head(shape)}` | Bolt head (hex, phillips, slot, torx) |
| `{hexhead}` | Hex bolt head |
| `{circle}` | Circle |
| `{tnut}` | T-nut |
| `{nut_profile}` | Nut side profile |
| `{locknut_profile}` | Locknut side profile |
| `{box(w,h)}` | Rectangular box |
| `{magnet}` | Magnet icon |
| `{threaded_insert}` | Threaded insert |
| `{webbolt}` / `{cullbolt}` | Cullenect-style bolt |

### Layout Fragments

| Fragment | Description |
|---|---|
| `{...}` | Expanding spacer (fills available width) |
| `{\|}` | Column divider (equal split) |
| `{2\|1}` | Column divider with proportions |
| `{<}` | Left-align column |
| `{>}` | Right-align column |
| `{measure}` | Dimension/measurement indicator |

### Multi-line

Use `\n` in the label spec for multiple lines:

```bash
npx tsx src/cli.ts pred '{bolt(20)}\nM2x20'
```

## Label Styles

- **Embossed** — Text raised above the label surface
- **Debossed** — Text cut into the label surface
- **Embedded** — Text flush with surface as a separate body (for multi-color 3D printing)

## Base Types

- **pred** — Gridfinity Pred-style label with mounting holes and L-shaped edge profile
- **plain** — Simple rectangular label

## Building

```bash
npm run build        # Type-check + production build
npm run build:cli    # Build CLI as standalone ESM
```

## Comparison Testing

If you have the Python gflabel installed alongside:

```bash
bash scripts/compare.sh svg   # Compare SVG output
bash scripts/compare.sh stl   # Compare STL output
```

Outputs go to `/tmp/gflabel-compare/{py,js}/`.
