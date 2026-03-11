import React from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import type { MeshData, ColorEntry } from "../cad/workerClient.js";

interface Props {
  meshData: MeshData | null;
}

const COLOR_BASE = new THREE.Color("#fdf26f"); // yellow/gold
const COLOR_LABEL = new THREE.Color("#606060"); // near-black

/** Resolve a triangle's color using colorMap (if present) or Z-position heuristic. */
function resolveColor(
  t: number,
  colorMap: ColorEntry[] | undefined,
  style: string,
  baseTriangleCount: number | undefined,
  srcPos: Float32Array,
  i0: number,
  i1: number,
  i2: number,
): THREE.Color {
  if (colorMap) {
    for (const entry of colorMap) {
      if (t >= entry.triangleStart && t < entry.triangleStart + entry.triangleCount) {
        return new THREE.Color(entry.color);
      }
    }
    return COLOR_BASE;
  }

  // Z-position heuristic fallback (used for debossed, which has no colorMap)
  let isLabel: boolean;
  if (style === "embedded" && baseTriangleCount != null) {
    isLabel = t >= baseTriangleCount;
  } else if (style === "debossed") {
    const minZ = Math.min(srcPos[i0 * 3 + 2]!, srcPos[i1 * 3 + 2]!, srcPos[i2 * 3 + 2]!);
    isLabel = minZ < -0.001;
  } else {
    const maxZ = Math.max(srcPos[i0 * 3 + 2]!, srcPos[i1 * 3 + 2]!, srcPos[i2 * 3 + 2]!);
    isLabel = maxZ > 0.001;
  }
  return isLabel ? COLOR_LABEL : COLOR_BASE;
}

function LabelMesh({ meshData }: { meshData: MeshData }) {
  const geometry = React.useMemo(() => {
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

      const color = resolveColor(
        t, meshData.colorMap, meshData.style, meshData.baseTriangleCount,
        srcPos, i0, i1, i2,
      );

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
  }, [meshData]);

  React.useEffect(() => {
    return () => geometry.dispose();
  }, [geometry]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial vertexColors side={THREE.DoubleSide} />
    </mesh>
  );
}

export function LabelViewer({ meshData }: Props) {
  return (
    <Canvas style={{ background: "#f8f9fa" }}>
      <PerspectiveCamera makeDefault position={[0, 0, 60]} fov={45} />
      <ambientLight intensity={0.2} />
      <directionalLight position={[10, 10, 10]} intensity={1.5} />
      <directionalLight position={[-10, -5, -10]} intensity={0.4} />
      {meshData && <LabelMesh meshData={meshData} />}
      <OrbitControls
        enableDamping
        dampingFactor={0.1}
        minDistance={10}
        maxDistance={200}
      />
      <gridHelper args={[100, 100, "#e0e0e0", "#e0e0e0"]} rotation={[Math.PI / 2, 0, 0]} />
    </Canvas>
  );
}
