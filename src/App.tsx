import React from "react";
import { ControlPanel } from "./components/ControlPanel.js";
import { PreviewPanel } from "./components/PreviewPanel.js";
import type { MeshData } from "./cad/workerClient.js";

export type PreviewMode = "svg" | "3d";

export function App() {
  const [meshData, setMeshData] = React.useState<MeshData | null>(null);
  const [svgData, setSvgData] = React.useState<string | null>(null);
  const [previewMode, setPreviewMode] = React.useState<PreviewMode>("svg");
  const [isRendering, setIsRendering] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleMeshUpdate = React.useCallback((mesh: MeshData) => {
    setMeshData(mesh);
    setSvgData(null);
  }, []);

  const handleSvgUpdate = React.useCallback((svg: string) => {
    setSvgData(svg);
    setMeshData(null);
  }, []);

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
      }}
    >
      <ControlPanel
        onMeshUpdate={handleMeshUpdate}
        onSvgUpdate={handleSvgUpdate}
        previewMode={previewMode}
        onPreviewModeChange={setPreviewMode}
        onRenderStart={() => {
          setIsRendering(true);
          setError(null);
        }}
        onRenderEnd={() => setIsRendering(false)}
        onError={setError}
      />
      <PreviewPanel
        meshData={meshData}
        svgData={svgData}
        previewMode={previewMode}
        isRendering={isRendering}
        error={error}
      />
    </div>
  );
}
