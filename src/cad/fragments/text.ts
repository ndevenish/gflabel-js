/**
 * Text and whitespace fragments.
 */

import type { RenderOptions } from "../options.js";
import { getAllowedHeight } from "../options.js";
import {
  measureWhitespace,
  glyphsToDrawing,
} from "../font.js";
import { Fragment } from "./base.js";
import type { FragmentRenderResult } from "./base.js";

export class TextFragment extends Fragment {
  constructor(public readonly text: string) {
    super();
  }

  render(
    height: number,
    _maxWidth: number,
    opts: RenderOptions,
  ): FragmentRenderResult {
    if (!height) throw new Error("Trying to render zero-height text fragment");
    const fontSize = getAllowedHeight(opts.font, height);
    const drawing = glyphsToDrawing(this.text, fontSize);
    const bb = drawing.boundingBox;
    return { drawing, width: bb.width };
  }
}

export class WhitespaceFragment extends Fragment {
  visible = false;

  constructor(public readonly whitespace: string) {
    super();
  }

  render(
    height: number,
    _maxWidth: number,
    opts: RenderOptions,
  ): FragmentRenderResult {
    const fontSize = getAllowedHeight(opts.font, height);
    const w = measureWhitespace(this.whitespace, fontSize);
    return { drawing: null, width: w };
  }
}
