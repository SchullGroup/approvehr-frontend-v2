import type { ApiDepartment } from "@/lib/api/endpoints";

/**
 * One department, positioned once and deterministically.
 *
 * Phase 0 carries headcount only — no lens has attached a value yet. A later
 * phase adds `value`/`tone` fields for whichever lens is active; it must
 * never touch `position` or `radius`, which are a pure function of the tree
 * alone. That is the whole point: switching lenses repaints colour and moves
 * nothing, the same discipline `chart.tsx`'s hand-drawn charts already use
 * for "radius encodes magnitude" — here extended to "position encodes
 * structure, and only structure."
 */
export type ClusterNode = {
  id: string;
  name: string;
  depth: number;
  parentId: string | null;
  headcount: number;
  headName: string | null;
  childCount: number;
  position: readonly [number, number, number];
  radius: number;
};

const LAYER_HEIGHT = 3.2;
const MIN_RADIUS = 0.55;
const RADIUS_SCALE = 0.34;
const MIN_ORBIT_RADIUS = 2.4;

/**
 * Sqrt of headcount, never headcount itself — the same discipline every
 * other chart in this codebase uses so a department ten times the size
 * doesn't dwarf the scene. A `MIN_RADIUS` floor means even a department of
 * one is a real, clickable sphere rather than a point.
 */
function radiusFor(headcount: number): number {
  return MIN_RADIUS + Math.sqrt(Math.max(headcount, 0)) * RADIUS_SCALE;
}

/**
 * Lays the tree out as nested orbits: siblings at one depth sit evenly
 * spaced on a circle around their parent's position, one layer beneath it.
 * Depth reads as height, and position within a layer reads as an angle —
 * both pure functions of the tree, so loading the same company twice draws
 * the same picture, and re-ordering `roots` (which never happens, since the
 * API already sorts alphabetically) couldn't move anybody either.
 *
 * Deliberately not a physics simulation. A force-directed layout redraws
 * itself slightly differently on every reload and resettles when the window
 * resizes — fine for a 2D diagram nobody is meant to memorise, and actively
 * disorienting in a space somebody is meant to navigate by camera, where
 * "the thing I was just looking at moved" is the one failure this avoids.
 */
export function layoutClusters(roots: readonly ApiDepartment[]): ClusterNode[] {
  const out: ClusterNode[] = [];

  const place = (
    nodes: readonly ApiDepartment[],
    center: readonly [number, number, number],
    depth: number,
  ): void => {
    if (nodes.length === 0) return;
    /* Sorted by id, never by headcount or anything a lens could later
       change — the one rule that keeps a cluster's position stable across
       every lens this feature will ever grow. */
    const sorted = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
    const count = sorted.length;

    const totalFootprint = sorted.reduce(
      (sum, department) => sum + radiusFor(department.totalEmployees),
      0,
    );
    const orbitRadius =
      count === 1 ? 0 : Math.max(MIN_ORBIT_RADIUS, totalFootprint * 0.6);

    sorted.forEach((department, index) => {
      const angle = (index / count) * Math.PI * 2;
      const position: readonly [number, number, number] = [
        center[0] + (count === 1 ? 0 : Math.cos(angle) * orbitRadius),
        center[1] - (depth === 0 ? 0 : LAYER_HEIGHT),
        center[2] + (count === 1 ? 0 : Math.sin(angle) * orbitRadius),
      ];

      out.push({
        id: department.id,
        name: department.name,
        depth,
        parentId: department.parentId,
        headcount: department.totalEmployees,
        headName: department.headName,
        childCount: department.childCount,
        position,
        radius: radiusFor(department.totalEmployees),
      });

      if (department.children.length > 0) {
        place(department.children, position, depth + 1);
      }
    });
  };

  place(roots, [0, 0, 0], 0);
  return out;
}
