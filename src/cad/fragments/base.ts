/**
 * Fragment base class and registry — port of the Fragment system from fragments.py.
 */

import type { Drawing } from "replicad";
import type { RenderOptions } from "../options.js";

export interface FragmentRenderResult {
  drawing: Drawing;
  width: number;
  height: number;
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
