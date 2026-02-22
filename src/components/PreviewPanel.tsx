import { LabelViewer } from "./LabelViewer.js";
import type { MeshData } from "../cad/workerClient.js";

interface Props {
  meshData: MeshData | null;
  isRendering: boolean;
  error: string | null;
}

export function PreviewPanel({ meshData, isRendering, error }: Props) {
  return (
    <div style={{ flex: 1, position: "relative" }}>
      <LabelViewer meshData={meshData} />

      {/* Status overlay */}
      {(isRendering || error || !meshData) && (
        <div
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            padding: "8px 12px",
            background: error
              ? "rgba(220, 38, 38, 0.9)"
              : "rgba(0, 0, 0, 0.7)",
            color: "white",
            borderRadius: 6,
            fontSize: 13,
            maxWidth: 400,
          }}
        >
          {isRendering
            ? "Rendering..."
            : error
              ? `Error: ${error}`
              : "Click Render to generate preview"}
        </div>
      )}
    </div>
  );
}
