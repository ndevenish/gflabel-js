import React from "react";
import { exportFile } from "../cad/workerClient.js";

interface Props {
  onEnsureRendered: () => Promise<void>;
}

export function DownloadButtons({ onEnsureRendered }: Props) {
  const [exporting, setExporting] = React.useState(false);

  const handleExport = async (format: "stl" | "step" | "svg" | "3mf") => {
    setExporting(true);
    try {
      await onEnsureRendered();
      const file = await exportFile(format);
      const blob = new Blob([file.buffer], { type: file.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.filename;
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
    background: "#f1f5f9",
    border: "1px solid #cbd5e1",
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
        <button
          style={btnStyle}
          disabled={exporting}
          onClick={() => handleExport("3mf")}
        >
          3MF
        </button>
      </div>
    </div>
  );
}
