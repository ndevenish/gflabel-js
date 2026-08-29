import React from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import type { MeshData } from "../cad/workerClient.js";
import type { PreviewColors } from "../color.js";
import { useTheme } from "../theme.js";

interface Props {
  meshData: MeshData | null;
  colors: PreviewColors;
}

function LabelMesh({ meshData, colors }: { meshData: MeshData; colors: PreviewColors }) {
  // Extract hex strings up front — the memo body has its own local `colors`
  // (the per-vertex Float32Array), so referencing the prop inside would clash.
  const baseHex = colors.base;
  const labelHex = colors.label;
  const geometry = React.useMemo(() => {
    const BASE_COLOR = new THREE.Color(baseHex);
    const LABEL_COLOR = new THREE.Color(labelHex);
    const idx = meshData.indices;
    const srcPos = meshData.faces;
    const srcNorm = meshData.normals;
    const triCount = idx.length / 3;

    // De-index: expand to non-indexed geometry so we can color per-face
    const positions = new Float32Array(triCount * 9);
    const normals = new Float32Array(triCount * 9);
    const colors = new Float32Array(triCount * 9);

    for (let t = 0; t < triCount; t++) {
      const i0 = idx[t * 3]!;
      const i1 = idx[t * 3 + 1]!;
      const i2 = idx[t * 3 + 2]!;

      // Copy positions and normals
      for (let c = 0; c < 3; c++) {
        positions[t * 9 + c] = srcPos[i0 * 3 + c]!;
        positions[t * 9 + 3 + c] = srcPos[i1 * 3 + c]!;
        positions[t * 9 + 6 + c] = srcPos[i2 * 3 + c]!;
        normals[t * 9 + c] = srcNorm[i0 * 3 + c]!;
        normals[t * 9 + 3 + c] = srcNorm[i1 * 3 + c]!;
        normals[t * 9 + 6 + c] = srcNorm[i2 * 3 + c]!;
      }

      // Color by style:
      // - Embossed: label faces have any vertex above z=0
      // - Debossed: label faces have any vertex below z=0
      // - Embedded: label is the second body in compound (after baseTriangleCount)
      let isLabel: boolean;
      if (meshData.style === "embedded" && meshData.baseTriangleCount != null) {
        isLabel = t >= meshData.baseTriangleCount;
      } else if (meshData.style === "debossed") {
        const minZ = Math.min(
          srcPos[i0 * 3 + 2]!, srcPos[i1 * 3 + 2]!, srcPos[i2 * 3 + 2]!,
        );
        isLabel = minZ < -0.001;
      } else {
        const maxZ = Math.max(
          srcPos[i0 * 3 + 2]!, srcPos[i1 * 3 + 2]!, srcPos[i2 * 3 + 2]!,
        );
        isLabel = maxZ > 0.001;
      }
      const color = isLabel ? LABEL_COLOR : BASE_COLOR;

      for (let v = 0; v < 3; v++) {
        colors[t * 9 + v * 3] = color.r;
        colors[t * 9 + v * 3 + 1] = color.g;
        colors[t * 9 + v * 3 + 2] = color.b;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
  }, [meshData, baseHex, labelHex]);

  React.useEffect(() => {
    return () => geometry.dispose();
  }, [geometry]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial vertexColors side={THREE.DoubleSide} />
    </mesh>
  );
}

export function LabelViewer({ meshData, colors }: Props) {
  const theme = useTheme();
  // WebGL colors can't use CSS var() — resolve to a real value per theme.
  const gridColor = theme === "dark" ? "#343c45" : "#e0e0e0";
  return (
    <Canvas frameloop="demand" style={{ background: "var(--canvas)" }}>
      <PerspectiveCamera makeDefault position={[0, 0, 60]} fov={45} />
      <ambientLight intensity={0.2} />
      <directionalLight position={[10, 10, 10]} intensity={1.5} />
      <directionalLight position={[-10, -5, -10]} intensity={0.4} />
      {meshData && <LabelMesh meshData={meshData} colors={colors} />}
      <OrbitControls
        enableDamping
        dampingFactor={0.1}
        minDistance={10}
        maxDistance={200}
      />
      <gridHelper args={[100, 100, gridColor, gridColor]} rotation={[Math.PI / 2, 0, 0]} />
    </Canvas>
  );
}
