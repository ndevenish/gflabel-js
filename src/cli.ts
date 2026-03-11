#!/usr/bin/env node

/**
 * CLI entry point for gflabel-js — mirrors the Python gflabel CLI.
 */

import { Command } from "commander";
import { readFileSync, writeFileSync } from "fs";
import { resolve, extname } from "path";
import { fileURLToPath } from "url";

async function main() {
  // Dynamic imports for replicad (needs WASM init first)
  const { setOC } = await import("replicad");

  // Load OpenCascade
  const opencascadeModule = await import(
    "replicad-opencascadejs/src/replicad_single.js"
  );
  const opencascade = opencascadeModule.default;

  // Locate WASM file
  const wasmPath = resolve(
    fileURLToPath(import.meta.url),
    "../../node_modules/replicad-opencascadejs/src/replicad_single.wasm",
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const OC = await opencascade({
    locateFile: () => wasmPath,
  }) as any;
  setOC(OC);

  // Load fonts
  const { loadFont, loadFontNamed, setActiveFont } = await import("./cad/font.js");
  const assetsDir = resolve(fileURLToPath(import.meta.url), "../assets");

  function loadTtf(filename: string): ArrayBuffer {
    const buf = readFileSync(resolve(assetsDir, filename));
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }

  await loadFont(loadTtf("OpenSans-Regular.ttf"));
  await loadFontNamed("jost", loadTtf("Jost-500-Medium.ttf"));
  await loadFontNamed("jost-semibold", loadTtf("Jost-600-Semi.ttf"));

  // Load symbols
  const { loadSymbols } = await import("./cad/fragments/symbols.js");
  const symbolsDir = resolve(
    fileURLToPath(import.meta.url),
    "../assets/fragments/symbols",
  );
  const symbolManifest = JSON.parse(
    readFileSync(resolve(symbolsDir, "manifest.json"), "utf-8"),
  );
  loadSymbols(symbolManifest, (id) =>
    readFileSync(resolve(symbolsDir, `${id}.svg`), "utf-8"),
  );

  // Load SVG-based hardware fragments
  const { loadSvgFragments } = await import("./cad/fragments/svgFragments.js");
  const fragmentsDir = resolve(
    fileURLToPath(import.meta.url),
    "../assets/fragments",
  );
  loadSvgFragments((name) =>
    readFileSync(resolve(fragmentsDir, `${name}.svg`), "utf-8"),
  );

  // Import fragment index to trigger registrations
  const { setSvgFileLoader } = await import("./cad/fragments/index.js");

  // Set SVG file loader for {svg(...)} fragments
  setSvgFileLoader((path) => readFileSync(path, "utf-8"));

  // Import CAD modules
  const { LabelRenderer, renderDividedLabel } = await import("./cad/label.js");
  const { buildBase, extrudeLabel } = await import("./cad/bases/index.js");
  const { compoundShapes } = await import("replicad");
  const { DEFAULT_RENDER_OPTIONS } = await import("./cad/options.js");

  const program = new Command();
  program
    .name("gflabel-js")
    .description("Generate 3D-printable Gridfinity labels")
    .argument("<base>", "Label base type (pred, plain, none, predbox, tailorbox, cullenect, modern)")
    .argument("<labels...>", "Label specifications")
    .option("-o, --output <file>", "Output file", "label.step")
    .option("-w, --width <n>", "Width (units for pred, mm for plain)", "1")
    .option("--height <mm>", "Height in mm")
    .option("--style <style>", "Label style (embossed, debossed, embedded)", "embossed")
    .option("--depth <mm>", "Extrusion depth in mm", "0.4")
    .option("-d, --divisions <n>", "Divisions per label", "1")
    .option("--margin <mm>", "Margin in mm", "0.4")
    .option("--column-gap <mm>", "Column gap in mm", "0.4")
    .option("--font <name>", "Font (open-sans, jost, jost-semibold)", "jost-semibold")
    .option("--base-color <name>", "Base color (CSS color name)", "orange")
    .option("--label-color <name>", "Default label color (CSS color name)", "blue")
    .option(
      "--svg-mono <mode>",
      "SVG mono mode: none, import, export, both (default: none)",
      "none",
    )
    .option(
      "--svg-base <mode>",
      "Include base in SVG output: none, outline, solid (default: none)",
      "none",
    )
    .option(
      "--text-as-parts",
      "Render text as per-character parts (best effort)",
      false,
    )
    .parse(process.argv);

  const opts = program.opts();
  const [baseType, ...labels] = program.args;

  if (!baseType || labels.length === 0) {
    program.help();
    return;
  }

  // Parse options
  const { parseLabelStyle, SvgMono, SvgBase } = await import("./cad/options.js");
  const style = parseLabelStyle(opts.style);

  function parseSvgMono(v: string): import("./cad/options.js").SvgMono {
    const found = Object.values(SvgMono).find(
      (s) => s === v.toLowerCase(),
    );
    if (!found) throw new Error(`Unknown --svg-mono value: ${v}`);
    return found;
  }
  function parseSvgBase(v: string): import("./cad/options.js").SvgBase {
    const found = Object.values(SvgBase).find(
      (s) => s === v.toLowerCase(),
    );
    if (!found) throw new Error(`Unknown --svg-base value: ${v}`);
    return found;
  }

  const svgMono = parseSvgMono(opts.svgMono as string);
  const svgBase = parseSvgBase(opts.svgBase as string);
  setActiveFont(opts.font);
  const width = parseFloat(opts.width);
  const height = opts.height ? parseFloat(opts.height) : undefined;
  const depth = parseFloat(opts.depth);
  const divisions = parseInt(opts.divisions, 10);

  const baseConfig = {
    baseType: baseType as import("./cad/bases/base.js").BaseType,
    width,
    height,
    depth,
    style,
  };

  const renderOptions = {
    ...DEFAULT_RENDER_OPTIONS,
    marginMm: parseFloat(opts.margin),
    columnGap: parseFloat(opts.columnGap),
    defaultColor: opts.labelColor as string,
    textAsParts: opts.textAsParts as boolean,
    svgMono,
  };

  // Process labels (replace \\n with actual newlines)
  const processedLabels = labels.map((l: string) => l.replace(/\\n/g, "\n"));

  // Python behavior: divisions defaults to len(labels) → all on one physical label.
  // Batch labels into groups of `divisions`, each batch = one physical label.
  const effectiveDivisions = divisions || processedLabels.length;
  const labelBatches: string[][] = [];
  for (let i = 0; i < processedLabels.length; i += effectiveDivisions) {
    labelBatches.push(processedLabels.slice(i, i + effectiveDivisions));
  }
  if (labelBatches.length === 0) labelBatches.push([""]);

  // Render each physical label batch and stack vertically
  const LABEL_GAP_MM = 2;
  const allBodies: import("replicad").Solid[] = [];
  const allColorMap: import("./cad/bases/index.js").ColorEntry[] = [];
  let triangleOffset = 0;
  let yOffset = 0;
  let labelDrawings: import("./cad/label.js").ColoredDrawing[] = [];
  let firstBaseArea = { x: 0, y: 0 };

  for (let batchIdx = 0; batchIdx < labelBatches.length; batchIdx++) {
    const batch = labelBatches[batchIdx]!;
    const baseResult = buildBase(baseConfig);
    if (batchIdx === 0) firstBaseArea = baseResult.area;
    const renderer = new LabelRenderer(renderOptions);

    let batchDrawings: import("./cad/label.js").ColoredDrawing[];
    if (batch.length > 1 || effectiveDivisions > 1) {
      batchDrawings = renderDividedLabel(batch, baseResult.area, effectiveDivisions, renderOptions);
    } else {
      const adjustedArea = {
        x: baseResult.area.x - renderOptions.marginMm * 2,
        y: baseResult.area.y - renderOptions.marginMm * 2,
      };
      batchDrawings = renderer.render(batch[0]!, adjustedArea);
    }

    // Track drawings (with Y offset) for SVG export
    for (const cd of batchDrawings) {
      labelDrawings.push({ ...cd, drawing: cd.drawing.translate([0, yOffset]) });
    }

    const extResult = extrudeLabel(baseResult, batchDrawings, style, depth, opts.baseColor as string);
    const translated = extResult.solid.translate([0, yOffset, 0]);
    allBodies.push(translated);

    if (extResult.colorMap) {
      for (const entry of extResult.colorMap) {
        allColorMap.push({ ...entry, triangleStart: entry.triangleStart + triangleOffset });
      }
      triangleOffset += extResult.colorMap.reduce((sum, e) => sum + e.triangleCount, 0);
    }

    const physicalHeight = baseResult.solid
      ? baseResult.solid.boundingBox.height
      : baseResult.area.y;
    yOffset -= physicalHeight + LABEL_GAP_MM;
  }

  const solid = allBodies.length === 1
    ? allBodies[0]!
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    : (compoundShapes as any)(allBodies);
  const extrudeResult = {
    solid,
    colorMap: allColorMap.length > 0 ? allColorMap : undefined,
  };

  // Print part tree
  if (extrudeResult.colorMap && extrudeResult.colorMap.length > 0) {
    const parts = extrudeResult.colorMap;
    console.log("Compound");
    parts.forEach((entry, i) => {
      const isLast = i === parts.length - 1;
      const prefix = isLast ? "└──" : "├──";
      const name = i === 0 && parts.length > 1 ? "Base" : "Label";
      console.log(`  ${prefix} ${name} [${entry.color}] (${entry.triangleCount} triangles)`);
    });
  } else {
    console.log(`Solid (${style})`);
  }

  // Export
  const outputPath = resolve(opts.output);
  const ext = extname(outputPath).toLowerCase();

  if (ext === ".svg") {
    const { coloredDrawingsToSVG } = await import("./cad/font.js");
    const { fuseColoredDrawings } = await import("./cad/label.js");

    let svgString: string;

    if (svgMono === SvgMono.EXPORT || svgMono === SvgMono.BOTH) {
      // Mono export: fuse all label drawings into a single layer
      const fused = fuseColoredDrawings(labelDrawings);
      svgString = fused
        ? coloredDrawingsToSVG([{ drawing: fused, color: opts.labelColor as string }])
        : coloredDrawingsToSVG([]);
    } else {
      // Per-color export
      svgString = coloredDrawingsToSVG(labelDrawings);
    }

    if (svgBase !== SvgBase.NONE) {
      // Prepend a base outline/solid layer to the SVG
      // Uses the label area as a rectangular approximation of the base footprint
      const { drawRectangle } = await import("replicad");
      const baseRect = drawRectangle(firstBaseArea.x, firstBaseArea.y);
      const baseDrawings = [{ drawing: baseRect, color: opts.baseColor as string }];
      const baseSvg = coloredDrawingsToSVG(baseDrawings);
      // Merge base SVG layers into the label SVG
      const baseGroups = baseSvg.match(/<g\b[^>]*>[\s\S]*?<\/g>/g) ?? [];
      const labelGroups = svgString.match(/<g\b[^>]*>[\s\S]*?<\/g>/g) ?? [];
      const allGroups = [...baseGroups, ...labelGroups];
      // Extract viewBox from the label drawing (more representative)
      const vbMatch = svgString.match(/viewBox="([^"]+)"/);
      const viewBox = vbMatch ? vbMatch[1] : "0 0 10 5";
      svgString = `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" stroke="none">${allGroups.join("")}</svg>`;
    }

    writeFileSync(outputPath, svgString, "utf-8");
  } else if (ext === ".stl") {
    const blob = solid.blobSTL();
    const buffer = Buffer.from(await blob.arrayBuffer());
    writeFileSync(outputPath, buffer);
  } else if (ext === ".step" || ext === ".stp") {
    const blob = solid.blobSTEP();
    const buffer = Buffer.from(await blob.arrayBuffer());
    writeFileSync(outputPath, buffer);
  } else if (ext === ".3mf") {
    const { exportTo3MF } = await import("./cad/three_mf.js");
    const data = await exportTo3MF(solid, extrudeResult.colorMap);
    writeFileSync(outputPath, data);
  } else {
    console.error(`Unsupported output format: ${ext}`);
    process.exit(1);
  }

  console.log(`Wrote ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
