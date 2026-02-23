import { LabelViewer } from "./LabelViewer.js";
import type { MeshData } from "../cad/workerClient.js";
import type { PreviewMode } from "../App.js";

interface Props {
  meshData: MeshData | null;
  svgData: string | null;
  previewMode: PreviewMode;
  isRendering: boolean;
  error: string | null;
}

export function PreviewPanel({ meshData, svgData, previewMode, isRendering, error }: Props) {
  const showSvg = previewMode === "svg" && svgData;
  const showMesh = previewMode === "3d";
  const hasContent = showSvg || (showMesh && meshData);

  return (
    <div style={{ flex: 1, position: "relative" }}>
      {showSvg ? (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "white",
          }}
          dangerouslySetInnerHTML={{ __html: svgData }}
        />
      ) : (
        <LabelViewer meshData={meshData} />
      )}

      {/* Status overlay */}
      {(isRendering || error || !hasContent) && (
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
