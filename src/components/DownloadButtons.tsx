import React from "react";
import { exportFile } from "../cad/workerClient.js";
import { makeLabelFilename } from "../cad/naming.js";
import { toPartColors, type PreviewColors } from "../color.js";
import type { BaseType } from "../cad/bases/base.js";

interface Props {
  onEnsureRendered: () => Promise<void>;
  baseType: BaseType;
  width: number;
  spec: string;
  /** Base/label colours to use as the 3MF filament colours. */
  colors: PreviewColors;
}

export function DownloadButtons({ onEnsureRendered, baseType, width, spec, colors }: Props) {
  const [exporting, setExporting] = React.useState(false);

  const handleExport = async (format: "stl" | "step" | "svg" | "3mf") => {
    setExporting(true);
    try {
      await onEnsureRendered();
      const file = await exportFile(format, format === "3mf" ? toPartColors(colors) : undefined);
      const filename = makeLabelFilename(baseType, width, spec, format);
      const blob = new Blob([file.buffer], { type: file.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
      alert(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExporting(false);
    }
  };

  const btnStyle: React.CSSProperties = {
    flex: 1,
    padding: "8px 12px",
    background: "var(--inset-2)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    borderRadius: 4,
    cursor: exporting ? "not-allowed" : "pointer",
    fontSize: 13,
    opacity: exporting ? 0.5 : 1,
  };

  return (
    <div>
      <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>
        Export
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          style={{ ...btnStyle, background: "var(--accent-soft-2)", borderColor: "var(--accent-soft-border)", color: "var(--accent-soft-text)", fontWeight: 600 }}
          disabled={exporting}
          title="3MF multicolore : base et texte sur des slots de filament séparés"
          onClick={() => handleExport("3mf")}
        >
          3MF
        </button>
        <button
          style={btnStyle}
          disabled={exporting}
          onClick={() => handleExport("stl")}
        >
          STL
        </button>
        <button
          style={btnStyle}
          disabled={exporting}
          onClick={() => handleExport("step")}
        >
          STEP
        </button>
        <button
          style={btnStyle}
          disabled={exporting}
          onClick={() => handleExport("svg")}
        >
          SVG
        </button>
      </div>
    </div>
  );
}
