import React from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import type { MeshData } from "../cad/workerClient.js";

interface Props {
  meshData: MeshData | null;
}

function LabelMesh({ meshData }: { meshData: MeshData }) {
  const geometry = React.useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(meshData.faces, 3),
    );
    geo.setAttribute(
      "normal",
      new THREE.BufferAttribute(meshData.normals, 3),
    );
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
  }, [meshData]);

  React.useEffect(() => {
    return () => geometry.dispose();
  }, [geometry]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#6b9bd2" side={THREE.DoubleSide} />
    </mesh>
  );
}

export function LabelViewer({ meshData }: Props) {
  return (
    <Canvas style={{ background: "#f8f9fa" }}>
      <PerspectiveCamera makeDefault position={[0, 0, 60]} fov={45} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 10]} intensity={1} />
      <directionalLight position={[-10, -5, -10]} intensity={0.3} />
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
