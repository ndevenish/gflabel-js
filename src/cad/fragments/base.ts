/**
 * Fragment base class and registry — port of the Fragment system from fragments.py.
 */

import type { Drawing } from "replicad";
import type { RenderOptions, ColoredDrawing } from "../options.js";

export interface FragmentRenderResult {
  /** The rendered drawing, or null for invisible fragments (spacers). */
  drawing: Drawing | null;
  width: number;
  /**
   * Optional: per-color drawings (e.g. from a multi-color SVG import).
   * When present, overrides drawing + currentColor in the label assembler.
   */
  coloredDrawings?: ColoredDrawing[];
}

export abstract class Fragment {
  variableWidth = false;
  priority = 1;
  visible = true;
  overheight: number | null = null;

  abstract render(
    height: number,
    maxWidth: number,
    opts: RenderOptions,
  ): FragmentRenderResult;

  minWidth(_height: number): number {
    return 0;
  }
}

/**
 * Non-visual modifier fragment (e.g. ColorFragment).
 * Has zero width, no drawing, and does not appear in the output geometry.
 */
export abstract class ModifierFragment extends Fragment {
  visible = false;

  render(): FragmentRenderResult {
    return { drawing: null, width: 0 };
  }
}

/**
 * Registry mapping fragment name → factory function.
 */
export const FRAGMENT_REGISTRY = new Map<
  string,
  (...args: string[]) => Fragment
>();

export function registerFragment(
  names: string[],
  factory: (...args: string[]) => Fragment,
): void {
  for (const name of names) {
    FRAGMENT_REGISTRY.set(name, factory);
  }
}
