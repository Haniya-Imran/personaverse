import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { humanize, num, segColor } from "../lib/format";
import type { Visualization } from "../lib/types";

export interface ClusterSceneHandle { resetView(): void; downloadPng(name?: string): void }

interface Props {
  viz: Visualization;
  selected: number | null;
  hidden?: Set<number>;
  onPick?: (segment: number) => void;
  names?: Record<number, string>;
  autoRotate?: boolean;
  pointSize?: number;
}

const DIM = new THREE.Color("#D8DDE4");

function Points({ viz, selected, hidden, onPick, onHover, scale, pointSize }: {
  viz: Visualization; selected: number | null; hidden: Set<number>; scale: number; pointSize: number;
  onPick?: (s: number) => void; onHover: (i: number | null, e?: ThreeEvent<PointerEvent>) => void;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const n = viz.points.length;
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    viz.points.forEach((p, i) => {
      const show = !hidden.has(p.s);
      const focus = selected === null || selected === p.s;
      const s = show ? (focus ? 1 : 0.7) : 0;
      m.makeScale(s, s, s).setPosition(p.x * scale, p.y * scale, p.z * scale);
      mesh.setMatrixAt(i, m);
      c.set(segColor(p.s).color);
      if (!focus) c.lerp(DIM, 0.72);
      mesh.setColorAt(i, c);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [viz, selected, hidden, scale]);

  return (
    <instancedMesh key={n} ref={ref} args={[undefined, undefined, n]}
      onPointerMove={(e) => { e.stopPropagation(); if (e.instanceId !== undefined && !hidden.has(viz.points[e.instanceId].s)) onHover(e.instanceId, e); }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => { e.stopPropagation(); if (e.instanceId !== undefined) onPick?.(viz.points[e.instanceId].s); }}>
      <sphereGeometry args={[pointSize, 14, 14]} />
      <meshStandardMaterial roughness={0.32} metalness={0.06} />
    </instancedMesh>
  );
}

/** Projects 3D centroid positions to screen space and moves plain DOM labels (no portals). */
function LabelProjector({ targets, refs }: { targets: { x: number; y: number; z: number }[]; refs: React.MutableRefObject<(HTMLSpanElement | null)[]> }) {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    targets.forEach((t, i) => {
      const el = refs.current[i];
      if (!el) return;
      v.set(t.x, t.y, t.z).project(camera);
      const behind = v.z > 1;
      el.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px)`;
      el.style.opacity = behind ? "0" : "1";
    });
  });
  return null;
}

export const ClusterScene = forwardRef<ClusterSceneHandle, Props>(function ClusterScene(
  { viz, selected, hidden = new Set(), onPick, names = {}, autoRotate = true, pointSize = 0.07 }, handle,
) {
  const wrap = useRef<HTMLDivElement>(null);
  const controls = useRef<OrbitControlsImpl>(null);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const scale = useMemo(() => {
    const max = Math.max(...viz.points.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.z))), 1e-6);
    return 3 / max;
  }, [viz]);

  useImperativeHandle(handle, () => ({
    resetView() { controls.current?.reset(); },
    downloadPng(name = "clusters-3d.png") {
      const canvas = wrap.current?.querySelector("canvas");
      if (!canvas) return;
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = name;
      a.click();
    },
  }));

  const labelRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const labels = viz.centroids.filter((c) => !hidden.has(c.segment) && c.segment >= 0 && (selected === null || selected === c.segment));
  const hp = hover ? viz.points[hover.i] : null;
  return (
    <div ref={wrap} style={{ position: "absolute", inset: 0 }}>
      <Canvas camera={{ position: [6.2, 4.2, 6.2], fov: 45 }} dpr={[1, 2]} gl={{ preserveDrawingBuffer: true, antialias: true }}
        onPointerMissed={() => setHover(null)}>
        <ambientLight intensity={0.75} />
        <directionalLight position={[5, 8, 6]} intensity={1.5} />
        <directionalLight position={[-6, -2, -4]} intensity={0.35} />
        <gridHelper args={[8, 16, "#9AA3B2", "#BAC1CC"]} position={[0, -3.4, 0]} />
        <Points viz={viz} selected={selected} hidden={hidden} scale={scale} pointSize={pointSize} onPick={onPick}
          onHover={(i, e) => setHover(i === null || !e ? null : { i, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })} />
        <LabelProjector targets={labels.map((c) => ({ x: c.x * scale, y: c.y * scale + 0.42, z: c.z * scale }))} refs={labelRefs} />
        <OrbitControls ref={controls} makeDefault enableDamping enablePan autoRotate={autoRotate && !hover} autoRotateSpeed={0.6} minDistance={3} maxDistance={18} />
      </Canvas>
      {labels.map((c, i) => (
        <span key={c.segment} ref={(el) => { labelRefs.current[i] = el; }} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", background: "#1B2130", color: "#fff", fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 99, transition: "opacity .2s" }}>
          <span className="dot" style={{ background: segColor(c.segment).color, width: 8, height: 8 }} />
          {names[c.segment] ?? `Segment ${c.segment}`}
        </span>
      ))}
      {hp && hover && (
        <div role="tooltip" style={{ position: "absolute", left: Math.min(hover.x + 14, (wrap.current?.clientWidth ?? 400) - 230), top: Math.max(hover.y - 10, 8), width: 220, background: "#1B2130", color: "#E4E8EE", borderRadius: 12, padding: "10px 12px", fontSize: 12, lineHeight: 1.55, pointerEvents: "none", boxShadow: "0 10px 24px rgba(27,33,48,.35)" }}>
          <div style={{ fontWeight: 700, color: "#fff", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
            <span className="dot" style={{ background: segColor(hp.s).color, width: 8, height: 8 }} />
            {hp.s < 0 ? "Noise" : names[hp.s] ?? `Segment ${hp.s}`}
          </div>
          {hp.id && <div className="mono" style={{ color: "#AEB6C4" }}>{viz.id_field}: {hp.id}</div>}
          {viz.fields.map((f, k) => (
            <div key={f} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ color: "#AEB6C4" }}>{humanize(f)}</span>
              <span>{typeof hp.v[k] === "number" ? num(hp.v[k] as number) : hp.v[k] ?? "—"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
