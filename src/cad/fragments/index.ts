/**
 * Fragment system entry point.
 *
 * Imports all fragment modules to trigger their registerFragment() calls,
 * then re-exports the registry and parser.
 */

import { Fragment, ModifierFragment, FRAGMENT_REGISTRY } from "./base.js";
import { TextFragment, WhitespaceFragment } from "./text.js";
import { SpacerFragment } from "./spacer.js";
import {
  SplitterFragment,
  ColorFragment,
  ScaleFragment,
  OffsetFragment,
  SPLIT_RE,
} from "./layout.js";

// Side-effect imports: registers all fragment types
import "./spacer.js";
import "./hardware.js";
import "./layout.js";
import "./symbols.js";
import "./userSvg.js";

// ── Spec parsing regex ──────────────────────────────────────────

/** Matches {content} but not {{content}} */
const RE_FRAGMENT = /((?<!{){[^{}]+})/;

/** Parses "name(args)" from a fragment spec */
const RE_FRAGMENT_NAME = /(.+?)(?:\((.*)\))?$/;

/**
 * Parse a fragment spec (the content inside {}) into a Fragment instance.
 */
export function fragmentFromSpec(spec: string): Fragment {
  // If the spec is just a number, it's a spacer distance
  const numVal = parseFloat(spec);
  if (!isNaN(numVal) && String(numVal) === spec.trim()) {
    return new SpacerFragment(numVal);
  }

  const match = RE_FRAGMENT_NAME.exec(spec);
  if (!match) throw new Error(`Invalid fragment spec: ${spec}`);

  const name = match[1]!;
  const rawArgs = match[2];
  const args = rawArgs ? rawArgs.split(",").map((x) => x.trim()) : [];

  const factory = FRAGMENT_REGISTRY.get(name);
  if (!factory) {
    throw new Error(`Unknown fragment: ${name}`);
  }
  return factory(...args);
}

/**
 * Convert a single line spec string to a list of renderable fragments.
 * Port of label.py _spec_to_fragments().
 */
export function specToFragments(spec: string): Fragment[] {
  const fragments: Fragment[] = [];
  const parts = spec.split(RE_FRAGMENT);

  for (const part of parts) {
    if (!part) continue;

    if (
      part.startsWith("{") &&
      !part.startsWith("{{") &&
      part.endsWith("}")
    ) {
      // Special fragment
      fragments.push(fragmentFromSpec(part.slice(1, -1)));
    } else {
      // Text, possibly with leading/trailing spaces
      let text = part.replace(/\{\{/g, "{").replace(/\}\}/g, "}");

      const leftSpaces = text.slice(0, text.length - text.trimStart().length);
      if (leftSpaces) {
        fragments.push(new WhitespaceFragment(leftSpaces));
      }
      text = text.trimStart();

      const stripped = text.trim();
      if (stripped) {
        fragments.push(new TextFragment(stripped));
      }

      const trailingLen = text.length - stripped.length;
      if (trailingLen > 0) {
        fragments.push(new WhitespaceFragment(text.slice(-trailingLen)));
      }
    }
  }

  return fragments;
}

export { setSvgFileLoader } from "./userSvg.js";

export {
  Fragment,
  ModifierFragment,
  FRAGMENT_REGISTRY,
  TextFragment,
  WhitespaceFragment,
  SpacerFragment,
  SplitterFragment,
  ColorFragment,
  ScaleFragment,
  OffsetFragment,
  SPLIT_RE,
};
export type { FragmentRenderResult } from "./base.js";
