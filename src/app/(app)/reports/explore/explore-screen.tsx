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
  Skeleton,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { LoadFailure } from "@/components/portal/load-failure";
import { useDepartments } from "@/lib/store/departments";
import { layoutClusters, type ClusterNode } from "./cluster-data";
import { useReducedMotion, useWebGLSupport } from "./use-3d-support";

/**
 * Phase 0 of the workforce explorer: the department tree as a navigable 3D
 * space, headcount the only dimension. See `/Users/mac/.claude/plans/
 * lexical-wobbling-map.md` for the full phasing — lenses, task-completion
 * intensity, and the two comparative reads (best-in-department, promotion
 * readiness) all land later, on top of this same scene and this same data
 * source, without moving a single cluster.
 *
 * `useDepartments(false)` — not `ChartModel`/`buildModel()` from the org
 * chart — is the data source. The org chart's own model needs `ApiOrgChart`
 * for the reporting line, which has no demo-mode equivalent, so building on
 * it would have made this screen connected-mode-only despite the plan's own
 * claim that Phase 0 is fully demoable offline. `useDepartments()` is the
 * same department tree — headcount, head, children, depth — already proven
 * in both modes by `/people/departments`, and it is all Phase 0 needs: no
 * lens here reads the reporting line.
 */
const ClusterScene = dynamic(
  () => import("./cluster-scene").then((module) => module.ClusterScene),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[34rem] w-full rounded-xl" />,
  },
);

export function ExploreScreen() {
  const { tree, loading, error, source, demoNote, reload } =
    useDepartments(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
          <Card className="h-[34rem] overflow-hidden p-0">
            <ClusterScene
              clusters={clusters}
              selectedId={selectedId}
              onSelect={setSelectedId}
              reducedMotion={reducedMotion}
            />
          </Card>
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
