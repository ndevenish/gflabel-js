# Plan: Drag-and-Drop SVG Import

## Goal
Allow users to drag SVG files onto the app to use as custom label fragments.

## Existing Building Blocks
- `svgToDrawing(svgString)` in `src/cad/svg.ts` — parses `<path d="...">`, flips Y, classifies holes, returns replicad Drawing
- `FRAGMENT_REGISTRY` in `src/cad/fragments/base.ts` — supports runtime `.set()`
- `insertAtCursorRef` pattern — injects spec text into textarea at cursor
- Symbol fragment in `src/cad/fragments/symbols.ts` — reference for scale-to-fit rendering logic

## Changes (MVP ~60-80 lines)

### 1. Drop target — `src/App.tsx` or `src/components/ControlPanel.tsx`
- Add `onDragOver` (preventDefault) and `onDrop` handlers
- Read dropped `.svg` file via `FileReader.readAsText()`
- Derive name from filename stem (e.g. `my-icon.svg` → `my-icon`)
- Send SVG string + name to worker via new message type
- On success, insert `{svg(name)}` at cursor

### 2. Worker message — `src/cad/worker.ts` + `src/cad/workerClient.ts`
- New message type `REGISTER_SVG` with `{ name: string, svgString: string }`
- Worker handler: call `svgToDrawing(svgString)`, store in a `Map<string, Drawing>`
- Return success/error to main thread

### 3. Dynamic fragment factory — `src/cad/fragments/symbols.ts` or new file
- Register `"svg"` fragment name: `registerFragment(["svg"], (name) => ...)`
- Factory looks up Drawing from the stored map
- Render: center on origin, scale to fit height (same as symbol fragment)

### 4. Insert spec — in the drop handler
- After successful registration, call `insertAtCursorRef.current?.("{svg(name)}")`

## Optional Enhancements
- **Palette section**: show thumbnails of imported SVGs with click-to-insert
- **Persistence**: store imported SVGs in localStorage/IndexedDB so they survive reload
- **Validation**: toast/error for SVGs with no `<path>` elements or parse failures
- **Name collision**: append suffix if name already registered
- **Multi-file drop**: handle multiple SVGs in one drop

## Key Considerations
- SVG parsing only supports `<path d="...">` elements — `<rect>`, `<circle>`, `<text>` etc. are ignored
- Complex SVGs (Inkscape exports with transforms, nested groups) may need `transform` attribute handling — currently not implemented in `svgToDrawing()`
- Worker runs in separate thread; registration must happen there since that's where replicad/OpenCascade lives
