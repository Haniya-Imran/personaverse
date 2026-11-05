import { Float, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { PALETTE } from "../lib/format";

// Decorative hero illustration: four soft clusters orbiting a centre.
// It is an illustration of the idea, not data — the real clusters live in the workspace.
function Cluster({ center, color, count, seed }: { center: [number, number, number]; color: string; count: number; seed: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const pts = useMemo(() => {
    let s = seed;
    const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    const g = () => Math.sqrt(-2 * Math.log(r() || 1e-6)) * Math.cos(2 * Math.PI * r());
    return Array.from({ length: count }, () => [center[0] + g() * 0.42, center[1] + g() * 0.42, center[2] + g() * 0.42, 0.6 + r() * 0.6]);
  }, [center, count, seed]);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    pts.forEach((p, i) => { m.makeScale(p[3], p[3], p[3]).setPosition(p[0], p[1], p[2]); ref.current!.setMatrixAt(i, m); });
    ref.current!.instanceMatrix.needsUpdate = true;
  }, [pts]);
  return (
    <group>
      <instancedMesh ref={ref} args={[undefined, undefined, count]}>
        <sphereGeometry args={[0.075, 16, 16]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.05} />
      </instancedMesh>
      <Float speed={1.4} floatIntensity={0.5} rotationIntensity={0}>
        <mesh position={center}>
          <sphereGeometry args={[0.24, 32, 32]} />
          <meshStandardMaterial color={color} roughness={0.22} metalness={0.08} />
        </mesh>
      </Float>
    </group>
  );
}

function Spin({ children }: { children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (g.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) g.current.rotation.y += dt * 0.12; });
  return <group ref={g}>{children}</group>;
}

export default function HeroScene() {
  const clusters: [number, number, number][] = [[-1.5, 0.3, 0.5], [1.4, -0.2, -0.6], [0.4, 1.1, 1.3], [-0.5, -1.0, -1.4]];
  return (
    <Canvas camera={{ position: [0, 1.2, 6.4], fov: 42 }} dpr={[1, 2]} aria-hidden="true">
      <ambientLight intensity={0.8} />
      <directionalLight position={[4, 6, 5]} intensity={1.6} />
      <directionalLight position={[-5, -3, -4]} intensity={0.3} />
      <Spin>
        {clusters.map((c, i) => <Cluster key={i} center={c} color={PALETTE[i].color} count={70} seed={11 + i * 7} />)}
      </Spin>
      <gridHelper args={[8, 16, "#9AA3B2", "#BAC1CC"]} position={[0, -2.3, 0]} />
      <OrbitControls enableZoom={false} enablePan={false} autoRotate={false} />
    </Canvas>
  );
}
