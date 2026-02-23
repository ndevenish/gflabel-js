import React from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import type { MeshData } from "../cad/workerClient.js";

interface Props {
  meshData: MeshData | null;
}

const BASE_COLOR = new THREE.Color("#fdf26f"); // yellow/gold
const LABEL_COLOR = new THREE.Color("#606060"); // near-black

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

      // Color by Z: faces with any vertex above z=0 are label (dark).
      // This colors text tops and side walls but not the flat base at z=0.
      const maxZ = Math.max(
        srcPos[i0 * 3 + 2]!,
        srcPos[i1 * 3 + 2]!,
        srcPos[i2 * 3 + 2]!,
      );
      const isLabel = maxZ > 0.001;
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
