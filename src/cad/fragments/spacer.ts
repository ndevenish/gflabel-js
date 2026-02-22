/**
 * Spacer and expanding fragments.
 */

import { drawRectangle } from "replicad";
import type { RenderOptions } from "../options.js";
import { Fragment, registerFragment } from "./base.js";
import type { FragmentRenderResult } from "./base.js";

export class SpacerFragment extends Fragment {
  visible = false;

  constructor(public readonly distance: number) {
    super();
  }

  render(
    height: number,
    _maxWidth: number,
    _opts: RenderOptions,
  ): FragmentRenderResult {
    const drawing = drawRectangle(this.distance, height);
    return { drawing, width: this.distance, height };
  }
}

export class ExpandingFragment extends Fragment {
  variableWidth = true;
  priority = 0;
  visible = false;

  render(
    height: number,
    maxWidth: number,
    _opts: RenderOptions,
  ): FragmentRenderResult {
    const drawing = drawRectangle(maxWidth, height);
    return { drawing, width: maxWidth, height };
  }

  minWidth(_height: number): number {
    return 0;
  }
}

registerFragment(["..."], () => new ExpandingFragment());
