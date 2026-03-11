/**
 * Layout fragments: splitter, alignment, measure/dimension.
 */

import { drawRectangle } from "replicad";
import type { RenderOptions } from "../options.js";
import { glyphsToDrawing } from "../font.js";
import { Fragment, ModifierFragment, registerFragment } from "./base.js";
import type { FragmentRenderResult } from "./base.js";

// ── Splitter Fragment ──────────────────────────────────────────

/** Regex to split a spec string on column dividers like {|} or {2|1} */
const _SIIF = String.raw`(\d*(?:\d[.]|[.]\d)?\d*)`;
export const SPLIT_RE = new RegExp(
  String.raw`\{${_SIIF}\|${_SIIF}\}`,
);

export class SplitterFragment extends Fragment {
  left: number;
  right: number;

  constructor(left?: string | null, right?: string | null) {
    super();
    this.left = parseFloat(left || "1");
    this.right = parseFloat(right || "1");
  }

  render(): FragmentRenderResult {
    throw new Error("Splitters should never be rendered");
  }
}

registerFragment(["|"], (left?: string, right?: string) => {
  return new SplitterFragment(left, right);
});

// ── Alignment Fragment ──────────────────────────────────────────

registerFragment(["<", ">"], () => {
  throw new Error(
    "Got Alignment fragment ({<} or {>}) not at the start of a label; " +
      "for selective alignment please pad with {...}, or specify alignment in column division.",
  );
});

// ── Measure/Dimension Fragment ──────────────────────────────────

registerFragment(["measure"], () => {
  return new (class extends Fragment {
    variableWidth = true;

    minWidth(_height: number): number {
      return 1;
    }

    render(
      height: number,
      maxWidth: number,
      _opts: RenderOptions,
    ): FragmentRenderResult {
      const lw = 0.4;

      // Left endcap
      const leftCap = drawRectangle(lw, height / 4).translate([
        -maxWidth / 2 + lw / 2,
        0,
      ]);
      // Right endcap
      const rightCap = drawRectangle(lw, height / 4).translate([
        maxWidth / 2 - lw / 2,
        0,
      ]);
      // Center line
      const centerLine = drawRectangle(maxWidth - lw * 2, lw);

      let drawing = leftCap.fuse(rightCap).fuse(centerLine);

      // Add measurement text below
      const text = glyphsToDrawing(`${maxWidth.toFixed(1)}`, height / 2);
      const textShifted = text.translate([0, -(height / 4)]);
      drawing = drawing.fuse(textShifted);

      const bb = drawing.boundingBox;
      return { drawing, width: bb.width };
    }
  })();
});

// ── Color Fragment ──────────────────────────────────────────────

/** Changes the color for all subsequent fragments on the same line. */
export class ColorFragment extends ModifierFragment {
  constructor(public readonly color: string) {
    super();
  }
}

registerFragment(["color"], (name?: string) => {
  return new ColorFragment(name ?? "blue");
});
