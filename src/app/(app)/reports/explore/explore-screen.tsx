"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { Maximize2, Orbit, X } from "lucide-react";
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
import { LENS_COLORS, type Lens } from "./lens-data";
import { ExploreLegend } from "./legend";
import { useReducedMotion, useWebGLSupport } from "./use-3d-support";
import { useLenses, useWorkforceHeadline } from "./use-lenses";

/**
 * The workforce explorer: the department tree as a navigable 3D space. See
 * `/Users/mac/.claude/plans/lexical-wobbling-map.md` for the full phasing.
 * Phase 0 shipped headcount only; Phase 1 added the goal-achievement and
 * composite-score lenses; Phase 2 added task-logging intensity; Phase 3
 * added the two comparative reads — best performer and promotion-readiness
 * — completing the plan. Every lens has landed the same way: on top of this
 * same scene and this same data source, without ever moving a single
 * cluster. The fullscreen view, the legend and the headline banner below
 * are a later pass on top of that finished plan, not a new phase of it.
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
  const headline = useWorkforceHeadline();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeLens, setActiveLens] = useState<LensChoice>("headcount");
  const [fullscreen, setFullscreen] = useState(false);
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
  const activeLensObject: Lens | null =
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

  const canRenderScene =
    !checking && !error && clusters.length > 0 && webglSupported !== false;

  return (
    <>
      <PageHeader
        title="Explore"
        description="Every department in one space. Drag to orbit, click a cluster to open it."
      />

      <PageBody className="flex flex-col gap-4">
        {headline && headline.rule !== "none" && (
          <Callout
            tone={headline.rule === "promotion-ready" ? "success" : "danger"}
            title="Worth a look this cycle"
          >
            {headline.sentence}
          </Callout>
        )}

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
            <Card className="relative h-[34rem] overflow-hidden p-0">
              <ClusterScene
                clusters={clusters}
                selectedId={selectedId}
                onSelect={setSelectedId}
                reducedMotion={reducedMotion}
                colorByName={colorByName}
              />
              <button
                type="button"
                onClick={() => setFullscreen(true)}
                aria-label="Open fullscreen"
                className="absolute right-3 top-3 inline-flex size-9 items-center justify-center rounded-full border border-line bg-surface text-muted shadow-sm hover:text-ink"
              >
                <Maximize2 aria-hidden="true" className="size-4" />
              </button>
              <div className="pointer-events-none absolute bottom-3 left-3 right-3">
                <ExploreLegend
                  activeLens={activeLensObject}
                  className="pointer-events-auto rounded-lg border border-line bg-surface/90 px-3 py-1.5 shadow-sm backdrop-blur"
                />
              </div>
            </Card>
          </>
        )}

        <AccessibleClusterTable clusters={clusters} />
      </PageBody>

      {fullscreen && canRenderScene && (
        <FullscreenExplorer
          clusters={clusters}
          selectedId={selectedId}
          onSelect={setSelectedId}
          reducedMotion={reducedMotion}
          colorByName={colorByName}
          lensOptions={lensOptions}
          activeLens={activeLens}
          onLensChange={setActiveLens}
          activeLensObject={activeLensObject}
          onExit={() => setFullscreen(false)}
        />
      )}

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
                        className="text-body-sm text-accent-text hover:underline"
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
 * The same scene, taking over the whole viewport — no sidebar, no header,
 * nothing but the space and the controls to read it. Portalled to
 * `document.body` at `z-40`, the same door `components/ui/modal.tsx` uses
 * for the Drawer and every dialog in this app, one layer below the Drawer's
 * own `z-50` so clicking a cluster while fullscreen still opens its detail
 * on top of the scene rather than underneath it.
 *
 * A hard-coded dark ground rather than this app's own light/dark theme
 * tokens: the point of fullscreen is the scene, and a fixed, deliberately
 * immersive background reads as a considered choice precisely because it
 * does not change with the viewer's own theme setting — the same reasoning
 * `artifact-design`-style guidance gives a page that commits to one visual
 * world. The lens palette was designed to read clearly against it.
 */
function FullscreenExplorer({
  clusters,
  selectedId,
  onSelect,
  reducedMotion,
  colorByName,
  lensOptions,
  activeLens,
  onLensChange,
  activeLensObject,
  onExit,
}: {
  clusters: readonly ClusterNode[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  reducedMotion: boolean;
  colorByName: ReadonlyMap<string, string> | undefined;
  lensOptions: { value: LensChoice; label: string }[];
  activeLens: LensChoice;
  onLensChange: (value: LensChoice) => void;
  activeLensObject: Lens | null;
  onExit: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onExit();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onExit]);

  return createPortal(
    <div className="fixed inset-0 z-40 bg-[#0b1220]">
      <ClusterScene
        clusters={clusters}
        selectedId={selectedId}
        onSelect={onSelect}
        reducedMotion={reducedMotion}
        colorByName={colorByName}
      />

      <button
        type="button"
        onClick={onExit}
        aria-label="Exit fullscreen"
        className="absolute right-4 top-4 z-10 inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20"
      >
        <X aria-hidden="true" className="size-5" />
      </button>

      {lensOptions.length > 1 && (
        /* `right-16` — not a bare `left-4` — bounds this to a width the
           exit button can never sit under: `SegmentedControl` wraps its own
           options (it already has to, for a phone-width screen with six
           lenses on offer), and an unbounded-width wrapper let "Goal
           achievement" grow wide enough to sit on top of the one button
           that closes this view, on exactly the narrow screen where
           wrapping existed to help in the first place. */
        <div className="absolute left-4 right-16 top-4 drop-shadow-lg">
          <SegmentedControl
            label="Colour by"
            options={lensOptions}
            value={activeLens}
            onChange={onLensChange}
          />
        </div>
      )}

      <div className="pointer-events-none absolute bottom-4 left-4 right-4 flex justify-center">
        <ExploreLegend
          activeLens={activeLensObject}
          className="pointer-events-auto rounded-full bg-white/10 px-4 py-2 text-white/90 backdrop-blur"
        />
      </div>
    </div>,
    document.body,
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
