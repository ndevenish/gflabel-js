import React from "react";
import { ControlPanel } from "./components/ControlPanel.js";
import { PreviewPanel } from "./components/PreviewPanel.js";
import type { MeshData } from "./cad/workerClient.js";
import { BASE_TYPES, type BaseType } from "./cad/bases/base.js";

export type PreviewMode = "svg" | "3d";

/** Parse /<baseType> from the URL pathname, returning undefined for root. */
function parseRouteBaseType(): BaseType | undefined {
  const seg = window.location.pathname.replace(/^\/+|\/+$/g, "").toLowerCase();
  if (!seg) return undefined;
  return (BASE_TYPES as string[]).includes(seg) ? (seg as BaseType) : undefined;
}

export function App() {
  const [lockedBaseType, setLockedBaseType] = React.useState<BaseType | undefined>(parseRouteBaseType);
  const [meshData, setMeshData] = React.useState<MeshData | null>(null);
  const [svgData, setSvgData] = React.useState<string | null>(null);
  const [previewMode, setPreviewMode] = React.useState<PreviewMode>("3d");
  const [isRendering, setIsRendering] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Listen for popstate (browser back/forward)
  React.useEffect(() => {
    const onPop = () => setLockedBaseType(parseRouteBaseType());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const handleMeshUpdate = React.useCallback((mesh: MeshData) => {
    setMeshData(mesh);
    setSvgData(null);
  }, []);

  const handleSvgUpdate = React.useCallback((svg: string) => {
    setSvgData(svg);
    setMeshData(null);
  }, []);

  const navigateHome = React.useCallback(() => {
    history.pushState(null, "", "/");
    setLockedBaseType(undefined);
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
        lockedBaseType={lockedBaseType}
        onNavigateHome={navigateHome}
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
