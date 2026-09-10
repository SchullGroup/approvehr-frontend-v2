"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Crown,
  Eye,
  EyeOff,
  GripVertical,
  Pencil,
  UserRound,
  Users,
} from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Input,
  Modal,
  Select,
  Skeleton,
  Stat,
  useToast,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { LoadFailure } from "@/components/portal/load-failure";
import {
  departments as departmentsApi,
  employees as employeesApi,
  type ApiDepartment,
  type ApiOrgChart,
} from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/client";
import { useCan } from "@/lib/permissions";
import { useSession } from "@/lib/store/session";
import { cn } from "@/lib/cn";
import {
  buildModel,
  depthLabel,
  pruneNode,
  subtreeIds,
  type ChartModel,
  type ChartNode,
  type ChartPerson,
} from "./model";
import { DragGhost, useDragInto } from "@/components/ui/drag-into";

/**
 * The org chart: who is where, and a way to change it.
 *
 * ## What was wrong with the last one
 *
 * It drew the reporting line, which is what an org chart is, and on the demo
 * company that produced a flat alphabetical list of 27 people under the
 * heading **"At the top — 27 — nobody above them"**. Honest and useless: the
 * company had not filled in `managerId` on anybody, so every person was a root.
 * The product owner's words were "this is not useful information", and the
 * diagnosis is that the screen depended on the one field a new company is least
 * likely to have set.
 *
 * Departments almost always exist — the setup wizard asks, the importer maps
 * them, payroll reports by them. So the **department tree is the structure**
 * and the reporting line is a line of detail on each person. See `model.ts`.
 *
 * ## It edits, and the writes are the ones the model already had
 *
 * Nothing here needed a new endpoint. Re-parenting is `POST
 * /departments/:id/move`, the head is `PATCH /departments/:id`, hiding is the
 * archive that has always existed, and moving somebody is `POST
 * /departments/:id/employees`. What was missing was a screen where those four
 * are one act each rather than four screens.
 *
 * ## Two ways to move something, and the keyboard one is not a fallback
 *
 * Dragging is the direct one and it is what the product owner asked for. Every
 * draggable thing also has a **Move** button that opens a picker, and that is
 * the path that works with a keyboard, a screen reader, a trackpad somebody
 * finds hard, and a 200-department company where the target is three screens
 * away. `assign-people-dialog.tsx` argues selection over drag for *bulk* moves
 * and is right; this is one thing at a time, where dragging is the better verb
 * and the picker is the better safety net.
 *
 * ## Truncation, because a real company does not fit
 *
 * A department shows six people and says how many more there are. The demo has
 * 27 in one; a real customer has three hundred. Expanding is per department and
 * remembered while the page is open, so opening one does not open all of them.
 *
 * ## No money on this screen at all
 *
 * The org-chart payload carries no pay at any permission, and this screen no
 * longer renders the department total either — even for a reader who holds
 * `VIEW_SALARIES` and could see it.
 *
 * The gate was working: `payrollKobo` arrives null without the permission, so
 * a colleague never saw it. The reason it is gone anyway is what a total means
 * on a *small* department. "1 person here · ₦550,000.00 a month" is not an
 * aggregate — **it is that person's salary, printed next to their name**, and
 * two people is a subtraction away. An org chart is the one screen that gets
 * put on a projector, screenshared in a standup and read over a shoulder, so
 * the reader holding the permission is not the only person who ends up seeing
 * it.
 *
 * Department cost still exists, on `/people/departments`, which is a screen
 * somebody opens to look at cost. Nothing is lost; it is asked for rather than
 * ambient.
 *
 * `walk-payroll` found pay riding along on the "an org chart is not
 * privileged" argument in three separate API routes. This is the fourth
 * instance of the same mistake, one layer up: the payload was clean and the
 * screen put the money back.
 */

const SHOWN_BY_DEFAULT = 6;

export function OrgChartScreen() {
  const { isConnected } = useSession();
  const toast = useToast();

  /* The same split the API makes: changing the shape of the company is
     `MANAGE_SETTINGS`, moving a person between departments is `EDIT_RECORDS`.
     A reader with neither gets the chart and no controls — absent, not
     disabled, which is the rule everywhere else in this product. */
  const canStructure = useCan("MANAGE_SETTINGS");
  const canMovePeople = useCan("EDIT_RECORDS");
  const canArrange = canStructure || canMovePeople;

  const [arranging, setArranging] = useState(false);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [showHidden, setShowHidden] = useState(false);
  const [reloadAt, setReloadAt] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [picking, setPicking] = useState<
    | { kind: "person"; person: ChartPerson }
    | { kind: "department"; node: ChartNode }
    | { kind: "head"; node: ChartNode }
    | null
  >(null);

  /**
   * Staleness by comparing a key during render, never `setLoading(true)` inside
   * the effect — that is a synchronous setState in an effect, which cascades a
   * render for nothing and is what `npm run check` refuses. Same shape as
   * `lib/store/shifts.ts`.
   */
  const key = String(reloadAt);
  const [fetched, setFetched] = useState<{
    key: string;
    chart: ApiOrgChart | null;
    tree: ApiDepartment[];
    flat: ApiDepartment[];
    error: Error | null;
  } | null>(null);

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        /* Two requests, in parallel, and never one per department — a company
           with thirty of them would otherwise cost thirty round trips to draw
           one screen. `includeArchived` so the hidden ones can be offered back. */
        const [chart, departments] = await Promise.all([
          employeesApi.orgChart(controller.signal),
          departmentsApi.tree(true, controller.signal),
        ]);
        if (!cancelled) {
          setFetched({
            key,
            chart,
            tree: departments.tree,
            flat: departments.flat as ApiDepartment[],
            error: null,
          });
        }
      } catch (caught) {
        if (cancelled) return;
        if (caught instanceof DOMException && caught.name === "AbortError")
          return;
        setFetched({
          key,
          chart: null,
          tree: [],
          flat: [],
          error: caught instanceof Error ? caught : new Error(String(caught)),
        });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, key]);

  const loading = fetched === null || fetched.key !== key;
  const error = fetched?.error ?? null;

  const model: ChartModel | null = useMemo(() => {
    if (!fetched?.chart) return null;
    return buildModel(fetched.chart, fetched.tree, fetched.flat);
  }, [fetched]);

  const needle = query.trim().toLowerCase();
  const shown = useMemo(() => {
    if (!model) return [];
    if (needle === "") return model.roots;
    return model.roots
      .map((node) => pruneNode(node, needle))
      .filter((node): node is ChartNode => node !== null);
  }, [model, needle]);

  /* ------------------------------------------------------------------ writes */

  const reload = useCallback(() => setReloadAt((n) => n + 1), []);

  const run = useCallback(
    async (what: string, label: string, action: () => Promise<unknown>) => {
      setBusy(what);
      try {
        await action();
        toast.push({ title: label, tone: "success" });
        reload();
      } catch (caught) {
        toast.push({
          title:
            caught instanceof ApiError
              ? caught.message
              : "That did not save. Try again in a moment.",
          tone: "danger",
        });
      } finally {
        setBusy(null);
      }
    },
    [reload, toast],
  );

  const movePerson = useCallback(
    (person: ChartPerson, departmentId: string) => {
      const target = model?.flat.find((d) => d.id === departmentId);
      return run(
        person.id,
        `${person.name} moved to ${target?.name ?? "the department"}`,
        () => departmentsApi.assign(departmentId, [person.id]),
      );
    },
    [model, run],
  );

  const moveDepartment = useCallback(
    (node: ChartNode, parentId: string | null) => {
      const target = parentId
        ? model?.flat.find((d) => d.id === parentId)
        : null;
      return run(
        node.department.id,
        parentId === null
          ? `${node.department.name} is now a top-level department`
          : `${node.department.name} moved under ${target?.name ?? "it"}`,
        () => departmentsApi.move(node.department.id, parentId),
      );
    },
    [model, run],
  );

  /* One handler for both kinds, because `useDragInto` does not know what a
     department is — see its header. */
  const onDrop = useCallback(
    (moved: { id: string; kind: string }, targetId: string) => {
      if (!model) return;
      if (moved.kind === "person") {
        const person = [
          ...model.roots.flatMap(peopleIn),
          ...model.unplaced,
        ].find((candidate) => candidate.id === moved.id);
        if (person) void movePerson(person, targetId);
        return;
      }
      const node = findNode(model.roots, moved.id);
      if (node) void moveDepartment(node, targetId === "top" ? null : targetId);
    },
    [model, movePerson, moveDepartment],
  );

  const canDrop = useCallback(
    (moved: { id: string; kind: string }, targetId: string) => {
      if (!model) return false;
      if (moved.kind === "person") return targetId !== "top" && canMovePeople;
      if (!canStructure) return false;
      if (targetId === "top") {
        const node = findNode(model.roots, moved.id);
        /* Already top-level: the move would be a no-op, and a target that
           lights up for nothing teaches people the highlight means nothing. */
        return node !== null && node.department.depth > 0;
      }
      const node = findNode(model.roots, moved.id);
      if (!node) return false;
      /* Its own subtree is refused before it lights up. The API refuses it too,
         and offering a move only to have it come back refused is the dead
         control this codebase keeps removing. */
      return !subtreeIds(node).has(targetId);
    },
    [model, canMovePeople, canStructure],
  );

  const { drag, start } = useDragInto({ onDrop, canDrop });

  /* -------------------------------------------------------------------- gates */

  if (!isConnected) {
    return (
      <>
        <PageHeader title="Org chart" />
        <PageBody>
          <EmptyState
            icon={<Users aria-hidden="true" />}
            title="The org chart needs the API"
            description="It is built from the departments and the reporting line on everybody's record, which only exist on a server."
          />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Org chart"
        action={
          canArrange && model !== null ? (
            <Button
              type="button"
              variant={arranging ? "accent" : "secondary"}
              size="sm"
              onClick={() => setArranging((on) => !on)}
            >
              <Pencil aria-hidden="true" className="size-3.5" />
              {arranging ? "Done arranging" : "Arrange"}
            </Button>
          ) : undefined
        }
      />

      <PageBody className="flex flex-col gap-6">
        {loading && !model ? (
          <Skeleton className="h-72 w-full" />
        ) : error ? (
          <LoadFailure subject="the org chart" error={error} onRetry={reload} />
        ) : !model ||
          (model.roots.length === 0 && model.unplaced.length === 0) ? (
          <EmptyState
            icon={<Building2 aria-hidden="true" />}
            title="There is nobody to chart yet"
            description="Add people and departments and the shape of the company appears here."
          />
        ) : (
          <>
            <div className="grid grid-cols-12 gap-4">
              <Stat
                className="col-span-12 sm:col-span-6 xl:col-span-3"
                label="People"
                value={model.people.toLocaleString()}
                icon={<UserRound aria-hidden="true" />}
              />
              <Stat
                className="col-span-12 sm:col-span-6 xl:col-span-3"
                label="Departments"
                value={model.flat.length.toLocaleString()}
                {...(model.hidden.length > 0
                  ? { hint: `${String(model.hidden.length)} hidden` }
                  : {})}
                icon={<Building2 aria-hidden="true" />}
              />
              <Stat
                className="col-span-12 sm:col-span-6 xl:col-span-3"
                label="Not in a department"
                value={model.unplaced.length.toLocaleString()}
                {...(model.unplaced.length > 0
                  ? { hint: "they appear at the bottom" }
                  : { hint: "everybody is placed" })}
              />
              {/* Replaces "At the top — nobody above them", which read as 27 of
                  27 on a company that had simply not set anybody's manager.
                  This says the same fact as something somebody can act on. */}
              <Stat
                className="col-span-12 sm:col-span-6 xl:col-span-3"
                label="Without a manager"
                value={model.withoutManager.toLocaleString()}
                {...(model.withoutManager === model.people && model.people > 0
                  ? { hint: "nobody has one set yet" }
                  : { hint: "set on their record" })}
              />
            </div>

            {fetched?.chart && fetched.chart.detached.length > 0 && (
              /* Named rather than quietly straightened out. A loop is somebody's
                 record being wrong, and only a person can say which link is the
                 mistake. */
              <Callout
                tone="warning"
                title="Some reporting lines loop back on themselves"
              >
                {fetched.chart.detached.map((person) => person.name).join(", ")}{" "}
                —{" "}
                {fetched.chart.detached.length === 1
                  ? "this person reports"
                  : "these people report"}{" "}
                into a circle, so they are shown without a manager until
                somebody corrects who they report to.
              </Callout>
            )}

            {arranging && (
              <Callout tone="info" title="Arranging">
                Drag a person onto a department to move them, or drag a
                department onto another to nest it. Every change saves as you
                make it. The <strong>Move</strong> button beside each one does
                the same thing without a mouse.
              </Callout>
            )}

            <div className="max-w-sm">
              <Input
                value={query}
                placeholder="Find a person, a job title or a department"
                aria-label="Search the org chart"
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>

            {shown.length === 0 && needle !== "" ? (
              <p className="text-body-sm text-muted">
                Nothing matches “{query.trim()}”.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {/* Where a nested department is dropped to become top-level.
                    Only while arranging and only when something is in the hand,
                    because an always-present strip is furniture. */}
                {arranging && drag?.kind === "department" && (
                  <div
                    data-drop-id="top"
                    className={cn(
                      "rounded-lg border-2 border-dashed p-3 text-center text-body-sm transition-colors",
                      drag.over === "top"
                        ? "border-accent-text bg-accent-soft text-accent-text"
                        : "border-line text-muted",
                    )}
                  >
                    Drop here to make it a top-level department
                  </div>
                )}

                {shown.map((node) => (
                  <DepartmentCard
                    key={node.department.id}
                    node={node}
                    depth={0}
                    model={model}
                    arranging={arranging}
                    canStructure={canStructure}
                    canMovePeople={canMovePeople}
                    busy={busy}
                    dragOver={drag?.over ?? null}
                    dragging={drag?.id ?? null}
                    onDragStart={start}
                    collapsed={collapsed}
                    onToggle={(id) =>
                      setCollapsed((current) => {
                        const next = new Set(current);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      })
                    }
                    expanded={expanded}
                    onExpand={(id) =>
                      setExpanded((current) => new Set(current).add(id))
                    }
                    onPick={setPicking}
                    onHide={(target) =>
                      void run(
                        target.department.id,
                        `${target.department.name} hidden`,
                        () => departmentsApi.archive(target.department.id),
                      )
                    }
                  />
                ))}

                {model.unplaced.length > 0 && (
                  <UnplacedCard
                    people={model.unplaced}
                    arranging={arranging}
                    canMovePeople={canMovePeople}
                    busy={busy}
                    dragging={drag?.id ?? null}
                    onDragStart={start}
                    expanded={expanded.has("unplaced")}
                    onExpand={() =>
                      setExpanded((current) => new Set(current).add("unplaced"))
                    }
                    onPick={setPicking}
                  />
                )}
              </div>
            )}

            {model.hidden.length > 0 && (
              <Card>
                <CardHeader
                  title={`${String(model.hidden.length)} hidden ${model.hidden.length === 1 ? "department" : "departments"}`}
                  level={3}
                  description="Kept, not deleted — past payslips reference the department somebody was in at the time."
                  action={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowHidden((on) => !on)}
                    >
                      {showHidden ? (
                        <EyeOff aria-hidden="true" className="size-3.5" />
                      ) : (
                        <Eye aria-hidden="true" className="size-3.5" />
                      )}
                      {showHidden ? "Hide these" : "Show these"}
                    </Button>
                  }
                />
                {showHidden && (
                  <CardBody className="flex flex-col gap-2">
                    {model.hidden.map((department) => (
                      <div
                        key={department.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-3"
                      >
                        <span className="min-w-0">
                          <span className="text-body-sm font-medium text-ink">
                            {department.name}
                          </span>
                          <span className="ml-2 text-meta text-muted">
                            {department.totalEmployees}{" "}
                            {department.totalEmployees === 1
                              ? "person"
                              : "people"}
                          </span>
                        </span>
                        {canStructure && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={busy === department.id}
                            onClick={() =>
                              void run(
                                department.id,
                                `${department.name} is showing again`,
                                () => departmentsApi.restore(department.id),
                              )
                            }
                          >
                            Show it again
                          </Button>
                        )}
                      </div>
                    ))}
                  </CardBody>
                )}
              </Card>
            )}
          </>
        )}
      </PageBody>

      {/* The keyboard path, and the one that works when the target is three
          screens away. Same writes as the drag. */}
      {picking !== null && model !== null && (
        <MoveDialog
          picking={picking}
          model={model}
          onClose={() => setPicking(null)}
          onMovePerson={(person, departmentId) => {
            setPicking(null);
            void movePerson(person, departmentId);
          }}
          onMoveDepartment={(node, parentId) => {
            setPicking(null);
            void moveDepartment(node, parentId);
          }}
          onSetHead={(node, headId) => {
            setPicking(null);
            void run(
              node.department.id,
              headId === null
                ? `${node.department.name} has no head`
                : `${node.department.name}'s head updated`,
              () => departmentsApi.update(node.department.id, { headId }),
            );
          }}
        />
      )}

      {/* What is in the hand. `DragGhost` owns `pointer-events: none`, which is
          the detail that silently breaks every drop if it is ever dropped. */}
      {drag && (
        <DragGhost x={drag.x} y={drag.y}>
          Moving…
        </DragGhost>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

function DepartmentCard({
  node,
  depth,
  model,
  arranging,
  canStructure,
  canMovePeople,
  busy,
  dragOver,
  dragging,
  onDragStart,
  collapsed,
  onToggle,
  expanded,
  onExpand,
  onPick,
  onHide,
}: {
  node: ChartNode;
  depth: number;
  model: ChartModel;
  arranging: boolean;
  canStructure: boolean;
  canMovePeople: boolean;
  busy: string | null;
  dragOver: string | null;
  dragging: string | null;
  onDragStart: (
    id: string,
    kind: string,
  ) => (event: React.PointerEvent<HTMLElement>) => void;
  collapsed: ReadonlySet<string>;
  onToggle: (id: string) => void;
  expanded: ReadonlySet<string>;
  onExpand: (id: string) => void;
  onPick: (
    picking:
      | { kind: "person"; person: ChartPerson }
      | { kind: "department"; node: ChartNode }
      | { kind: "head"; node: ChartNode },
  ) => void;
  onHide: (node: ChartNode) => void;
}) {
  const { department } = node;
  const open = !collapsed.has(department.id);
  const isOver = dragOver === department.id;
  const isDragging = dragging === department.id;
  const showAll = expanded.has(department.id);
  const people = showAll ? node.people : node.people.slice(0, SHOWN_BY_DEFAULT);
  const more = node.people.length - people.length;

  return (
    <div
      data-drop-id={department.id}
      className={cn(
        "rounded-lg border bg-surface transition-colors",
        isOver ? "border-accent-text bg-accent-soft" : "border-line",
        isDragging && "ahr-sortable-lifted opacity-70",
      )}
      style={depth > 0 ? { marginLeft: 20 } : undefined}
    >
      <div className="flex flex-wrap items-start gap-2 p-3">
        {arranging && canStructure && (
          <button
            type="button"
            aria-label={`Move ${department.name}`}
            onPointerDown={onDragStart(department.id, "department")}
            className="mt-0.5 flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-faint hover:bg-canvas hover:text-muted active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
          >
            <GripVertical aria-hidden="true" className="size-4" />
          </button>
        )}

        <button
          type="button"
          onClick={() => onToggle(department.id)}
          aria-expanded={open}
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
        >
          {open ? (
            <ChevronDown aria-hidden="true" className="size-4" />
          ) : (
            <ChevronRight aria-hidden="true" className="size-4" />
          )}
          <span className="sr-only">
            {open ? `Collapse ${department.name}` : `Expand ${department.name}`}
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-body-md font-medium text-ink">
              {department.name}
            </span>
            <Badge tone="neutral" size="sm">
              {depthLabel(department.depth)}
            </Badge>
            {department.costCentre !== null && (
              <span className="text-meta text-faint">
                {department.costCentre}
              </span>
            )}
          </p>

          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-muted">
            {/* The head is the answer to "who runs this", so it leads. Absent
                is said in words rather than left blank. */}
            <span className="flex items-center gap-1.5">
              <Crown aria-hidden="true" className="size-3.5 text-faint" />
              {department.headName ?? "No head"}
            </span>
            <span>
              {department.directEmployees}{" "}
              {department.directEmployees === 1 ? "person here" : "people here"}
              {department.totalEmployees !== department.directEmployees &&
                ` · ${String(department.totalEmployees)} including below`}
            </span>
          </p>
        </div>

        {arranging && canStructure && (
          <div className="flex shrink-0 flex-wrap gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onPick({ kind: "head", node })}
            >
              Set head
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onPick({ kind: "department", node })}
            >
              Move
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy === department.id}
              onClick={() => onHide(node)}
            >
              Hide
            </Button>
          </div>
        )}
      </div>

      {open && (
        <div className="flex flex-col gap-2 border-t border-line p-3">
          {node.people.length === 0 ? (
            <p className="text-body-sm text-muted">
              Nobody is in this department
              {node.children.length > 0 ? " directly." : " yet."}
            </p>
          ) : (
            <>
              {people.map((person) => (
                <PersonRow
                  key={person.id}
                  person={person}
                  arranging={arranging}
                  canMovePeople={canMovePeople}
                  isHead={person.name === department.headName}
                  busy={busy}
                  dragging={dragging}
                  onDragStart={onDragStart}
                  onPick={onPick}
                />
              ))}
              {more > 0 && (
                <button
                  type="button"
                  onClick={() => onExpand(department.id)}
                  className="self-start text-body-sm font-medium text-accent-text underline-offset-4 hover:underline"
                >
                  Show all {node.people.length} in {department.name}
                </button>
              )}
            </>
          )}

          {node.children.map((child) => (
            <DepartmentCard
              key={child.department.id}
              node={child}
              depth={depth + 1}
              model={model}
              arranging={arranging}
              canStructure={canStructure}
              canMovePeople={canMovePeople}
              busy={busy}
              dragOver={dragOver}
              dragging={dragging}
              onDragStart={onDragStart}
              collapsed={collapsed}
              onToggle={onToggle}
              expanded={expanded}
              onExpand={onExpand}
              onPick={onPick}
              onHide={onHide}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PersonRow({
  person,
  arranging,
  canMovePeople,
  isHead,
  busy,
  dragging,
  onDragStart,
  onPick,
}: {
  person: ChartPerson;
  arranging: boolean;
  canMovePeople: boolean;
  isHead: boolean;
  busy: string | null;
  dragging: string | null;
  onDragStart: (
    id: string,
    kind: string,
  ) => (event: React.PointerEvent<HTMLElement>) => void;
  onPick: (picking: { kind: "person"; person: ChartPerson }) => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-md border border-line px-3 py-2",
        dragging === person.id && "ahr-sortable-lifted opacity-70",
        busy === person.id && "opacity-60",
      )}
    >
      {arranging && canMovePeople && (
        <button
          type="button"
          aria-label={`Move ${person.name}`}
          onPointerDown={onDragStart(person.id, "person")}
          className="flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-faint hover:text-muted active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
        >
          <GripVertical aria-hidden="true" className="size-3.5" />
        </button>
      )}

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-body-sm">
          <span className="font-medium text-ink">{person.name}</span>
          <span className="text-muted">{person.jobTitle}</span>
          {isHead && (
            <Badge tone="accent" size="sm">
              Head
            </Badge>
          )}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-meta text-faint">
          <span>{person.employeeNo}</span>
          {/* The reporting line, as detail rather than as structure. "No
              manager" is said plainly: it is the fact somebody acts on, and it
              is true of a whole company that has not filled it in. */}
          <span>
            {person.managerName === null
              ? "No manager"
              : `Reports to ${person.managerName}`}
          </span>
          {person.totalBelow > 0 && (
            <span>
              {person.totalBelow}{" "}
              {person.totalBelow === 1 ? "person" : "people"} below
            </span>
          )}
          {person.workLocation !== null && <span>{person.workLocation}</span>}
        </p>
      </div>

      {arranging && canMovePeople && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy === person.id}
          onClick={() => onPick({ kind: "person", person })}
        >
          Move
        </Button>
      )}
    </div>
  );
}

function UnplacedCard({
  people,
  arranging,
  canMovePeople,
  busy,
  dragging,
  onDragStart,
  expanded,
  onExpand,
  onPick,
}: {
  people: ChartPerson[];
  arranging: boolean;
  canMovePeople: boolean;
  busy: string | null;
  dragging: string | null;
  onDragStart: (
    id: string,
    kind: string,
  ) => (event: React.PointerEvent<HTMLElement>) => void;
  expanded: boolean;
  onExpand: () => void;
  onPick: (picking: { kind: "person"; person: ChartPerson }) => void;
}) {
  const shown = expanded ? people : people.slice(0, SHOWN_BY_DEFAULT);
  const more = people.length - shown.length;

  return (
    <Card>
      <CardHeader
        title="Not in a department"
        level={3}
        description={
          arranging
            ? "Drag somebody onto a department above, or use Move."
            : "These people are on the payroll and belong to no department yet."
        }
        action={
          <Badge tone="warning" size="sm">
            {people.length} {people.length === 1 ? "person" : "people"}
          </Badge>
        }
      />
      <CardBody className="flex flex-col gap-2">
        {shown.map((person) => (
          <PersonRow
            key={person.id}
            person={person}
            arranging={arranging}
            canMovePeople={canMovePeople}
            isHead={false}
            busy={busy}
            dragging={dragging}
            onDragStart={onDragStart}
            onPick={onPick}
          />
        ))}
        {more > 0 && (
          <button
            type="button"
            onClick={onExpand}
            className="self-start text-body-sm font-medium text-accent-text underline-offset-4 hover:underline"
          >
            Show all {people.length}
          </button>
        )}
      </CardBody>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The picker behind every **Move** and **Set head**.
 *
 * A `Select` and one button, not a search-and-multi-select: this moves one
 * thing, and the list it chooses from is the company's own departments, which
 * is a list somebody recognises. Bulk moves already have a screen —
 * `/people/departments` and its assign dialog — and duplicating it here would
 * be a second way to do one thing.
 */
function MoveDialog({
  picking,
  model,
  onClose,
  onMovePerson,
  onMoveDepartment,
  onSetHead,
}: {
  picking:
    | { kind: "person"; person: ChartPerson }
    | { kind: "department"; node: ChartNode }
    | { kind: "head"; node: ChartNode };
  model: ChartModel;
  onClose: () => void;
  onMovePerson: (person: ChartPerson, departmentId: string) => void;
  onMoveDepartment: (node: ChartNode, parentId: string | null) => void;
  onSetHead: (node: ChartNode, headId: string | null) => void;
}) {
  const [choice, setChoice] = useState("");

  if (picking.kind === "head") {
    /* Only people already in the department. A head who is not in the unit is
       a shape the manager view cannot render — `Department.headId` drives "a
       head sees everyone beneath them", and somebody outside it sees a set
       they are not part of. */
    const candidates = picking.node.people;
    return (
      <Modal
        open
        onClose={onClose}
        title={`Who leads ${picking.node.department.name}?`}
        description="A head sees everybody beneath them, which is a wider set than their own direct reports."
      >
        <div className="flex flex-col gap-4">
          {candidates.length === 0 ? (
            <p className="text-body-sm text-muted">
              Nobody is in this department yet, so there is nobody to lead it.
              Move somebody in first.
            </p>
          ) : (
            <Select
              value={choice}
              aria-label="Head of department"
              onChange={(event) => setChoice(event.target.value)}
            >
              <option value="">Nobody</option>
              {candidates.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name} · {person.jobTitle}
                </option>
              ))}
            </Select>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="accent"
              size="sm"
              disabled={candidates.length === 0}
              onClick={() =>
                onSetHead(picking.node, choice === "" ? null : choice)
              }
            >
              Save
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  if (picking.kind === "person") {
    return (
      <Modal
        open
        onClose={onClose}
        title={`Move ${picking.person.name}`}
        description="This changes the department on their record, which is what payroll reports by."
      >
        <div className="flex flex-col gap-4">
          <Select
            value={choice}
            aria-label="Department"
            onChange={(event) => setChoice(event.target.value)}
          >
            <option value="">Choose a department</option>
            {model.flat.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </Select>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="accent"
              size="sm"
              disabled={choice === ""}
              onClick={() => onMovePerson(picking.person, choice)}
            >
              Move them
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  const forbidden = subtreeIds(picking.node);
  const targets = model.flat.filter(
    (department) => !forbidden.has(department.id),
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={`Move ${picking.node.department.name}`}
      description="Everything under it moves with it. A department cannot go inside itself."
    >
      <div className="flex flex-col gap-4">
        <Select
          value={choice}
          aria-label="New parent department"
          onChange={(event) => setChoice(event.target.value)}
        >
          <option value="">Top level — no parent</option>
          {targets.map((department) => (
            <option key={department.id} value={department.id}>
              Inside {department.name}
            </option>
          ))}
        </Select>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="accent"
            size="sm"
            onClick={() =>
              onMoveDepartment(picking.node, choice === "" ? null : choice)
            }
          >
            Move it
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

/** Everybody in a node's subtree. Used to resolve a dropped person's record. */
function peopleIn(node: ChartNode): ChartPerson[] {
  return [...node.people, ...node.children.flatMap(peopleIn)];
}

function findNode(nodes: readonly ChartNode[], id: string): ChartNode | null {
  for (const node of nodes) {
    if (node.department.id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
  return null;
}
