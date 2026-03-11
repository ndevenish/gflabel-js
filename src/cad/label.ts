/**
 * Label rendering engine — port of label.py.
 *
 * LabelRenderer takes a spec string and available area, and produces
 * a list of ColoredDrawing entries representing the complete label content.
 */

import { Drawing, drawRectangle } from "replicad";
import type { RenderOptions, ColoredDrawing } from "./options.js";
import {
  specToFragments,
  Fragment,
  ColorFragment,
  ScaleFragment,
  OffsetFragment,
  SPLIT_RE,
  type FragmentRenderResult,
} from "./fragments/index.js";

export type { ColoredDrawing } from "./options.js";

/** Utility: split an iterable into chunks of n */
function batched<T>(arr: T[], n: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += n) {
    result.push(arr.slice(i, i + n));
  }
  return result;
}

export interface Vec2 {
  x: number;
  y: number;
}

export class LabelRenderer {
  constructor(public readonly opts: RenderOptions) {}

  /**
   * Render a complete label spec (potentially multi-column) within the given area.
   */
  render(spec: string, area: Vec2): ColoredDrawing[] {
    // Column splitting via SplitterFragment.SPLIT_RE
    const columns: string[] = [];
    const columnProportions: number[] = [];

    // Split on column dividers
    const splitParts = spec.split(SPLIT_RE);
    // splitParts alternates: text, leftProp, rightProp, text, leftProp, rightProp, ...
    // Each group is (text, left?, right?)
    const groupSize = 1 + (SPLIT_RE.source.match(/\((?!\?)/g)?.length ?? 0);
    const groups = batched(splitParts, groupSize);

    for (let gi = 0; gi < groups.length; gi++) {
      const group = groups[gi]!;
      let label = group[0] ?? "";
      const leftStr = group[1];
      const rightStr = group[2];

      // Handle alignment at start of label
      let alignment: string | null = null;
      if (label.startsWith("{<}")) {
        label = label.slice(3);
        alignment = "<";
      } else if (label.startsWith("{>}")) {
        label = label.slice(3);
        alignment = ">";
      }

      // Process divider proportions
      if (leftStr !== undefined || rightStr !== undefined) {
        const left = parseFloat(leftStr || "1");
        const right = parseFloat(rightStr || "1");
        if (columnProportions.length === 0) {
          columnProportions.push(left, right);
        } else {
          const prev = columnProportions[columnProportions.length - 1]!;
          columnProportions.push((right / left) * prev);
        }
      }

      // If alignment specified, add expanding fragments to every line
      if (alignment) {
        const parts = label.split("\n");
        if (label.endsWith("\n")) parts.push("");
        const newParts = parts.map((part) => {
          if (!part || part.includes("{...}") || part.includes("{measure}")) {
            return part;
          }
          return alignment === "<" ? `${part}{...}` : `{...}${part}`;
        });
        label = newParts.join("\n");
      }

      columns.push(label);
    }

    if (columnProportions.length === 0) {
      columnProportions.push(1);
    }

    // Calculate column widths
    const totalProportions = columnProportions.reduce((a, b) => a + b, 0);
    const columnGapsWidth = this.opts.columnGap * (columns.length - 1);
    const columnWidths = columnProportions.map(
      (p) => (p * (area.x - columnGapsWidth)) / totalProportions,
    );

    // Render each column and position it
    const result: ColoredDrawing[] = [];
    let x = -area.x / 2;

    for (let i = 0; i < columns.length; i++) {
      const colSpec = columns[i]!;
      const width = columnWidths[i]!;

      if (colSpec.trim()) {
        const colDrawings = this.doMultilineRender(colSpec, {
          x: width,
          y: area.y,
        });
        // Translate column center to (x + width/2, 0)
        const offsetX = x + width / 2;
        for (const { drawing, color } of colDrawings) {
          result.push({ drawing: drawing.translate([offsetX, 0]), color });
        }
      }

      x += width + this.opts.columnGap;
    }

    return result;
  }

  /**
   * Multi-line rendering with automatic rescaling.
   */
  private doMultilineRender(
    spec: string,
    area: Vec2,
    isRescaling: boolean = false,
  ): ColoredDrawing[] {
    const lines = spec.split("\n");
    if (spec.endsWith("\n")) lines.push("");

    if (lines.length === 0) throw new Error("Asked to render empty label");

    const rowHeight =
      (area.y - this.opts.lineSpacingMm * (lines.length - 1)) / lines.length;

    // Render each line
    const result: ColoredDrawing[] = [];

    for (let n = 0; n < lines.length; n++) {
      const line = lines[n]!;
      if (!line) continue;

      const renderY =
        area.y / 2 -
        (rowHeight + this.opts.lineSpacingMm) * n -
        rowHeight / 2;

      const lineDrawings = this.renderSingleLine(line, {
        x: area.x,
        y: rowHeight,
      }, this.opts.allowOverheight);

      for (const { drawing, color } of lineDrawings) {
        result.push({ drawing: drawing.translate([0, renderY]), color });
      }
    }

    if (result.length === 0) return [];

    // Check if rescaling is needed — fuse all temporarily for BB measurement
    if (!isRescaling) {
      let fusedForBb: Drawing | null = null;
      for (const { drawing } of result) {
        fusedForBb = fusedForBb ? fusedForBb.fuse(drawing) : drawing;
      }
      if (fusedForBb) {
        const bb = fusedForBb.boundingBox;
        const scaleToMaxWidth = area.x / bb.width;
        const scaleToMaxHeight = area.y / bb.height;
        const toScale = Math.min(scaleToMaxHeight, scaleToMaxWidth, 1);

        if (toScale < 0.99) {
          const heightToScale = Math.min(area.y, bb.height);
          return this.doMultilineRender(
            spec,
            { x: area.x, y: heightToScale * toScale * 0.95 },
            true,
          );
        }
      }
    }

    return result;
  }

  /**
   * Render a single line of fragments horizontally.
   * Returns one ColoredDrawing per visible fragment, each pre-translated into position.
   */
  private renderSingleLine(
    line: string,
    area: Vec2,
    allowOverheight: boolean,
  ): ColoredDrawing[] {
    const frags = specToFragments(line);

    // Overheight handling
    let yAvailable = area.y;
    if (allowOverheight) {
      const maxOverheight = Math.max(
        ...frags.map((f) => f.overheight ?? 1),
      );
      if (maxOverheight > 1) {
        yAvailable /= maxOverheight;
      }
    }

    // Render fixed-width fragments first
    const rendered = new Map<Fragment, FragmentRenderResult>();
    for (const frag of frags) {
      if (frag.variableWidth) continue;
      const fragAvailY = yAvailable / (allowOverheight ? 1 : (frag.overheight ?? 1));
      rendered.set(frag, frag.render(fragAvailY, area.x, this.opts));
    }

    // Calculate remaining width for variable fragments
    let remainingArea =
      area.x -
      [...rendered.values()].reduce((sum, r) => sum + r.width, 0);
    let countVariable = frags.length - rendered.size;

    // Render variable-width fragments (highest priority first)
    const variableFrags = frags
      .filter((f) => f.variableWidth)
      .sort((a, b) => b.priority - a.priority);

    for (const frag of variableFrags) {
      const fragAvailY = yAvailable / (allowOverheight ? 1 : (frag.overheight ?? 1));
      const allocatedWidth = Math.max(
        remainingArea / countVariable,
        frag.minWidth(area.y),
      );
      const renderResult = frag.render(fragAvailY, allocatedWidth, this.opts);
      rendered.set(frag, renderResult);
      countVariable--;
      remainingArea -= renderResult.width;
    }

    // Calculate total width
    const totalWidth = [...rendered.values()].reduce(
      (sum, r) => sum + r.width,
      0,
    );

    // Assemble: position fragments left-to-right, track color/scale/offset per fragment
    const coloredDrawings: ColoredDrawing[] = [];
    let currentColor = this.opts.defaultColor;
    let currentXScale = 1;
    let currentYScale = 1;
    let currentZScale = 1;
    let currentXOffset = 0;
    let currentYOffset = 0;
    let currentZOffset = 0;
    let x = -totalWidth / 2;

    for (const frag of frags) {
      // Update modifier state
      if (frag instanceof ColorFragment) {
        currentColor = frag.color;
      } else if (frag instanceof ScaleFragment) {
        currentXScale = frag.x;
        currentYScale = frag.y;
        currentZScale = frag.z;
      } else if (frag instanceof OffsetFragment) {
        currentXOffset = frag.x;
        currentYOffset = frag.y;
        currentZOffset = frag.z;
      }

      const fragResult = rendered.get(frag);
      if (!fragResult) continue;
      const fragWidth = fragResult.width;

      if (frag.visible) {
        if (fragResult.coloredDrawings && fragResult.coloredDrawings.length > 0) {
          for (const { drawing, color } of fragResult.coloredDrawings) {
            coloredDrawings.push({
              drawing: drawing.translate([x + fragWidth / 2, 0]),
              color,
            });
          }
        } else if (fragResult.drawing) {
          // Apply x/y scale before translating to fragment position
          let drawing = fragResult.drawing;
          if (currentXScale !== 1)
            drawing = drawing.stretch(currentXScale, [1, 0], [0, 0]);
          if (currentYScale !== 1)
            drawing = drawing.stretch(currentYScale, [0, 1], [0, 0]);
          // Translate to position, including x/y offset
          const posX = x + fragWidth / 2 + currentXOffset;
          const posY = currentYOffset;
          coloredDrawings.push({
            drawing: drawing.translate([posX, posY]),
            color: currentColor,
            ...(currentZScale !== 1 ? { zScale: currentZScale } : {}),
            ...(currentZOffset !== 0 ? { zOffset: currentZOffset } : {}),
          });
        }
      }
      x += fragWidth;
    }

    return coloredDrawings;
  }
}

/**
 * Render multiple labels fitted into a single area with divisions.
 */
export function renderDividedLabel(
  labels: string[],
  area: Vec2,
  divisions: number,
  options: RenderOptions,
): ColoredDrawing[] {
  const adjustedArea: Vec2 = {
    x: area.x - options.marginMm * 2,
    y: area.y - options.marginMm * 2,
  };
  const areaPerLabel: Vec2 = {
    x: adjustedArea.x / divisions,
    y: adjustedArea.y,
  };
  const leftmostX = -adjustedArea.x / 2 + areaPerLabel.x / 2;
  const renderer = new LabelRenderer(options);

  const result: ColoredDrawing[] = [];

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i]!;
    if (!label.trim()) continue;

    const labelDrawings = renderer.render(label, areaPerLabel);
    const offsetX = leftmostX + i * areaPerLabel.x;
    for (const { drawing, color } of labelDrawings) {
      result.push({ drawing: drawing.translate([offsetX, 0]), color });
    }
  }

  return result;
}

/**
 * Fuse all drawings in a ColoredDrawing[] into a single Drawing (ignoring color).
 * Returns null if the array is empty.
 */
export function fuseColoredDrawings(drawings: ColoredDrawing[]): Drawing | null {
  let result: Drawing | null = null;
  for (const { drawing } of drawings) {
    result = result ? result.fuse(drawing) : drawing;
  }
  return result;
}

/**
 * Group ColoredDrawing[] by color, fusing drawings within each group.
 */
export function groupColoredDrawings(
  drawings: ColoredDrawing[],
): Map<string, Drawing> {
  const groups = new Map<string, Drawing>();
  for (const { drawing, color } of drawings) {
    const existing = groups.get(color);
    groups.set(color, existing ? existing.fuse(drawing) : drawing);
  }
  return groups;
}

// Keep a fallback single-drawing representation for callers that need it
export function coloredDrawingsToSingle(drawings: ColoredDrawing[]): Drawing {
  return fuseColoredDrawings(drawings) ?? drawRectangle(0.001, 0.001);
}
