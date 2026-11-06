import { FolderTree, Inbox } from "lucide-react";
import type { ProgramNavRow, ProgramsNav } from "@/lib/store/programs";
import type { NavItem, NavGroup } from "./nav";
import {
  ALL_PROGRAMS,
  PROGRAM,
  UNASSIGNED,
  UNASSIGNED_ID,
} from "@/lib/projects/terms";

/**
 * The Programs section of the Projects level, made at run time.
 *
 * The static rows (Overview, My tasks, Team tasks, All projects) live in
 * `nav.tsx`. Which programs exist is the API's to say, so the rows under the
 * **Programs** heading are added here, once the shell has asked, and the result
 * is what `visibleNav` is given. `visibleNav` itself is untouched: a program row
 * carries the same `feature` and `always` as its neighbours, and the API has
 * already narrowed the list to the programs the person can see.
 *
 * ## Which programs, when there are many
 *
 * Up to `PROGRAM_ROWS` are listed, the busiest first (most open tasks, then by
 * name) and then in alphabetical order, so a row does not jump when its count
 * changes. Past that, **All programs** is the way to the rest, and Find searches
 * every one of them. The program the person is standing in (its own page, or one
 * of its projects) is always listed, whatever its rank, so the lit row is never
 * missing.
 *
 * ## A company with no programs
 *
 * Sees what it saw before: My tasks, Team tasks, All projects. **All programs**
 * appears with none only for somebody who may start one, because it is the only
 * door to doing so; **Unassigned** appears only beside real programs and only for
 * people who manage a project in none, since otherwise it would be the same list
 * as All projects.
 */

export const PROGRAM_ROWS = 8;

const SECTION = `${PROGRAM.Many}`;

function Dot({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="4.5" fill={color} />
    </svg>
  );
}

/** The programs to list, with the one the person is in always among them. */
export function listedPrograms(
  programs: readonly ProgramNavRow[],
  currentId: string | null,
): ProgramNavRow[] {
  const busiest = [...programs].sort(
    (a, b) => b.openTaskCount - a.openTaskCount || a.name.localeCompare(b.name),
  );
  const top = busiest.slice(0, PROGRAM_ROWS);
  const current = currentId
    ? programs.find((p) => p.id === currentId)
    : undefined;
  if (current && !top.some((p) => p.id === current.id)) {
    top.splice(PROGRAM_ROWS - 1, 1, current);
  }
  return top.sort((a, b) => a.name.localeCompare(b.name));
}

export function withPrograms(
  base: readonly NavGroup[],
  nav: ProgramsNav,
  where: {
    /** The program whose page is open, from the address. */
    programId: string | null;
    /** The program of the open project, and that project's path. */
    hint: { programId: string; path: string } | null;
  },
): NavGroup[] {
  return base.map((group) => {
    if (group.id !== "projects") return group;
    const here = where.programId ?? where.hint?.programId ?? null;
    const shown = listedPrograms(nav.programs, here);
    const shownIds = new Set(shown.map((p) => p.id));
    const rowOf = (p: ProgramNavRow, findOnly: boolean): NavItem => ({
      href: `/projects/programs/${p.id}`,
      label: p.name,
      icon: <Dot color={p.color} />,
      feature: "projects",
      always: true,
      section: SECTION,
      ...(findOnly ? { findOnly: true as const } : {}),
      /* A project's own page lights its program's row: the row owns that path. */
      ...(where.hint?.programId === p.id
        ? { activePrefix: where.hint.path }
        : {}),
    });
    const rows: NavItem[] = [
      ...shown.map((p) => rowOf(p, false)),
      /* The rest are not listed, and Find still reaches them by name. */
      ...nav.programs
        .filter((p) => !shownIds.has(p.id))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => rowOf(p, true)),
    ];
    const showAll = nav.programs.length > 0 || nav.canCreate;
    const tail: NavItem[] = [
      ...(showAll
        ? [
            {
              href: "/projects/programs",
              label: ALL_PROGRAMS,
              icon: <FolderTree aria-hidden="true" />,
              feature: "projects" as const,
              always: true as const,
              section: SECTION,
              activeExcept: [`/projects/programs/${UNASSIGNED_ID}`],
            },
          ]
        : []),
      ...(nav.unassigned
        ? [
            {
              href: `/projects/programs/${UNASSIGNED_ID}`,
              label: UNASSIGNED,
              icon: <Inbox aria-hidden="true" />,
              feature: "projects" as const,
              always: true as const,
              section: SECTION,
            },
          ]
        : []),
    ];
    return { ...group, items: [...group.items, ...rows, ...tail] };
  });
}

/** The program id in `/projects/programs/<id>`, when the address is one. */
export function programIdOfPath(pathname: string): string | null {
  const match = /^\/projects\/programs\/([^/?#]+)/.exec(pathname);
  const id = match?.[1] ?? null;
  return id && id !== UNASSIGNED_ID ? id : null;
}
