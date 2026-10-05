"use client";

import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import type { ClusterNode } from "./cluster-data";

/**
 * The first WebGL surface this codebase has ever shipped — loaded only on
 * this one route via `next/dynamic` in `explore-screen.tsx`, so no other
 * page's bundle grows because of it. See that file's header for the
 * accessible-table pairing and the WebGL/reduced-motion fallbacks this
 * component deliberately does not handle itself — it is mounted only once
 * both have already passed.
 *
 * Labels are HTML (`drei`'s `<Html>`), not WebGL text. This app's type scale
 * and contrast are both CI-gated (`verify-typescale.ts`, `verify-contrast.ts`)
 * and neither gate can see inside a canvas — a label drawn in Three.js would
 * be invisible to both. An ordinary `<span>` with the house tokens is
 * covered by both without any new verification surface.
 */

const ACCENT = "#2B3990";
const NEUTRAL = "#8492a0";

export type ClusterSceneProps = {
  clusters: readonly ClusterNode[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  reducedMotion: boolean;
  /**
   * The active lens's colour per department name, or `undefined` for
   * Phase 0's plain headcount view. A cluster missing an entry (no goal or
   * score data for that department under the active lens) falls back to
   * the same neutral every cluster uses with no lens active — absent data
   * reads as "nothing to say", never as a colour that happens to look like
   * an answer.
   */
  colorByName?: ReadonlyMap<string, string>;
};

export function ClusterScene({
  clusters,
  selectedId,
  onSelect,
  reducedMotion,
  colorByName,
}: ClusterSceneProps) {
  return (
    <Canvas
      camera={{ position: [0, 3, 15], fov: 50 }}
      dpr={[1, 2]}
      onPointerMissed={() => onSelect(null)}
    >
      <ambientLight intensity={0.75} />
      <directionalLight position={[8, 12, 6]} intensity={0.55} />
      {clusters.map((cluster) => (
        <ClusterSphere
          key={cluster.id}
          cluster={cluster}
          selected={cluster.id === selectedId}
          onSelect={() => onSelect(cluster.id)}
          color={colorByName?.get(cluster.name) ?? NEUTRAL}
        />
      ))}
      <OrbitControls
        makeDefault
        enableDamping={!reducedMotion}
        dampingFactor={0.12}
        minDistance={4}
        maxDistance={40}
      />
    </Canvas>
  );
}

function ClusterSphere({
  cluster,
  selected,
  onSelect,
  color,
}: {
  cluster: ClusterNode;
  selected: boolean;
  onSelect: () => void;
  color: string;
}) {
  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect();
  };

  return (
    <group position={cluster.position}>
      <mesh onClick={handleClick}>
        <sphereGeometry args={[cluster.radius, 32, 32]} />
        {/* The lens colour is always the base colour; selection is shown as
            an accent glow on top of it, never by replacing it — the two are
            independent facts (what a department's figures say, and whether
            it is the one open in the drawer) and conflating them would lose
            one whenever the other is true. */}
        <meshStandardMaterial
          color={color}
          emissive={selected ? ACCENT : "#000000"}
          emissiveIntensity={selected ? 0.35 : 0}
        />
      </mesh>
      <Html position={[0, cluster.radius + 0.35, 0]} center distanceFactor={12}>
        <span className="pointer-events-none select-none whitespace-nowrap rounded-full border border-line bg-surface px-2 py-0.5 text-meta font-medium text-ink shadow-sm">
          {cluster.name}
        </span>
      </Html>
    </group>
  );
}
