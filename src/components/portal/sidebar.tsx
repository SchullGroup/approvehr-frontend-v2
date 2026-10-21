"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Lock,
  Search,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Input } from "@/components/ui";
import type { BadgeSource, NavGroup, NavItem } from "./nav";
import {
  ROOT,
  buildSidebar,
  findDestinations,
  highlight,
  isNavItemActive,
  locate,
  type FindResult,
  type SidebarDrill,
  type SidebarLevel,
  type SidebarTree,
} from "./sidebar-model";

/**
 * The left sidebar: a short list that opens, a level at a time, instead of a
 * long one that is always open.
 *
 * ## The idea, borrowed
 *
 * Vercel's dashboard has no accordion. The top level is a flat run of rows;
 * the ones with children carry a chevron, and pressing one **replaces the
 * whole list** with that section's items under a back arrow. Nothing expands in
 * place, so the sidebar is never longer than one screen of one thing — which
 * was the complaint about this one. Above the list is a Find box that looks
 * across every level at once.
 *
 * What is borrowed is the structure. The tokens, type, icons and light/dark
 * are this product's own.
 *
 * ## What it must not do
 *
 * Change who can reach what. `visibleNav` has already dropped the doors this
 * person may not have, and `sidebar-model.ts` only rearranges the rest, so the
 * set of destinations is the same as the long list's by construction and by
 * `tests/sidebar-parity.test.tsx`.
 *
 * ## Where you are
 *
 * The level is **derived from the route**, not remembered: a deep link to
 * `/hiring/offers` opens on Recruitment with Offers lit, a link to a page that
 * belongs to no row opens on the top level, and following any link in the app
 * re-derives it. The only thing held in state is the person's *own* choice —
 * "I went back up", "I opened Payroll" — and it is held for **that page
 * only**, so it can never fight the route: the moment the path changes, the
 * route is right again.
 *
 * ## Why a chevron row is a button
 *
 * It goes nowhere. Making it a link to the group's first screen as well would
 * be two jobs on one control, and the screen a group "opens" is not obviously
 * its first item. So: a link navigates, a button drills, and the row says
 * which by whether it has a chevron.
 */

/* -------------------------------------------------------------------------- */

type Variant = "desktop" | "drawer";

type Motion = { dir: "in" | "back"; to: SidebarLevel; path: string };

const subscribeReduced = (onChange: () => void) => {
  const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  query?.addEventListener?.("change", onChange);
  return () => query?.removeEventListener?.("change", onChange);
};
const reducedNow = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** Read here, not only in CSS, so a person who asked for no motion gets no animation class at all. */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduced, reducedNow, () => false);
}

/** True when the desktop sidebar is the one on screen (`lg` and up). jsdom has no media queries, so there it is. */
function desktopSidebarVisible(): boolean {
  return (
    typeof window.matchMedia !== "function" ||
    window.matchMedia("(min-width: 1024px)").matches
  );
}

/* -------------------------------------------------------------------------- */

export function SidebarNav({
  groups,
  pathname,
  badges,
  onNavigate,
  onSearchPeople,
  onClose,
  variant = "desktop",
}: {
  groups: NavGroup[];
  pathname: string;
  badges: Record<BadgeSource, number>;
  /** A door was used. The drawer closes on it. */
  onNavigate: () => void;
  /** Hands what was typed to the header's people search. Absent: no such row. */
  onSearchPeople?: (query: string) => void;
  /** The drawer's own way out, for Esc at the top level. */
  onClose?: () => void;
  variant?: Variant;
}) {
  const router = useRouter();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingFocus = useRef<
    { kind: "back" } | { kind: "row"; id: string } | null
  >(null);
  const reduced = usePrefersReducedMotion();
  const drawer = variant === "drawer";

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  /* The person's own choice of level, good for the page it was made on. */
  const [manual, setManual] = useState<{
    level: SidebarLevel;
    path: string;
  } | null>(null);
  const [motion, setMotion] = useState<Motion | null>(null);

  const tree: SidebarTree = useMemo(() => buildSidebar(groups), [groups]);
  const here = useMemo(
    () => locate(tree, groups, pathname),
    [tree, groups, pathname],
  );
  const drills = useMemo(
    () => tree.flat().filter((e): e is SidebarDrill => e.kind === "drill"),
    [tree],
  );

  const chosen = manual && manual.path === pathname ? manual.level : null;
  const level: SidebarLevel =
    chosen !== null && (chosen === ROOT || drills.some((d) => d.id === chosen))
      ? chosen
      : here.level;
  const drill =
    level === ROOT ? null : (drills.find((d) => d.id === level) ?? null);

  const drillInto = useCallback(
    (id: SidebarLevel) => {
      pendingFocus.current = { kind: "back" };
      setMotion({ dir: "in", to: id, path: pathname });
      setManual({ level: id, path: pathname });
    },
    [pathname],
  );
  const goBack = useCallback(() => {
    pendingFocus.current = { kind: "row", id: level };
    setMotion({ dir: "back", to: ROOT, path: pathname });
    setManual({ level: ROOT, path: pathname });
  }, [level, pathname]);

  /* Focus follows a person's own choice: into the new level's back control
     (the row they pressed has just left the page), and back onto the row they
     came from. A level change the *route* caused leaves focus alone — that is
     somebody who clicked something in the page. */
  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    pendingFocus.current = null;
    const scope = rootRef.current;
    if (!scope) return;
    /* Matched by comparing the attribute rather than building a selector from
       the id: `CSS.escape` is not in every test environment, and an id that
       needed escaping would be a group somebody named oddly. */
    const target =
      pending.kind === "back"
        ? scope.querySelector<HTMLElement>("[data-nav-back]")
        : Array.from(
            scope.querySelectorAll<HTMLElement>("[data-nav-row]"),
          ).find((el) => el.dataset["navRow"] === pending.id);
    target?.focus();
  }, [level]);

  /* The drawer takes focus when it opens so a keyboard or screen-reader user
     starts inside it, not behind it. The container, not the Find box: that
     would raise the on-screen keyboard on a phone. */
  useEffect(() => {
    if (drawer) rootRef.current?.focus();
  }, [drawer]);

  /* `F` focuses Find, as on Vercel. Only the desktop sidebar listens, only
     while it is on screen, and never while somebody is typing or a dialog is
     open — a lone letter must reach the field it was typed into. `/` already
     belongs to the header's people search, and Projects uses `c` and `/`. */
  useEffect(() => {
    if (drawer) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "f" && event.key !== "F") return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat)
        return;
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (typing) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (!desktopSidebarVisible()) return;
      const input = inputRef.current;
      if (!input) return;
      event.preventDefault();
      input.focus();
      input.select();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawer]);

  /* ---- Find ---- */

  const searching = query.trim().length > 0;
  const results: FindResult[] = useMemo(
    () => (searching ? findDestinations(tree, query) : []),
    [tree, query, searching],
  );
  /* The listbox exists only when there is something to list. With no match the
     panel is a sentence and a button, so there is nothing to be "expanded". */
  const listOpen = searching && results.length > 0;
  const peopleRow = searching && onSearchPeople !== undefined;
  const optionCount = results.length + (peopleRow ? 1 : 0);
  const safeIndex =
    optionCount === 0 ? 0 : Math.min(activeIndex, optionCount - 1);
  const optionId = (index: number) => `${listId}-option-${index}`;

  useEffect(() => {
    if (!searching) return;
    document
      .getElementById(`${listId}-option-${safeIndex}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [safeIndex, searching, listId, results.length]);

  function clearQuery() {
    setQuery("");
    setActiveIndex(0);
  }

  function activate(index: number) {
    const found = results[index];
    if (found) {
      clearQuery();
      onNavigate();
      router.push(found.item.href);
    } else if (peopleRow && index === results.length) {
      const typed = query.trim();
      clearQuery();
      onSearchPeople?.(typed);
    }
  }

  function onFindKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!searching || optionCount === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (Math.min(i, optionCount - 1) + 1) % optionCount);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(
        (i) => (Math.min(i, optionCount - 1) - 1 + optionCount) % optionCount,
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      activate(safeIndex);
    }
  }

  /* Esc, from anywhere in the sidebar: clear Find first, then go up a level,
     then (in the drawer) close. One step per press. */
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") return;
    if (searching) {
      event.preventDefault();
      event.stopPropagation();
      clearQuery();
      inputRef.current?.focus();
    } else if (level !== ROOT) {
      event.preventDefault();
      event.stopPropagation();
      goBack();
    } else if (drawer && onClose) {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  }

  const animation =
    !reduced && motion && motion.to === level && motion.path === pathname
      ? motion.dir === "in"
        ? "animate-drill-in"
        : "animate-drill-back"
      : undefined;

  const announcement = searching
    ? results.length === 0
      ? "No pages match"
      : `${results.length} ${results.length === 1 ? "result" : "results"}`
    : drill
      ? `${drill.label} menu`
      : "Main menu";

  const onLinkUsed = () => {
    clearQuery();
    onNavigate();
  };

  return (
    <div
      ref={rootRef}
      tabIndex={drawer ? -1 : undefined}
      onKeyDown={onKeyDown}
      data-sidebar={variant}
      className="flex min-h-0 flex-1 flex-col outline-none"
    >
      <div
        role="search"
        className={cn("flex shrink-0 items-center gap-2 px-3 pb-2 pt-3")}
      >
        <div className="relative min-w-0 flex-1">
          <Input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onFindKeyDown}
            icon={<Search aria-hidden="true" />}
            placeholder="Find"
            aria-label="Find a page"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={listOpen}
            aria-controls={listOpen ? listId : undefined}
            aria-activedescendant={listOpen ? optionId(safeIndex) : undefined}
            autoComplete="off"
            spellCheck={false}
            data-tour="nav-find"
            className={cn("pr-10", drawer && "h-11")}
          />
          {searching ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                clearQuery();
                inputRef.current?.focus();
              }}
              className={cn(
                "absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center justify-center",
                "rounded-md text-muted transition-colors hover:bg-canvas hover:text-ink",
                drawer ? "size-9" : "size-7",
              )}
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          ) : (
            !drawer && (
              <kbd
                aria-hidden="true"
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-xs border border-line bg-surface px-1.5 py-0.5 text-meta text-faint"
              >
                F
              </kbd>
            )
          )}
        </div>
        {drawer && onClose && (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={onClose}
            className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-canvas hover:text-ink"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        )}
      </div>

      <nav
        aria-label="Main"
        className="scrollbar-slim min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-4"
      >
        {searching ? (
          <FindResults
            listId={listId}
            optionId={optionId}
            results={results}
            query={query.trim()}
            activeIndex={safeIndex}
            onHover={setActiveIndex}
            onUse={onLinkUsed}
            onPeople={peopleRow ? () => activate(results.length) : undefined}
            badges={badges}
            drawer={drawer}
          />
        ) : drill ? (
          <div key={drill.id} className={animation}>
            <div className="mb-1">
              <button
                type="button"
                data-nav-back=""
                aria-label="Back to main menu"
                onClick={goBack}
                className={cn(
                  "flex w-full min-w-0 items-center gap-1 rounded-md text-left text-muted",
                  "transition-colors hover:bg-canvas hover:text-ink",
                  drawer ? "min-h-11" : "min-h-9",
                )}
              >
                <span
                  className={cn(
                    "flex shrink-0 items-center justify-center",
                    drawer ? "size-11" : "size-9",
                  )}
                >
                  <ChevronLeft aria-hidden="true" className="size-5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-body-sm font-semibold text-ink">
                  {drill.label}
                </span>
              </button>
            </div>
            {drill.sections.map((section) => (
              <div key={section.label ?? "first"}>
                {section.label && (
                  <h3 className="px-2.5 pb-1 pt-3 text-meta font-semibold uppercase tracking-wide text-faint">
                    {section.label}
                  </h3>
                )}
                <ul className="flex flex-col gap-0.5">
                  {section.items.map((item) => (
                    <li key={item.label}>
                      <NavLinkRow
                        item={item}
                        active={isNavItemActive(item, here.activeHref)}
                        count={countOf(item, badges)}
                        onNavigate={onLinkUsed}
                        drawer={drawer}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <div key="root" className={animation}>
            {tree.map((block, index) => (
              <div
                key={block[0]?.key ?? index}
                className={cn(index > 0 && "mt-2 border-t border-line pt-2")}
              >
                <ul className="flex flex-col gap-0.5">
                  {block.map((entry) => (
                    <li key={entry.key}>
                      {entry.kind === "link" ? (
                        <NavLinkRow
                          item={entry.item}
                          active={isNavItemActive(entry.item, here.activeHref)}
                          count={countOf(entry.item, badges)}
                          onNavigate={onLinkUsed}
                          drawer={drawer}
                        />
                      ) : (
                        <DrillRow
                          entry={entry}
                          current={here.entryKey === entry.key}
                          attention={entry.items.some(
                            (item) =>
                              (countOf(item, badges) ?? 0) > 0 &&
                              !item.locked &&
                              !item.soon,
                          )}
                          onOpen={() => drillInto(entry.id)}
                          drawer={drawer}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </nav>

      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function countOf(
  item: NavItem,
  badges: Record<BadgeSource, number>,
): number | undefined {
  return item.badgeSource !== undefined ? badges[item.badgeSource] : item.badge;
}

const rowBase =
  "group flex w-full items-center gap-2.5 rounded-md px-2.5 text-left text-body-sm font-medium " +
  "transition-colors duration-150";

/**
 * One door. The markup the long list always used for a row — icon, label,
 * then whatever trails it (Coming soon, the plan lock, or a count) — so a link
 * looks the same whether it sits at the top level or inside a level.
 */
function NavLinkRow({
  item,
  active,
  count,
  onNavigate,
  drawer,
}: {
  item: NavItem;
  active: boolean;
  count: number | undefined;
  onNavigate: () => void;
  drawer: boolean;
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={item.locked ? `${item.label} (not in your plan)` : undefined}
      /* The guided tour points at items by route, so it can only ever
         highlight one this company actually has — the list here is already
         filtered by permission and feature. */
      data-tour={`nav-item:${item.href}`}
      onClick={onNavigate}
      className={cn(
        rowBase,
        drawer ? "min-h-11 py-2.5" : "py-2",
        active
          ? "bg-accent-soft text-accent-text"
          : "text-body hover:bg-canvas hover:text-ink",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "shrink-0 [&>svg]:size-4",
          active ? "text-accent-text" : "text-faint group-hover:text-muted",
        )}
      >
        {item.icon}
      </span>
      <span
        data-nav-label=""
        className={cn("min-w-0 flex-1 truncate", item.locked && "text-faint")}
      >
        {item.label}
      </span>

      {item.soon && !item.locked && (
        <span className="shrink-0 text-meta font-normal text-faint">
          Coming soon
        </span>
      )}
      {/* The lock takes the same trailing slot a badge count or "Coming soon"
          would otherwise use — see `NavItem.locked`. */}
      {item.locked && (
        <Lock aria-hidden="true" className="size-3.5 shrink-0 text-faint" />
      )}
      {/* Deliberately hand-rolled, not `Badge`: the active state is a solid
          accent fill with no matching tone today, and every existing tone is a
          soft/tinted fill by design. */}
      {count !== undefined && count > 0 && !item.soon && !item.locked && (
        <span
          className={cn(
            "tabular shrink-0 rounded-full px-1.5 py-0.5 text-meta font-semibold",
            active ? "bg-accent text-white" : "bg-sunken text-muted",
          )}
        >
          {count}
        </span>
      )}
    </Link>
  );
}

/**
 * A row that opens a level.
 *
 * A button: it navigates nowhere. The chevron is what says so. When the page
 * you are on is inside it, the row carries a thin accent bar and a darker
 * label — a "you are here" that is quieter than a lit link, because you are
 * not on this row, you are somewhere below it. When anything inside has a count
 * waiting, a small dot says so; a sum would add leave requests to clock-ins.
 */
function DrillRow({
  entry,
  current,
  attention,
  onOpen,
  drawer,
}: {
  entry: SidebarDrill;
  current: boolean;
  attention: boolean;
  onOpen: () => void;
  drawer: boolean;
}) {
  return (
    <button
      type="button"
      data-nav-row={entry.id}
      data-tour={`nav-group:${entry.id}`}
      data-current={current ? "true" : undefined}
      aria-current={current ? "true" : undefined}
      aria-label={
        entry.locked ? `${entry.label} (not in your plan)` : undefined
      }
      onClick={onOpen}
      className={cn(
        rowBase,
        "relative",
        drawer ? "min-h-11 py-2.5" : "py-2",
        current
          ? "text-ink before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-accent-text"
          : "text-body hover:bg-canvas hover:text-ink",
        current && "hover:bg-canvas",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "shrink-0 [&>svg]:size-4",
          current ? "text-accent-text" : "text-faint group-hover:text-muted",
        )}
      >
        {entry.icon}
      </span>
      <span
        data-nav-label=""
        className={cn("min-w-0 flex-1 truncate", entry.locked && "text-faint")}
      >
        {entry.label}
      </span>
      {entry.locked && (
        <Lock aria-hidden="true" className="size-3.5 shrink-0 text-faint" />
      )}
      {attention && !entry.locked && (
        <>
          <span
            aria-hidden="true"
            data-attention=""
            className="size-1.5 shrink-0 rounded-full bg-accent-text"
          />
          <span className="sr-only">, needs attention</span>
        </>
      )}
      <ChevronRight
        aria-hidden="true"
        className="size-4 shrink-0 text-faint group-hover:text-muted"
      />
      {!entry.locked && <span className="sr-only">, opens menu</span>}
    </button>
  );
}

/* -------------------------------------------------------------------------- */

function FindResults({
  listId,
  optionId,
  results,
  query,
  activeIndex,
  onHover,
  onUse,
  onPeople,
  badges,
  drawer,
}: {
  listId: string;
  optionId: (index: number) => string;
  results: FindResult[];
  query: string;
  activeIndex: number;
  onHover: (index: number) => void;
  onUse: () => void;
  onPeople: (() => void) | undefined;
  badges: Record<BadgeSource, number>;
  drawer: boolean;
}) {
  const rowSize = drawer ? "min-h-11 py-2" : "py-1.5";

  if (results.length === 0) {
    return (
      <div className="px-2.5 py-4 text-body-sm">
        <p className="text-body">Nothing here matches &ldquo;{query}&rdquo;.</p>
        <p className="mt-1 text-muted">
          Try a shorter word, or the name of a module.
        </p>
        {onPeople && (
          <button
            type="button"
            onClick={onPeople}
            className={cn(
              "mt-3 flex w-full items-center gap-2.5 rounded-md border border-line px-2.5 text-left",
              "font-medium text-ink transition-colors hover:bg-canvas",
              drawer ? "min-h-11" : "py-2",
            )}
          >
            <Users aria-hidden="true" className="size-4 shrink-0 text-faint" />
            <span className="min-w-0 truncate">
              Search people for &ldquo;{query}&rdquo;
            </span>
          </button>
        )}
      </div>
    );
  }

  return (
    <ul
      id={listId}
      role="listbox"
      aria-label="Pages"
      className="flex flex-col gap-0.5"
    >
      {results.map((result, index) => {
        const active = index === activeIndex;
        const count = countOf(result.item, badges);
        const runs = highlight(result.item.label, result.tokens);
        return (
          <li key={result.key} role="presentation">
            <Link
              id={optionId(index)}
              role="option"
              aria-selected={active}
              href={result.item.href}
              aria-label={
                (result.groupLabel
                  ? `${result.groupLabel} › ${result.item.label}`
                  : result.item.label) +
                (result.item.locked ? " (not in your plan)" : "")
              }
              onClick={onUse}
              onMouseMove={() => onHover(index)}
              tabIndex={-1}
              className={cn(
                rowBase,
                rowSize,
                active ? "bg-accent-soft text-ink" : "text-body",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "shrink-0 [&>svg]:size-4",
                  active ? "text-accent-text" : "text-faint",
                )}
              >
                {result.item.icon}
              </span>
              <span className="min-w-0 flex-1" aria-hidden="true">
                <span
                  className={cn(
                    "block truncate",
                    result.item.locked && "text-faint",
                  )}
                >
                  {runs.map((run, i) =>
                    run.hit ? (
                      <mark
                        key={i}
                        className="rounded-xs bg-transparent font-semibold text-accent-text underline decoration-accent-line decoration-2 underline-offset-2"
                      >
                        {run.text}
                      </mark>
                    ) : (
                      <span key={i}>{run.text}</span>
                    ),
                  )}
                </span>
                {result.groupLabel && (
                  <span className="block truncate text-meta font-normal text-muted">
                    {result.groupLabel}
                  </span>
                )}
              </span>
              {result.item.soon && !result.item.locked && (
                <span className="shrink-0 text-meta font-normal text-faint">
                  Coming soon
                </span>
              )}
              {result.item.locked && (
                <Lock
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-faint"
                />
              )}
              {count !== undefined &&
                count > 0 &&
                !result.item.soon &&
                !result.item.locked && (
                  <span className="tabular shrink-0 rounded-full bg-sunken px-1.5 py-0.5 text-meta font-semibold text-muted">
                    {count}
                  </span>
                )}
            </Link>
          </li>
        );
      })}
      {onPeople && (
        <li role="presentation" className="mt-1 border-t border-line pt-1">
          <button
            type="button"
            id={optionId(results.length)}
            role="option"
            aria-selected={activeIndex === results.length}
            tabIndex={-1}
            onClick={onPeople}
            onMouseMove={() => onHover(results.length)}
            className={cn(
              rowBase,
              rowSize,
              activeIndex === results.length
                ? "bg-accent-soft text-ink"
                : "text-body",
            )}
          >
            <Users
              aria-hidden="true"
              className={cn(
                "size-4 shrink-0",
                activeIndex === results.length
                  ? "text-accent-text"
                  : "text-faint",
              )}
            />
            <span className="min-w-0 flex-1 truncate">
              Search people for &ldquo;{query}&rdquo;
            </span>
          </button>
        </li>
      )}
    </ul>
  );
}
