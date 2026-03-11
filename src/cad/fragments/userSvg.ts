/**
 * SvgFragment: import a user-provided SVG file as a label fragment.
 *
 * Port of Python SvgFragment from fragments.py (commit e05af5d).
 * Supports per-path colors from SVG fill attributes, or mono mode via
 * RenderOptions.svgMono.
 *
 * Usage: {svg(file=/path/to/file.svg)}
 *        {svg(file=logo.svg, color=red, label=logo)}
 *        {svg(file=logo.svg, flip_y=false)}
 */

import type { RenderOptions } from "../options.js";
import { SvgMono } from "../options.js";
import type { ColoredDrawing } from "../options.js";
import { svgToDrawing, svgToColoredDrawings } from "../svg.js";
import { Fragment, registerFragment } from "./base.js";
import type { FragmentRenderResult } from "./base.js";

// ── File loader ──────────────────────────────────────────────────

let _fileLoader: ((path: string) => string) | null = null;

/**
 * Set the SVG file loader used by SvgFragment at render time.
 * In CLI, set this to (path) => readFileSync(path, "utf-8").
 * In the browser, leave unset (SvgFragment will throw if used).
 */
export function setSvgFileLoader(loader: (path: string) => string): void {
  _fileLoader = loader;
}

// ── Arg parsing ──────────────────────────────────────────────────

/** Parse "key=value" pairs from fragment args (e.g. ["file=/path", "color=red"]). */
function parseNamedArgs(
  paramOrder: string[],
  ...args: string[]
): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!.trim();
    const eq = arg.indexOf("=");
    if (eq >= 0) {
      const key = arg.slice(0, eq).trim();
      result[key] = arg.slice(eq + 1).trim();
    } else if (i < paramOrder.length) {
      // Positional fallback
      result[paramOrder[i]!] = arg;
    }
  }
  return result;
}

// ── Fragment class ───────────────────────────────────────────────

class SvgFragment extends Fragment {
  private file: string;
  private color: string | null;

  constructor(...args: string[]) {
    super();
    const parsed = parseNamedArgs(["file", "flip_y", "label", "color"], ...args);

    if (!parsed["file"]) {
      throw new Error(
        `{svg} fragment requires a file= argument, e.g. {svg(file=/path/to.svg)}`,
      );
    }
    this.file = parsed["file"];

    // flip_y: our SVG parser always converts Y-down → Y-up, matching the
    // Python default of flip_y=True. flip_y=false is accepted but ignored.
    const flipYStr = (parsed["flip_y"] ?? "true").toLowerCase();
    if (flipYStr !== "true" && flipYStr !== "false") {
      throw new Error(
        `{svg} flip_y must be "true" or "false", got "${parsed["flip_y"]}"`,
      );
    }

    // label: used in Python for STEP part naming; not applicable in replicad.
    this.color = parsed["color"] ?? null;
  }

  render(
    height: number,
    maxWidth: number,
    opts: RenderOptions,
  ): FragmentRenderResult {
    if (!height) throw new Error("Trying to render zero-height svg fragment");
    if (!_fileLoader) {
      throw new Error(
        "{svg} fragment requires a file loader — call setSvgFileLoader() first",
      );
    }

    const svgData = _fileLoader(this.file);

    // Mono import: treat the whole SVG as a single-color drawing.
    // The parent renderSingleLine will assign currentColor unless we
    // explicitly override via coloredDrawings.
    const isMono =
      opts.svgMono === SvgMono.IMPORT || opts.svgMono === SvgMono.BOTH;

    if (isMono || !svgData.includes("fill")) {
      // Single-color mode
      const drawing = svgToDrawing(svgData);
      const bb = drawing.boundingBox;
      const centered = drawing.translate([-bb.center[0], -bb.center[1]]);
      const yscale = height / bb.height;
      const xscale = maxWidth > 0 ? maxWidth / bb.width : yscale;
      const scale = Math.min(yscale, xscale);
      const scaled = centered.scale(scale);
      const scaledBb = scaled.boundingBox;

      if (this.color) {
        // Explicit color arg: emit as coloredDrawings so parent uses it
        return {
          drawing: scaled,
          width: scaledBb.width,
          coloredDrawings: [{ drawing: scaled, color: this.color }],
        };
      }
      // No explicit color: return drawing only, parent uses currentColor
      return { drawing: scaled, width: scaledBb.width };
    }

    // Multi-color mode: parse per-path fill colors from the SVG
    const defaultColor = this.color ?? opts.defaultColor;
    const pathDrawings = svgToColoredDrawings(svgData, defaultColor);

    if (pathDrawings.length === 0) {
      return { drawing: null, width: 0 };
    }

    // If fragment has an explicit color arg, override all path colors
    const coloredPaths: ColoredDrawing[] = this.color
      ? pathDrawings.map(({ drawing }) => ({ drawing, color: this.color! }))
      : pathDrawings;

    // Compute bounding box of all paths combined, then scale uniformly
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const { drawing } of coloredPaths) {
      const bb = drawing.boundingBox;
      minX = Math.min(minX, bb.center[0] - bb.width / 2);
      maxX = Math.max(maxX, bb.center[0] + bb.width / 2);
      minY = Math.min(minY, bb.center[1] - bb.height / 2);
      maxY = Math.max(maxY, bb.center[1] + bb.height / 2);
    }
    const totalW = maxX - minX;
    const totalH = maxY - minY;
    const cxAll = (minX + maxX) / 2;
    const cyAll = (minY + maxY) / 2;

    const yscale = height / totalH;
    const xscale = maxWidth > 0 ? maxWidth / totalW : yscale;
    const scale = Math.min(yscale, xscale);

    const scaledDrawings: ColoredDrawing[] = coloredPaths.map(
      ({ drawing, color }) => {
        const centered = drawing.translate([-cxAll, -cyAll]);
        return { drawing: centered.scale(scale), color };
      },
    );

    const scaledW = totalW * scale;
    return {
      drawing: null,
      width: scaledW,
      coloredDrawings: scaledDrawings,
    };
  }
}

// ── Registration ─────────────────────────────────────────────────

registerFragment(["svg"], (...args: string[]) => new SvgFragment(...args));
