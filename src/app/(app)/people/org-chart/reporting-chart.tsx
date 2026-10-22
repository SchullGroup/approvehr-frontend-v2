"use client";

import Link from "next/link";
import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronDown, ChevronUp, Minus, Plus } from "lucide-react";
import { Avatar, Button } from "@/components/ui";
import type { ApiOrgNode } from "@/lib/api/endpoints";
import { cn } from "@/lib/cn";
import {
  DEFAULT_OPEN_DEPTH,
  layoutChart,
  peopleShown,
  visibleFor,
  type ChartBox,
} from "./tree-layout";

/**
 * The reporting line, drawn as a chart: a card per person, joined to their
 * manager, top-down.
 *
 * The geometry is `tree-layout.ts` and this file only renders it. What lives
 * here is what a drawing needs that a list does not: panning, zooming, and
 * opening and closing branches so a company of three hundred is not three
 * hundred cards on arrival.
 *
 * ## Why it opens two levels deep
 *
 * The top person and their direct reports are the shape of the company; the
 * levels under that are detail somebody asks for. A closed manager carries a
 * chip with how many people it is hiding, so a closed branch is never mistaken
 * for a person with nobody below them. "Expand all" is there for the company
 * small enough to see whole, and a search opens the path to every match
 * regardless, because a match inside a closed branch is a match nobody can see.
 *
 * ## It is a scroller, and it says so to the keyboard
 *
 * The drawing is wider than the page for any company with more than a few
 * branches, so the box that holds it scrolls and is focusable: without
 * `tabIndex` the only way to reach the right-hand side is a mouse. A mouse can
 * also drag the background to pan, which is how every chart tool behaves;
 * touch already scrolls it.
 *
 * ## The view follows what the reader did
 *
 * Opening or closing one card reshapes the drawing, and a closed manager can
 * move into the column with its siblings, so the card under the pointer would
 * otherwise slide away mid-click. A chip click remembers where that card was on
 * screen and puts it back there once the new drawing is in place, as far as the
 * scroll box allows: a drawing that gets much smaller simply cannot scroll that
 * far, and the card lands at the edge instead. A bulk open or close and a new
 * search start again from the top person, because nothing the reader was looking
 * at is guaranteed to still be where it was.
 *
 * ## A card is one link, with a button that is not inside it
 *
 * The whole card opens the person's record, through the stretched link on their
 * name. The open/close chip is a sibling and sits above it, because a button
 * inside a link is invalid and breaks both.
 *
 * ## No pay
 *
 * `ApiOrgNode` carries none, and nothing here asks for any. `tests/org-chart-has-no-pay.test.ts`
 * reads this file as well as `chart.tsx`.
 */

const ZOOM_STEPS = [0.5, 0.65, 0.8, 1, 1.25] as const;
const MIN_FIT = 0.2;

const people = (count: number): string =>
  `${count.toLocaleString()} ${count === 1 ? "person" : "people"}`;

export function ReportingChart({
  roots,
  query,
}: {
  roots: readonly ApiOrgNode[];
  query: string;
}) {
  const needle = query.trim().toLowerCase();
  const [openDepth, setOpenDepth] = useState<number>(DEFAULT_OPEN_DEPTH);
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set());
  const [scale, setScale] = useState(1);

  const search = useMemo(
    () => (needle === "" ? null : visibleFor(roots, needle)),
    [roots, needle],
  );
  const layout = useMemo(
    () =>
      layoutChart({
        roots,
        openDepth,
        toggled,
        visible: search?.visible ?? null,
      }),
    [roots, openDepth, toggled, search],
  );
  const total = useMemo(
    () => roots.reduce((sum, root) => sum + 1 + root.totalBelow, 0),
    [roots],
  );

  /* ------------------------------------------------------- scroll and zoom */

  const viewport = useRef<HTMLDivElement>(null);
  const centred = useRef(false);
  const keep = useRef<{ cx: number; cy: number } | null>(null);
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  /* What to do with the scroll position once the next layout is on screen. */
  const after = useRef<
    | { kind: "keep"; id: string; dx: number; dy: number }
    | { kind: "reset" }
    | null
  >(null);
  const lastNeedle = useRef(needle);

  const onToggle = useCallback((id: string) => {
    /* Remember where the card being clicked is on screen, so that opening or
       closing it reshapes the drawing around that card rather than under it. */
    const el = viewport.current;
    const card = el
      ? Array.from(el.querySelectorAll<HTMLElement>("[data-box]")).find(
          (node) => node.dataset["box"] === id,
        )
      : undefined;
    if (el && card) {
      const at = card.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      after.current = {
        kind: "keep",
        id,
        dx: at.left - box.left,
        dy: at.top - box.top,
      };
    }
    setToggled((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const showEverything = (depth: number) => {
    after.current = { kind: "reset" };
    setOpenDepth(depth);
    setToggled(new Set());
  };

  /* Open on the top person, not on the left edge of a drawing whose top card is
     in the middle of it. Once: after that the reader's own scrolling wins. */
  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el || centred.current || layout.width === 0) return;
    centred.current = true;
    el.scrollLeft = Math.max(0, layout.rootCenter * scale - el.clientWidth / 2);
  }, [layout.rootCenter, layout.width, scale]);

  /* A new drawing, a new place to be. Opening or closing one card keeps that
     card where it was under the pointer. A bulk open or close, and a new
     search, start again from the top person, because nothing the reader was
     looking at is guaranteed to still be where it was. */
  useLayoutEffect(() => {
    const el = viewport.current;
    const wanted = after.current;
    after.current = null;
    const searched = lastNeedle.current !== needle;
    lastNeedle.current = needle;
    if (!el || layout.width === 0) return;

    if (wanted?.kind === "keep" && !searched) {
      const box = layout.boxes.find((candidate) => candidate.id === wanted.id);
      if (box) {
        el.scrollLeft = Math.max(0, box.x * scale + el.clientLeft - wanted.dx);
        el.scrollTop = Math.max(0, box.y * scale + el.clientTop - wanted.dy);
        return;
      }
    }
    if (wanted?.kind === "reset" || searched) {
      el.scrollLeft = Math.max(
        0,
        layout.rootCenter * scale - el.clientWidth / 2,
      );
      el.scrollTop = 0;
    }
  }, [layout, needle, scale]);

  /* Zooming keeps what was in the middle of the view in the middle, instead of
     leaving the reader somewhere in the top-left of a bigger drawing. */
  useLayoutEffect(() => {
    const el = viewport.current;
    const anchor = keep.current;
    if (!el || !anchor) return;
    keep.current = null;
    el.scrollLeft = Math.max(0, anchor.cx * scale - el.clientWidth / 2);
    el.scrollTop = Math.max(0, anchor.cy * scale - el.clientHeight / 2);
  }, [scale]);

  const zoomTo = (next: number, centreX?: number) => {
    const el = viewport.current;
    if (el) {
      keep.current = {
        cx: centreX ?? (el.scrollLeft + el.clientWidth / 2) / scale,
        cy: (el.scrollTop + el.clientHeight / 2) / scale,
      };
    }
    setScale(next);
  };

  const zoomIn = () => {
    const next = ZOOM_STEPS.find((step) => step > scale + 0.001);
    if (next !== undefined) zoomTo(next);
  };
  const zoomOut = () => {
    const next = [...ZOOM_STEPS].reverse().find((step) => step < scale - 0.001);
    if (next !== undefined) zoomTo(next);
  };
  const fit = () => {
    const el = viewport.current;
    if (!el || layout.width === 0) return;
    const wanted = Math.min(
      1,
      Math.max(MIN_FIT, (el.clientWidth - 2) / layout.width),
    );
    zoomTo(Math.round(wanted * 100) / 100, layout.width / 2);
  };

  const lastStep = ZOOM_STEPS[ZOOM_STEPS.length - 1] ?? 1;
  const firstStep = ZOOM_STEPS[0] ?? 1;

  /* ------------------------------------------------------------------- view */

  const searching = search !== null;
  const nobodyMatches = searching && search.visible.size === 0;
  const hasGroup = layout.boxes[0]?.kind === "group";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-body-sm text-muted" aria-live="polite">
          {searching
            ? `${String(search.matches.size)} ${search.matches.size === 1 ? "match" : "matches"}, with the people above them`
            : `Showing ${peopleShown(layout).toLocaleString()} of ${total.toLocaleString()} people`}
        </p>

        <div className="flex flex-wrap items-center gap-1">
          {!searching && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => showEverything(Number.POSITIVE_INFINITY)}
              >
                Expand all
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => showEverything(1)}
              >
                Collapse all
              </Button>
              <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
            </>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Zoom out"
            disabled={scale <= firstStep + 0.001}
            onClick={zoomOut}
          >
            <Minus aria-hidden="true" className="size-4" />
          </Button>
          <span
            className="min-w-12 text-center text-body-sm tabular-nums text-muted"
            aria-live="polite"
          >
            {Math.round(scale * 100)}%
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Zoom in"
            disabled={scale >= lastStep - 0.001}
            onClick={zoomIn}
          >
            <Plus aria-hidden="true" className="size-4" />
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={fit}>
            Fit to width
          </Button>
        </div>
      </div>

      {hasGroup && !searching && (
        <p className="text-body-sm text-muted">
          These people have no manager set on their record, so they hang from
          one card. Set a manager on each record and the chart fills in beneath
          them.
        </p>
      )}

      {nobodyMatches ? (
        <p className="text-body-sm text-muted">
          Nothing matches “{query.trim()}”.
        </p>
      ) : (
        <div
          ref={viewport}
          tabIndex={0}
          role="region"
          aria-label="Org chart. Use the arrow keys or drag to see more of it."
          className="cursor-grab overflow-auto rounded-lg md:max-h-[78vh] border border-line bg-canvas outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-text data-[panning=true]:cursor-grabbing data-[panning=true]:select-none"
          onPointerDown={(event) => {
            if (event.pointerType !== "mouse" || event.button !== 0) return;
            if ((event.target as HTMLElement).closest("a, button")) return;
            const el = event.currentTarget;
            drag.current = {
              x: event.clientX,
              y: event.clientY,
              left: el.scrollLeft,
              top: el.scrollTop,
            };
            el.setPointerCapture(event.pointerId);
            el.dataset["panning"] = "true";
          }}
          onPointerMove={(event) => {
            const start = drag.current;
            if (!start) return;
            const el = event.currentTarget;
            el.scrollLeft = start.left - (event.clientX - start.x);
            el.scrollTop = start.top - (event.clientY - start.y);
          }}
          onPointerUp={(event) => {
            drag.current = null;
            delete event.currentTarget.dataset["panning"];
          }}
          onPointerCancel={(event) => {
            drag.current = null;
            delete event.currentTarget.dataset["panning"];
          }}
        >
          <div
            style={{
              width: layout.width * scale,
              height: layout.height * scale,
            }}
          >
            <div
              className="relative origin-top-left"
              style={{
                width: layout.width,
                height: layout.height,
                transform: `scale(${String(scale)})`,
              }}
            >
              <svg
                width={layout.width}
                height={layout.height}
                aria-hidden="true"
                className="absolute left-0 top-0"
              >
                <path
                  d={layout.path}
                  fill="none"
                  strokeWidth={1.5}
                  className="stroke-line-strong"
                  transform="translate(0.5 0.5)"
                />
              </svg>
              {layout.boxes.map((box) => (
                <ChartCard
                  key={box.id}
                  box={box}
                  matched={searching && search.matches.has(box.id)}
                  onToggle={onToggle}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

const ChartCard = memo(function ChartCard({
  box,
  matched,
  onToggle,
}: {
  box: ChartBox;
  matched: boolean;
  onToggle: (id: string) => void;
}) {
  const place = { left: box.x, top: box.y, width: box.w, height: box.h };
  const person = box.person;

  if (box.kind === "group" || person === null) {
    return (
      <div
        style={place}
        data-box={box.id}
        className="absolute flex flex-col justify-center rounded-lg border border-dashed border-line-strong bg-surface px-4"
      >
        <p className="text-body-sm font-medium text-ink">No manager set</p>
        <p className="text-meta text-muted">{people(box.below)} in all</p>
      </div>
    );
  }

  const where = [person.department, person.workLocation]
    .filter((part): part is string => part !== null && part !== "")
    .join(" · ");

  return (
    <div
      style={place}
      data-box={box.id}
      className={cn(
        "absolute flex items-center gap-3 rounded-lg border px-3 shadow-xs transition-colors",
        "has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-accent-text",
        matched
          ? "border-accent-text bg-accent-soft"
          : "border-line bg-surface hover:border-line-strong",
      )}
    >
      <Avatar
        name={person.name}
        size="sm"
        tone={matched ? "accent" : "neutral"}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-sm font-medium text-ink">
          <Link
            href={`/people/${person.id}`}
            title={person.name}
            className="outline-none after:absolute after:inset-0 after:rounded-lg"
          >
            {person.name}
          </Link>
        </p>
        <p className="truncate text-meta text-muted" title={person.jobTitle}>
          {person.jobTitle}
        </p>
        <p className="truncate text-meta text-faint" title={where}>
          {where === "" ? "No department" : where}
        </p>
      </div>

      {box.toggleable && (
        <button
          type="button"
          onClick={() => onToggle(box.id)}
          aria-expanded={box.open}
          aria-label={
            box.open
              ? `Hide the people under ${person.name}`
              : `Show the ${people(box.below)} under ${person.name}`
          }
          style={{ left: box.connX }}
          className="absolute top-full z-10 flex h-6 -translate-x-1/2 -translate-y-1/4 items-center gap-1 rounded-full border border-line-strong bg-surface px-2 text-meta tabular-nums text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
        >
          {box.open ? (
            <ChevronUp aria-hidden="true" className="size-3.5" />
          ) : (
            <>
              <ChevronDown aria-hidden="true" className="size-3.5" />
              {box.below.toLocaleString()}
            </>
          )}
        </button>
      )}
    </div>
  );
});
