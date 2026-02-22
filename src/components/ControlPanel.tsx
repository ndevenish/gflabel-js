import React from "react";
import { BaseSelector } from "./BaseSelector.js";
import { BaseSizeControls } from "./BaseSizeControls.js";
import { LabelSpecInput } from "./LabelSpecInput.js";
import { DownloadButtons } from "./DownloadButtons.js";
import { renderLabel, ensureReady } from "../cad/workerClient.js";
import type { MeshData } from "../cad/workerClient.js";
import { LabelStyle } from "../cad/options.js";
import type { BaseConfig } from "../cad/bases/base.js";

interface Props {
  onMeshUpdate: (mesh: MeshData) => void;
  onRenderStart: () => void;
  onRenderEnd: () => void;
  onError: (error: string) => void;
}

export function ControlPanel({
  onMeshUpdate,
  onRenderStart,
  onRenderEnd,
  onError,
}: Props) {
  const [baseType, setBaseType] = React.useState<"pred" | "plain">("pred");
  const [width, setWidth] = React.useState(1);
  const [height, setHeight] = React.useState<number | undefined>(undefined);
  const [spec, setSpec] = React.useState("{nut}M3");
  const [style, setStyle] = React.useState<LabelStyle>(LabelStyle.EMBOSSED);
  const [workerReady, setWorkerReady] = React.useState(false);

  // Initialize worker
  React.useEffect(() => {
    ensureReady().then(() => setWorkerReady(true));
  }, []);

  const insertAtCursorRef = React.useRef<((text: string) => void) | null>(null);

  const handleRender = React.useCallback(async () => {
    if (!workerReady || !spec.trim()) return;

    onRenderStart();
    try {
      const baseConfig: BaseConfig = {
        baseType,
        width,
        height,
      };
      const mesh = await renderLabel({
        spec,
        base: baseConfig,
        style,
      });
      onMeshUpdate(mesh);
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
    onMeshUpdate,
    onRenderStart,
    onRenderEnd,
    onError,
  ]);

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
