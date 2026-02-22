/**
 * Spacer and expanding fragments.
 */

import type { RenderOptions } from "../options.js";
import { Fragment, registerFragment } from "./base.js";
import type { FragmentRenderResult } from "./base.js";

export class SpacerFragment extends Fragment {
  visible = false;

  constructor(public readonly distance: number) {
    super();
  }

  render(
    _height: number,
    _maxWidth: number,
    _opts: RenderOptions,
  ): FragmentRenderResult {
    return { drawing: null, width: this.distance };
  }
}

export class ExpandingFragment extends Fragment {
  variableWidth = true;
  priority = 0;
  visible = false;

  render(
    _height: number,
    maxWidth: number,
    _opts: RenderOptions,
  ): FragmentRenderResult {
    return { drawing: null, width: maxWidth };
  }

  minWidth(_height: number): number {
    return 0;
  }
}

registerFragment(["..."], () => new ExpandingFragment());
