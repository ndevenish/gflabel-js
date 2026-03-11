# Named STEP Export via OCCT XDE (XCAF)

## Background

replicad and build123d both use OpenCascade Technology (OCCT) as their geometry
kernel — replicad via `replicad-opencascadejs` (OCCT compiled to WebAssembly),
build123d via the `OCP` Python bindings. The underlying STEP writer is the same
in both.

The current replicad STEP export (`solid.blobSTEP()`) uses `STEPControl_Writer`,
which writes geometry but no named parts or embedded color. build123d sets
`shape.label = "T"` which flows into OCCT's `TDataStd_Name` attribute, picked
up by the XCAF-aware `STEPCAFControl_Writer`. This is what makes named bodies
(and colors) appear in STEP file viewers.

This is also the missing piece for `--text-as-parts`: the option is accepted
but is currently a no-op because replicad's API doesn't expose part naming.

## What's Already in the WASM Build

All required XDE classes are present in
`replicad-opencascadejs/src/replicad_single.d.ts` (132 matches for XCAF/STEP
symbols):

| Class | Purpose |
|---|---|
| `XCAFApp_Application` | XDE application singleton |
| `TDocStd_Document` / `Handle_TDocStd_Document` | XDE document |
| `XCAFDoc_DocumentTool` | Entry point: `.ShapeTool()`, `.ColorTool()` |
| `XCAFDoc_ShapeTool` | `.AddShape()`, `.NewShape()`, `.SetShape()` |
| `XCAFDoc_ColorTool` | `.SetColor()` per shape label |
| `TDataStd_Name` | `.Set(label, string)` — sets part name |
| `STEPCAFControl_Writer` | XCAF-aware STEP writer (vs plain `STEPControl_Writer`) |

replicad's `Shape` base class exposes `.wrapped: TopoDS_Shape` (confirmed in
`replicad/dist/replicad.d.ts` line 2244), giving direct access to the
underlying OCCT shape for any `Solid`, `Compound`, etc.

## Implementation Sketch

```typescript
import { getOC } from "replicad";

function exportNamedStep(bodies: Array<{ solid: Solid; name: string; color: string }>): Uint8Array {
  const OC = getOC();

  // 1. Create XDE document
  const app = OC.XCAFApp_Application.GetApplication();
  const docHandle = new OC.Handle_TDocStd_Document_2(...);
  app.NewDocument(new OC.TCollection_ExtendedString_1("MDTV-CAF"), docHandle);
  const doc = docHandle.get();

  // 2. Get shape + color tools
  const shapeTool = OC.XCAFDoc_DocumentTool.ShapeTool(doc.Main()).get();
  const colorTool = OC.XCAFDoc_DocumentTool.ColorTool(doc.Main()).get();

  // 3. Add each body with name and color
  for (const { solid, name, color } of bodies) {
    const label = shapeTool.AddShape(solid.wrapped, false, false);
    const nameStr = new OC.TCollection_ExtendedString_1(name);
    OC.TDataStd_Name.Set_1(label, nameStr);

    const ocColor = cssColorToQuantityColor(OC, color);
    colorTool.SetColor_2(label, ocColor, OC.XCAFDoc_ColorType.XCAFDoc_ColorSurf);
  }

  // 4. Write via STEPCAFControl_Writer (uses Emscripten virtual FS)
  const writer = new OC.STEPCAFControl_Writer_1();
  writer.Transfer_1(docHandle, OC.STEPControl_StepModelType.STEPControl_AsIs, "", new OC.Message_ProgressRange_1());
  writer.write("/output.step"); // Emscripten FS
  return OC.FS.readFile("/output.step");
}
```

## Tricky Parts

1. **XCAFApp document init** — `GetApplication()` / `NewDocument()` calling
   conventions in the WASM bindings are not documented; needs experimentation
   with the overload suffixes (`_1`, `_2`, etc.) in the `.d.ts`.

2. **String types** — Part names need `TCollection_ExtendedString`, not plain
   JS strings.

3. **Color conversion** — Need to convert CSS hex colors to `Quantity_Color`.
   OCCT uses linear RGB (0–1); CSS hex is sRGB, so gamma correction may be
   needed for accuracy. `Quantity_Color` constructor takes `(R, G, B,
   Quantity_TypeOfColor.Quantity_TOC_sRGB)`.

4. **Emscripten FS output** — `STEPCAFControl_Writer.write()` takes a file
   path. Like the current STEP export, this writes to Emscripten's virtual
   filesystem; the bytes are then read back with `OC.FS.readFile()`.

5. **`getOC()`** — replicad doesn't export a `getOC()` function publicly, but
   the OC object is available in the worker/CLI context where `setOC()` was
   called. May need to cache it at init time.

## What This Enables

- **Named bodies in STEP**: "Base", "Label\_T", "Label\_e", etc. — visible in
  FreeCAD, Fusion 360, etc.
- **Colors in STEP**: each body's color embedded in the file, not just in the
  mesh preview.
- **`--text-as-parts`**: per-character solids with meaningful names in the STEP
  tree.

## Effort Estimate

**1–2 days** of focused work. Nothing is conceptually hard; the cost is
trial-and-error against undocumented WASM API bindings. A good starting point
is to search the replicad source for how it calls `STEPControl_Writer` and
mirror that pattern with the XCAF equivalents.
