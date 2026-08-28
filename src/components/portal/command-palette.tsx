"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ShieldCheck, User } from "lucide-react";
import { cn } from "@/lib/cn";
import { fullName } from "@/lib/types";
import { Input, Modal, Spinner } from "@/components/ui";
import { useDebounced } from "@/lib/use-debounced";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import { useRoles } from "@/lib/store/permissions";

type Result = {
  key: string;
  href: string;
  icon: React.ReactNode;
  label: string;
  sublabel: string;
};

/**
 * The header search — people and roles, by keyboard or by click.
 *
 * ## Why this mounts only while open
 *
 * `shell.tsx` renders this behind `{open && <CommandPalette .../>}`, the same
 * pattern every other on-demand dialog in this codebase uses. The two data
 * hooks below therefore only ever run while somebody is actually searching —
 * neither fires a request just because the app shell is on screen, and each
 * search starts clean rather than carrying whatever was typed last time.
 *
 * ## Why it reuses `useEmployeeDirectory` and `useRoles` rather than a new
 * search endpoint
 *
 * Both already do the real work in both modes: connected, `useEmployeeDirectory`
 * hits `/employees?q=` server-side; offline, it filters the local store the
 * same way the directory screen does. `useRoles` loads the full role list once,
 * which is small enough (a handful of roles per company) to filter by name on
 * this side rather than asking the API for a search it has no need to support.
 * A second, parallel search path would be one more place the two could answer
 * differently for the same query.
 *
 * ## The role link is a query param, not a route
 *
 * There is no `/settings/roles/[id]` — a role is opened as a drawer on the list
 * page, keyed by local state. `?open=<id>` is read once on mount by
 * `RolesScreen` (via `RolesPage`, server-side, the same way `ShiftsPage` reads
 * `?tab=`) to seed that same state, so landing here from a search opens the
 * role directly instead of leaving somebody to find it in a list of eight.
 */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const debounced = useDebounced(query.trim(), 200);

  const directory = useEmployeeDirectory(
    debounced ? { q: debounced, pageSize: 6 } : { pageSize: 1 },
  );
  const roles = useRoles();

  const peopleResults: Result[] = !debounced
    ? []
    : directory.employees.map((person) => ({
        key: `person-${person.id}`,
        href: `/people/${person.id}`,
        icon: <User aria-hidden="true" className="size-4" />,
        label: fullName(person),
        sublabel: person.jobTitle || "No job title on file",
      }));

  const roleResults: Result[] = !debounced
    ? []
    : roles.roles
        .filter((role) =>
          `${role.name} ${role.description ?? ""}`
            .toLowerCase()
            .includes(debounced.toLowerCase()),
        )
        .slice(0, 6)
        .map((role) => ({
          key: `role-${role.id}`,
          href: `/settings/roles?open=${role.id}`,
          icon: <ShieldCheck aria-hidden="true" className="size-4" />,
          label: role.name,
          sublabel: role.description || "No description yet",
        }));

  const results = [...peopleResults, ...roleResults];
  const loading = Boolean(debounced) && (directory.loading || roles.loading);

  /* A fresh query starts back at the top result rather than wherever the
     previous query's list happened to leave the highlight. Adjusted here,
     during render, rather than in an effect — the effect would run after the
     stale-indexed list has already painted once. See React's own "adjusting
     state when a prop changes" pattern. */
  const [settledFor, setSettledFor] = useState(debounced);
  if (debounced !== settledFor) {
    setSettledFor(debounced);
    setActiveIndex(0);
  }

  function go(href: string) {
    onClose();
    router.push(href);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (results.length === 0) {
      /* Nothing to land on by name — send them to the directory's own search
         instead of doing nothing, so Enter is never a dead key. */
      if (event.key === "Enter" && debounced) {
        go(`/people?q=${encodeURIComponent(debounced)}`);
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const active = results[activeIndex];
      if (active) go(active.href);
    }
  }

  return (
    <Modal open onClose={onClose} title="Search" size="lg">
      <div className="flex flex-col gap-4">
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          icon={<Search aria-hidden="true" />}
          placeholder="Search people, roles…"
          aria-label="Search people and roles"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="command-palette-results"
          aria-activedescendant={results[activeIndex]?.key}
        />

        {!debounced ? (
          <p className="py-6 text-center text-body-sm text-muted">
            Start typing a name, job title or role.
          </p>
        ) : loading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-body-sm text-muted">
            <Spinner size="sm" />
            Searching…
          </div>
        ) : results.length === 0 ? (
          <p className="py-6 text-center text-body-sm text-muted">
            Nobody and no role matches &ldquo;{debounced}&rdquo;.
          </p>
        ) : (
          <div id="command-palette-results" role="listbox" className="flex flex-col gap-4">
            {peopleResults.length > 0 && (
              <ResultGroup title="People" results={peopleResults} offset={0} activeIndex={activeIndex} onPick={go} />
            )}
            {roleResults.length > 0 && (
              <ResultGroup
                title="Roles"
                results={roleResults}
                offset={peopleResults.length}
                activeIndex={activeIndex}
                onPick={go}
              />
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function ResultGroup({
  title,
  results,
  offset,
  activeIndex,
  onPick,
}: {
  title: string;
  results: Result[];
  /** Where this group starts in the combined, keyboard-navigable list. */
  offset: number;
  activeIndex: number;
  onPick: (href: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-meta font-semibold uppercase tracking-wide text-faint">
        {title}
      </h3>
      <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
        {results.map((result, i) => {
          const active = offset + i === activeIndex;
          return (
            <li key={result.key}>
              <button
                id={result.key}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => onPick(result.href)}
                className={cn(
                  "flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors",
                  active ? "bg-accent-soft" : "hover:bg-canvas",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-md",
                    active ? "bg-surface text-accent-text" : "bg-sunken text-muted",
                  )}
                >
                  {result.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body-sm font-medium text-ink">
                    {result.label}
                  </span>
                  <span className="block truncate text-body-sm text-muted">
                    {result.sublabel}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
