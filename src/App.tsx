import React from "react";
import { ControlPanel } from "./components/ControlPanel.js";
import { PreviewPanel } from "./components/PreviewPanel.js";
import type { MeshData } from "./cad/workerClient.js";

export function App() {
  const [meshData, setMeshData] = React.useState<MeshData | null>(null);
  const [isRendering, setIsRendering] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
      }}
    >
      <ControlPanel
        onMeshUpdate={setMeshData}
        onRenderStart={() => {
          setIsRendering(true);
          setError(null);
        }}
        onRenderEnd={() => setIsRendering(false)}
        onError={setError}
      />
      <PreviewPanel
        meshData={meshData}
        isRendering={isRendering}
        error={error}
      />
    </div>
  );
}
