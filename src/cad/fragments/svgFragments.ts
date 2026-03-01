/**
 * SVG-based hardware fragments: parameterless shapes loaded from SVG files.
 *
 * Analogous to symbols.ts but for hardware fragments like {nut}, {washer}, etc.
 * Each SVG is parsed via svgToDrawing(), centered, and scaled to fit the
 * render height (or overheight if specified).
 */

import { type Drawing } from "replicad";
import type { RenderOptions } from "../options.js";
import { Fragment, registerFragment } from "./base.js";
import type { FragmentRenderResult } from "./base.js";
import { svgToDrawing } from "../svg.js";

// ── Fragment definitions ────────────────────────────────────────

interface SvgFragmentDef {
  /** Registration names (first is primary, rest are aliases). */
  names: string[];
  /** SVG filename without extension (matches src/assets/fragments/<file>.svg). */
  file: string;
  /** If set, fragment renders at this multiple of normal height. */
  overheight?: number;
}

const SVG_FRAGMENTS: SvgFragmentDef[] = [
  { names: ["hexnut", "nut"], file: "nut" },
  { names: ["squarenut", "square_nut"], file: "squarenut" },
  { names: ["washer"], file: "washer" },
  { names: ["lockwasher"], file: "lockwasher" },
  { names: ["circle"], file: "circle" },
  { names: ["magnet"], file: "magnet" },
  { names: ["threaded_insert"], file: "threaded_insert" },
  { names: ["tnut"], file: "tnut" },
  { names: ["nut_profile"], file: "nut_profile" },
  { names: ["locknut_profile"], file: "locknut_profile" },
  { names: ["variable_resistor"], file: "variable_resistor", overheight: 1.5 },
];

// ── Module state ────────────────────────────────────────────────

let _svgLoader: ((name: string) => string) | null = null;

/**
 * Initialize SVG-based hardware fragments.
 * Called from worker.ts or cli.ts during init.
 */
export function loadSvgFragments(
  svgLoader: (name: string) => string,
): void {
  _svgLoader = svgLoader;

  for (const def of SVG_FRAGMENTS) {
    const { file, overheight } = def;

    registerFragment(def.names, () => {
      if (!_svgLoader) {
        throw new Error("SVG fragments not loaded — call loadSvgFragments() first");
      }

      const svgData = _svgLoader(file);
      const baseDrawing = svgToDrawing(svgData);

      return new (class extends Fragment {
        override overheight = overheight ?? null;

        render(
          height: number,
          _maxWidth: number,
          _opts: RenderOptions,
        ): FragmentRenderResult {
          let drawing: Drawing = baseDrawing;
          const bb = drawing.boundingBox;
          drawing = drawing.translate([-bb.center[0], -bb.center[1]]);
          const targetH = overheight ? height * overheight : height;
          const scale = targetH / bb.height;
          drawing = drawing.scale(scale);

          return {
            drawing,
            width: drawing.boundingBox.width,
          };
        }
      })();
    });
  }
}
