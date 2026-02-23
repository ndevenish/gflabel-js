import React from "react";
import { BaseSelector } from "./BaseSelector.js";
import { BaseSizeControls } from "./BaseSizeControls.js";
import { LabelSpecInput } from "./LabelSpecInput.js";
import { DownloadButtons } from "./DownloadButtons.js";
import { renderLabel, renderSVG, ensureReady } from "../cad/workerClient.js";
import type { MeshData } from "../cad/workerClient.js";
import { LabelStyle } from "../cad/options.js";
import type { BaseConfig, BaseType } from "../cad/bases/base.js";
import type { PreviewMode } from "../App.js";

interface Props {
  onMeshUpdate: (mesh: MeshData) => void;
  onSvgUpdate: (svg: string) => void;
  previewMode: PreviewMode;
  onPreviewModeChange: (mode: PreviewMode) => void;
  onRenderStart: () => void;
  onRenderEnd: () => void;
  onError: (error: string) => void;
}

export function ControlPanel({
  onMeshUpdate,
  onSvgUpdate,
  previewMode,
  onPreviewModeChange,
  onRenderStart,
  onRenderEnd,
  onError,
}: Props) {
  const [baseType, setBaseType] = React.useState<BaseType>("pred");
  const [width, setWidth] = React.useState(1);
  const [height, setHeight] = React.useState<number | undefined>(undefined);
  const [spec, setSpec] = React.useState("{nut}M3");
  const [style, setStyle] = React.useState<LabelStyle>(LabelStyle.EMBOSSED);
  const [workerReady, setWorkerReady] = React.useState(false);
  const [autoRender, setAutoRender] = React.useState(true);

  // Initialize worker
  React.useEffect(() => {
    ensureReady().then(() => setWorkerReady(true));
  }, []);

  const insertAtCursorRef = React.useRef<((text: string) => void) | null>(null);

  const doRender = React.useCallback(async () => {
    if (!workerReady || !spec.trim()) return;

    onRenderStart();
    try {
      const baseConfig: BaseConfig = {
        baseType,
        width,
        height,
      };
      if (previewMode === "svg") {
        const result = await renderSVG({
          spec,
          base: baseConfig,
          style,
        });
        onSvgUpdate(result.svg);
      } else {
        const mesh = await renderLabel({
          spec,
          base: baseConfig,
          style,
        });
        onMeshUpdate(mesh);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      onRenderEnd();
    }
  }, [
    workerReady,
    spec,
    baseType,
    width,
    height,
    style,
    previewMode,
    onMeshUpdate,
    onSvgUpdate,
    onRenderStart,
    onRenderEnd,
    onError,
  ]);

  // Keep a stable ref to doRender so the debounce effect doesn't re-trigger
  // when callback identity changes.
  const doRenderRef = React.useRef(doRender);
  React.useEffect(() => { doRenderRef.current = doRender; }, [doRender]);

  // Auto-render: debounced in SVG mode on input changes, immediate on mode switch
  const prevModeRef = React.useRef(previewMode);
  React.useEffect(() => {
    const modeChanged = prevModeRef.current !== previewMode;
    prevModeRef.current = previewMode;

    if (!workerReady || !spec.trim()) return;
    if (!autoRender && !modeChanged) return;

    const delay = modeChanged ? 0 : previewMode === "svg" ? 300 : 600;
    const timer = setTimeout(() => {
      doRenderRef.current();
    }, delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, baseType, width, height, style, previewMode, workerReady, autoRender]);

  const handleRender = doRender;

  return (
    <div
      style={{
        width: 340,
        minWidth: 340,
        padding: 16,
        borderRight: "1px solid #ddd",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <h2 style={{ margin: 0, fontSize: 18 }}>GFLabel</h2>

      <BaseSelector value={baseType} onChange={setBaseType} />

      <BaseSizeControls
        baseType={baseType}
        width={width}
        height={height}
        onWidthChange={setWidth}
        onHeightChange={setHeight}
      />

      <div>
        <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>
          Style
        </label>
        <select
          value={style}
          onChange={(e) => setStyle(e.target.value as LabelStyle)}
          style={{ width: "100%", padding: "6px 8px" }}
        >
          <option value={LabelStyle.EMBOSSED}>Embossed</option>
          <option value={LabelStyle.DEBOSSED}>Debossed</option>
          <option value={LabelStyle.EMBEDDED}>Embedded</option>
        </select>
      </div>

      <LabelSpecInput value={spec} onChange={setSpec} insertAtCursorRef={insertAtCursorRef} />

      <div>
        <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>
          Preview
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 6, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={autoRender}
            onChange={(e) => setAutoRender(e.target.checked)}
          />
          Auto re-render
        </label>
        <div
          style={{
            display: "flex",
            borderRadius: 6,
            overflow: "hidden",
            border: "1px solid #d1d5db",
          }}
        >
          {(["svg", "3d"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => onPreviewModeChange(mode)}
              style={{
                flex: 1,
                padding: "6px 0",
                border: "none",
                background: previewMode === mode ? "#2563eb" : "#f3f4f6",
                color: previewMode === mode ? "white" : "#374151",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {mode.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={handleRender}
        disabled={!workerReady || !spec.trim()}
        style={{
          padding: "10px 16px",
          background: workerReady ? "#2563eb" : "#94a3b8",
          color: "white",
          border: "none",
          borderRadius: 6,
          cursor: workerReady ? "pointer" : "not-allowed",
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        {workerReady ? "Render" : "Loading WASM..."}
      </button>

      <DownloadButtons />
    </div>
  );
}
