"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Orbit } from "lucide-react";
import {
  Callout,
  Card,
  Drawer,
  DrawerSection,
  EmptyState,
  SegmentedControl,
  Skeleton,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { LoadFailure } from "@/components/portal/load-failure";
import { useDepartments } from "@/lib/store/departments";
import { layoutClusters, type ClusterNode } from "./cluster-data";
import { LENS_COLORS } from "./lens-data";
import { useReducedMotion, useWebGLSupport } from "./use-3d-support";
import { useLenses } from "./use-lenses";

/**
 * The workforce explorer: the department tree as a navigable 3D space. See
 * `/Users/mac/.claude/plans/lexical-wobbling-map.md` for the full phasing.
 * Phase 0 shipped headcount only; Phase 1 added the goal-achievement and
 * composite-score lenses; Phase 2 added task-logging intensity; Phase 3
 * (this one) added the two comparative reads — best performer and
 * promotion-readiness — completing the plan. Every lens has landed the same
 * way: on top of this same scene and this same data source, without ever
 * moving a single cluster.
 *
 * `useDepartments(false)` — not `ChartModel`/`buildModel()` from the org
 * chart — is the data source. The org chart's own model needs `ApiOrgChart`
 * for the reporting line, which has no demo-mode equivalent, so building on
 * it would have made this screen connected-mode-only despite the plan's own
 * claim that Phase 0 is fully demoable offline. `useDepartments()` is the
 * same department tree — headcount, head, children, depth — already proven
 * in both modes by `/people/departments`, and it is all the headcount view
 * needs: no lens here reads the reporting line.
 */
const ClusterScene = dynamic(
  () => import("./cluster-scene").then((module) => module.ClusterScene),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[34rem] w-full rounded-xl" />,
  },
);

type LensChoice =
  "headcount" | "goals" | "score" | "intensity" | "topScorer" | "promotion";

export function ExploreScreen() {
  const { tree, loading, error, source, demoNote, reload } =
    useDepartments(false);
  const lenses = useLenses();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeLens, setActiveLens] = useState<LensChoice>("headcount");
  const webglSupported = useWebGLSupport();
  const reducedMotion = useReducedMotion();

  const clusters = useMemo(() => layoutClusters(tree), [tree]);
  const selected =
    clusters.find((cluster) => cluster.id === selectedId) ?? null;
  const parentOf = (cluster: ClusterNode) =>
    cluster.parentId === null
      ? null
      : (clusters.find((c) => c.id === cluster.parentId) ?? null);
  const childrenOf = (id: string) =>
    clusters.filter((cluster) => cluster.parentId === id);

  const checking = loading || webglSupported === null;

  /* Only the lenses this viewer can actually see are offered — "Headcount"
     is the one constant, Phase 0's own view, since structure carries no
     permission the way a comparative read does. */
  const lensOptions: { value: LensChoice; label: string }[] = [
    { value: "headcount", label: "Headcount" },
    ...(lenses.goals
      ? [{ value: "goals" as const, label: lenses.goals.label }]
      : []),
    ...(lenses.score
      ? [{ value: "score" as const, label: lenses.score.label }]
      : []),
    ...(lenses.intensity
      ? [{ value: "intensity" as const, label: lenses.intensity.label }]
      : []),
    ...(lenses.topScorer
      ? [{ value: "topScorer" as const, label: lenses.topScorer.label }]
      : []),
    ...(lenses.promotion
      ? [{ value: "promotion" as const, label: lenses.promotion.label }]
      : []),
  ];
  const activeLensObject =
    activeLens === "goals"
      ? lenses.goals
      : activeLens === "score"
        ? lenses.score
        : activeLens === "intensity"
          ? lenses.intensity
          : activeLens === "topScorer"
            ? lenses.topScorer
            : activeLens === "promotion"
              ? lenses.promotion
              : null;

  /* `undefined` — not an empty map — for the plain headcount view, so
     `ClusterScene` falls back to its own single neutral rather than
     colouring every sphere via a map that happens to be empty. */
  const colorByName = useMemo(() => {
    if (!activeLensObject) return undefined;
    const map = new Map<string, string>();
    for (const [name, value] of activeLensObject.byDepartment) {
      map.set(name, LENS_COLORS[value.tone]);
    }
    return map;
  }, [activeLensObject]);

  const selectedLensValue =
    selected && activeLensObject
      ? (activeLensObject.byDepartment.get(selected.name) ?? null)
      : null;

  return (
    <>
      <PageHeader
        title="Explore"
        description="Every department in one space. Drag to orbit, click a cluster to open it."
      />

      <PageBody className="flex flex-col gap-4">
        {DEMO_ENABLED && source === "demo" && (
          <Callout tone="neutral" title="Demo data, this browser only">
            {demoNote}
          </Callout>
        )}

        {checking ? (
          <Skeleton className="h-[34rem] w-full rounded-xl" />
        ) : error ? (
          <LoadFailure
            subject="the workforce explorer"
            error={error}
            onRetry={reload}
          />
        ) : clusters.length === 0 ? (
          <EmptyState
            icon={<Orbit aria-hidden="true" />}
            title="There is nobody to explore yet"
            description="Add departments and people and the company appears here, in space."
          />
        ) : webglSupported === false ? (
          <EmptyState
            icon={<Orbit aria-hidden="true" />}
            title="This browser can't draw 3D graphics"
            description="The explorer needs WebGL, which this device or browser has switched off. The same departments are listed in the table below."
          />
        ) : (
          <>
            {lensOptions.length > 1 && (
              <SegmentedControl
                label="Colour by"
                options={lensOptions}
                value={activeLens}
                onChange={setActiveLens}
              />
            )}
            <Card className="h-[34rem] overflow-hidden p-0">
              <ClusterScene
                clusters={clusters}
                selectedId={selectedId}
                onSelect={setSelectedId}
                reducedMotion={reducedMotion}
                colorByName={colorByName}
              />
            </Card>
          </>
        )}

        <AccessibleClusterTable clusters={clusters} />
      </PageBody>

      <Drawer
        open={selected !== null}
        onClose={() => setSelectedId(null)}
        title={selected?.name ?? ""}
        description={
          selected
            ? `${String(selected.headcount)} ${selected.headcount === 1 ? "person" : "people"}`
            : undefined
        }
      >
        {selected && (
          <div className="flex flex-col gap-5">
            {parentOf(selected) && (
              <button
                type="button"
                className="self-start text-meta text-muted hover:text-ink hover:underline"
                onClick={() => setSelectedId(parentOf(selected)?.id ?? null)}
              >
                ← Back to {parentOf(selected)?.name}
              </button>
            )}

            <DrawerSection title="Led by">
              <p className="text-body-sm text-ink">
                {selected.headName ?? (
                  <span className="text-faint">No head set</span>
                )}
              </p>
            </DrawerSection>

            {activeLensObject && (
              <DrawerSection title={activeLensObject.label}>
                <p className="text-body-sm text-ink">
                  {selectedLensValue ? (
                    selectedLensValue.detail
                  ) : (
                    <span className="text-faint">
                      No data for this department
                    </span>
                  )}
                </p>
              </DrawerSection>
            )}

            {childrenOf(selected.id).length > 0 && (
              <DrawerSection
                title={`${String(childrenOf(selected.id).length)} sub-department${childrenOf(selected.id).length === 1 ? "" : "s"}`}
              >
                <ul className="flex flex-col gap-2">
                  {childrenOf(selected.id).map((child) => (
                    <li
                      key={child.id}
                      className="flex items-center justify-between gap-3"
                    >
                      <button
                        type="button"
                        className="text-body-sm text-accent hover:underline"
                        onClick={() => setSelectedId(child.id)}
                      >
                        {child.name}
                      </button>
                      <span className="text-meta text-muted">
                        {child.headcount}{" "}
                        {child.headcount === 1 ? "person" : "people"}
                      </span>
                    </li>
                  ))}
                </ul>
              </DrawerSection>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}

/**
 * The same `sr-only-focusable`-on-a-wrapping-`<div>` pairing every chart in
 * `components/ui/chart.tsx` uses — a `<table>` does not honour `width: 1px`
 * itself (see that file's header), and this is the one WebGL surface in the
 * app with no other way for a screen reader, or the responsive-pass probe
 * in this repo's own audit history, to know what is in it.
 */
function AccessibleClusterTable({
  clusters,
}: {
  clusters: readonly ClusterNode[];
}) {
  return (
    <div className="sr-only-focusable">
      <table>
        <caption>Every department, with its headcount and head</caption>
        <thead>
          <tr>
            <th scope="col">Department</th>
            <th scope="col">People</th>
            <th scope="col">Head</th>
          </tr>
        </thead>
        <tbody>
          {clusters.map((cluster) => (
            <tr key={cluster.id}>
              <th scope="row">{cluster.name}</th>
              <td>{cluster.headcount}</td>
              <td>{cluster.headName ?? "Not set"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
