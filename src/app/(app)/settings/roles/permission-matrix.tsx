"use client";

import { useMemo } from "react";
import { TriangleAlert } from "lucide-react";
import { Checkbox, Radio } from "@/components/ui";
import type {
  Catalogue,
  MatrixCell,
  MatrixRow,
} from "@/lib/api/permissions";
import {
  hasPermission,
  type PermissionAction,
  type PermissionKey,
  type PermissionSet,
} from "@/lib/permissions";

/**
 * What a role can do, as a module × action grid.
 *
 * ## Why this is not a table
 *
 * The obvious reading of "a matrix" is a table: modules down, actions across,
 * a checkbox in every square. Built that way it is fourteen columns wide and
 * about eighty-five per cent empty — `Company settings` has one action,
 * `Audit trail` has one, `Equipment` has five of the fourteen. A grid that
 * sparse is worse than a list at the thing a grid is for, which is comparing
 * along a row, and at 375px it is a horizontal scroll with no labels in view.
 *
 * So the row axis is the layout and the column axis is inside it: one block per
 * module, its own actions named beside their controls. Every square that exists
 * is still (module, action) and still comes from the API's grid — the shape is
 * the same, the rendering is honest about how ragged that shape actually is.
 *
 * ## An action a module does not have is absent, not off
 *
 * `cells` only carries the squares that exist, so nothing renders for the rest.
 * An unticked box says "you could turn this on", and there is no turning on
 * *delete a payroll run*. This is the same rule the rest of the product follows
 * for a figure nobody has: absent is not zero, and absent is not off.
 *
 * ## Scope is one control, not three checkboxes
 *
 * Where an act has scopes, the three permissions behind it are not three
 * independent grants — `VIEW_EQUIPMENT_ALL` already implies the department and
 * own tiers on the server (`SCOPE_IMPLIES`). Three checkboxes would let
 * somebody tick a combination that means nothing, and then read it back as if
 * it did. A radio group with **Off** first says the true thing: pick how far
 * this reaches, or don't grant it.
 *
 * That is also how the feedback's own table writes it — "Own" appears as a
 * cell's *value* rather than as a separate tick.
 *
 * ## The escalation guard is on the control
 *
 * Copied from `PermissionRow`, deliberately, rather than left to the API's
 * error: nobody may hand out a permission they do not hold themselves, or
 * "Manage access" quietly equals every permission. Blocked only in the
 * granting direction — taking access away is not escalation, and the API does
 * not gate it either.
 */

export function PermissionMatrix({
  catalogue,
  draft,
  setDraft,
  held,
  readOnly,
}: {
  catalogue: Catalogue;
  draft: PermissionKey[];
  setDraft: (next: PermissionKey[]) => void;
  /** What the person editing holds. Drives the escalation guard. */
  held: PermissionSet;
  readOnly: boolean;
}) {
  /**
   * Which separation-of-duties note to hang under which module.
   *
   * The flat editor hangs a rule's note under the later of its two switches.
   * Here the two can sit in different modules — preparing payroll and editing
   * people, for one of the seeded rules — so the note goes on the module
   * holding the later permission, which is the block the reader most recently
   * touched.
   */
  const notes = useMemo(() => {
    const order = catalogue.permissions.map((entry) => entry.key);
    const moduleOf = new Map(
      catalogue.permissions.map((entry) => [entry.key, entry.module]),
    );
    const map = new Map<string, string[]>();
    for (const rule of catalogue.separationOfDuties) {
      if (!rule.permissions.every((key) => draft.includes(key))) continue;
      const anchor = [...rule.permissions].sort(
        (a, b) => order.indexOf(b) - order.indexOf(a),
      )[0];
      if (!anchor) continue;
      const moduleKey = moduleOf.get(anchor);
      if (!moduleKey) continue;
      map.set(moduleKey, [...(map.get(moduleKey) ?? []), rule.message]);
    }
    return map;
  }, [catalogue, draft]);

  const sections = catalogue.sections
    .map((section) => ({
      title: section.title,
      rows: catalogue.matrix.rows.filter(
        (row) =>
          row.section === section.key && Object.keys(row.cells).length > 0,
      ),
    }))
    .filter((section) => section.rows.length > 0);

  return (
    <div className="flex flex-col gap-6">
      {sections.map((section) => (
        <section key={section.title} className="flex flex-col gap-3">
          <h3 className="text-meta font-semibold text-faint">
            {section.title}
          </h3>
          <div className="flex flex-col divide-y divide-line rounded-md border border-line">
            {section.rows.map((row) => (
              <ModuleBlock
                key={row.key}
                row={row}
                columns={catalogue.matrix.columns}
                draft={draft}
                setDraft={setDraft}
                held={held}
                readOnly={readOnly}
                notes={notes.get(row.key) ?? []}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ModuleBlock({
  row,
  columns,
  draft,
  setDraft,
  held,
  readOnly,
  notes,
}: {
  row: MatrixRow;
  columns: { key: PermissionAction; title: string }[];
  draft: PermissionKey[];
  setDraft: (next: PermissionKey[]) => void;
  held: PermissionSet;
  readOnly: boolean;
  notes: string[];
}) {
  /* Column order, so two modules with the same actions read the same way down
     the page rather than in whatever order the object happened to be built. */
  const present = columns.filter((column) => row.cells[column.key] !== undefined);

  const granted = present.filter((column) => {
    const cell = row.cells[column.key]!;
    return cell.kind === "one"
      ? draft.includes(cell.permission)
      : cell.scopes.some((scope) => draft.includes(scope.permission));
  }).length;

  return (
    <div className="flex flex-col gap-3 px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-body font-medium">{row.title}</h4>
        {/* Says what the block adds up to without anybody counting ticks. */}
        <p className="shrink-0 text-meta text-faint">
          {granted === 0
            ? "Nothing"
            : `${granted} of ${present.length}`}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:grid sm:grid-cols-2 sm:gap-x-6">
        {present.map((column) => (
          <Square
            key={column.key}
            title={column.title}
            cell={row.cells[column.key]!}
            draft={draft}
            setDraft={setDraft}
            held={held}
            readOnly={readOnly}
          />
        ))}
      </div>

      {notes.map((note) => (
        <p
          key={note}
          className="flex gap-2 rounded-md bg-warning-soft px-2.5 py-2 text-body-sm leading-relaxed text-warning-text"
        >
          <TriangleAlert
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0"
          />
          {note}
        </p>
      ))}
    </div>
  );
}

function Square({
  title,
  cell,
  draft,
  setDraft,
  held,
  readOnly,
}: {
  title: string;
  cell: MatrixCell;
  draft: PermissionKey[];
  setDraft: (next: PermissionKey[]) => void;
  held: PermissionSet;
  readOnly: boolean;
}) {
  if (cell.kind === "one") {
    const on = draft.includes(cell.permission);
    /* Blocked only in the granting direction. */
    const blocked = !on && !hasPermission(held, cell.permission);
    return (
      <Checkbox
        checked={on}
        disabled={readOnly || blocked}
        onChange={(e) =>
          setDraft(
            e.target.checked
              ? [...draft, cell.permission]
              : draft.filter((key) => key !== cell.permission),
          )
        }
        label={
          <span className="flex items-center gap-1.5">
            {title}
            {cell.sensitive && (
              <TriangleAlert
                aria-label="Handle with care"
                className="size-3.5 shrink-0 text-warning-text"
              />
            )}
          </span>
        }
        description={
          blocked ? "You do not hold this, so you cannot give it out." : cell.label
        }
      />
    );
  }

  /* Scoped: exactly one of Off / …widening tiers. Choosing a tier stores that
     one permission and clears the others in the group — the narrower ones are
     implied by the wider on the server, so storing them too would be two
     records of one decision. */
  const chosen = cell.scopes.find((scope) => draft.includes(scope.permission));
  const groupKeys = cell.scopes.map((scope) => scope.permission);
  const withoutGroup = () => draft.filter((key) => !groupKeys.includes(key));
  const name = `scope-${groupKeys.join("-")}`;

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-body font-medium">{title}</legend>
      <Radio
        name={name}
        checked={chosen === undefined}
        disabled={readOnly}
        onChange={() => setDraft(withoutGroup())}
        label="Off"
      />
      {cell.scopes.map((scope) => {
        const on = chosen?.permission === scope.permission;
        const blocked = !on && !hasPermission(held, scope.permission);
        return (
          <Radio
            key={scope.permission}
            name={name}
            checked={on}
            disabled={readOnly || blocked}
            onChange={() => setDraft([...withoutGroup(), scope.permission])}
            label={
              <span className="flex items-center gap-1.5">
                {scope.title}
                {scope.sensitive && (
                  <TriangleAlert
                    aria-label="Handle with care"
                    className="size-3.5 shrink-0 text-warning-text"
                  />
                )}
              </span>
            }
            {...(blocked
              ? { description: "You do not hold this, so you cannot give it out." }
              : {})}
          />
        );
      })}
    </fieldset>
  );
}
