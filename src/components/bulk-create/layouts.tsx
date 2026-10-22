"use client";

import { memo, useMemo, useRef, type RefObject } from "react";
import { ChevronLeft, ChevronRight, Copy, Trash2 } from "lucide-react";
import { Badge, IconButton } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Draft } from "@/lib/bulk-create/model";
import {
  errorsOf,
  warningsOf,
  type ItemReport,
} from "@/lib/bulk-create/report";
import type { BulkSurface } from "@/lib/bulk-create/surface";
import {
  CardField,
  controlFor,
  displayValue,
  GridCell,
  suggestionListId,
} from "./field-control";

/**
 * The three ways to lay out one list of items: stacked, page by page, and a
 * table.
 *
 * They are three views of the same `drafts`, never three copies of it. Each
 * takes the whole list and the same handlers, so switching between them cannot
 * lose a character, and each reads a field's control from the surface, so a
 * dropdown in one is a dropdown in all three.
 *
 * `readOnly` is the review. It is the same layout with the inputs taken away and
 * a different surface under it — dashed border, tinted ground — so it is
 * recognisably the thing the person typed and recognisably not editable.
 */

export type LayoutProps = {
  surface: BulkSurface;
  drafts: readonly Draft[];
  reports: Readonly<Record<string, ItemReport>>;
  readOnly: boolean;
  onEdit: (key: string, field: string, value: string) => void;
  onDuplicate: (key: string) => void;
  onRemove: (key: string) => void;
  canDuplicate: boolean;
  /** Where the window's shared suggestion lists are. See `SuggestionLists`. */
  listBase: string;
};

/** The DOM id a card or row carries, for "go to the one with the problem". */
export const itemDomId = (key: string): string => `bulk-item-${key}`;

/* ------------------------------------------------------------------ pieces */

function ItemHeader({
  surface,
  draft,
  index,
  report,
  readOnly,
  canDuplicate,
  onDuplicate,
  onRemove,
}: {
  surface: BulkSurface;
  draft: Draft;
  index: number;
  report: ItemReport | undefined;
  readOnly: boolean;
  canDuplicate: boolean;
  onDuplicate: (key: string) => void;
  onRemove: (key: string) => void;
}) {
  const name = surface.itemName(draft, index + 1);
  const errors = errorsOf(report).length;
  const warnings = warningsOf(report).length;
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-7 shrink-0 place-items-center rounded-full bg-sunken text-meta font-semibold text-ink"
        >
          {index + 1}
        </span>
        <h3 className="min-w-0 truncate text-body-sm font-semibold text-ink">
          {name}
        </h3>
        {errors > 0 && (
          <Badge tone="danger" size="sm">
            {errors === 1 ? "1 to fix" : `${String(errors)} to fix`}
          </Badge>
        )}
        {errors === 0 && warnings > 0 && (
          <Badge tone="warning" size="sm">
            {warnings === 1 ? "1 note" : `${String(warnings)} notes`}
          </Badge>
        )}
      </div>
      {!readOnly && (
        <div className="flex shrink-0 items-center gap-1">
          <IconButton
            label={`Copy ${name}`}
            size="sm"
            disabled={!canDuplicate}
            onClick={() => onDuplicate(draft.key)}
          >
            <Copy className="size-4" />
          </IconButton>
          <IconButton
            label={`Remove ${name}`}
            size="sm"
            onClick={() => onRemove(draft.key)}
          >
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      )}
    </div>
  );
}

/** What is wrong with the item as a whole, not with one field. */
function ItemLevelProblems({ report }: { report: ItemReport | undefined }) {
  const problems = errorsOf(report).filter((problem) => problem.field === null);
  if (problems.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 text-body-sm text-danger-text">
      {problems.map((problem) => (
        <li key={problem.problem}>{problem.problem}</li>
      ))}
    </ul>
  );
}

/** The fields of one item, grouped as the surface says. */
function ItemBody({
  surface,
  draft,
  report,
  readOnly,
  withHelp,
  listBase,
  onEdit,
}: {
  surface: BulkSurface;
  draft: Draft;
  report: ItemReport | undefined;
  readOnly: boolean;
  withHelp: boolean;
  listBase: string;
  onEdit: (key: string, field: string, value: string) => void;
}) {
  const groups = readOnly
    ? surface.groups
        .map((group) => ({
          ...group,
          /* A read-only card leaves out what was never filled in. Listing
             "Measure: Not set" six times is the review telling a person what
             they already know. Required fields are kept, empty or not — and so
             is a field the check had something to say about. The caution that an
             objective is filed in no appraisal period is about a cell that is
             blank, so without this the card still counts "1 note" in its header
             and shows nowhere what it is. */
          fields: group.fields.filter((field) => {
            const spec = surface.dictionary.byField.get(field);
            const said = (report?.problems ?? []).some(
              (problem) => problem.field === field,
            );
            return (
              spec?.required ||
              said ||
              (draft.values[field] ?? "").trim() !== ""
            );
          }),
        }))
        .filter((group) => group.fields.length > 0)
    : surface.groups;

  return (
    <div className="flex flex-col gap-5">
      <ItemLevelProblems report={report} />
      {groups.map((group, index) => (
        <div key={group.label ?? index} className="flex flex-col gap-3">
          {group.label && (
            <div>
              <p className="text-body-sm font-semibold text-ink">
                {group.label}
              </p>
              {group.hint && !readOnly && (
                <p className="text-body-sm text-muted">{group.hint}</p>
              )}
            </div>
          )}
          {readOnly ? (
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {group.fields.map((field) => (
                <CardField
                  key={field}
                  surface={surface}
                  draft={draft}
                  field={field}
                  report={report}
                  readOnly
                  withHelp={false}
                  listBase={listBase}
                  onChange={() => undefined}
                />
              ))}
            </dl>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {group.fields.map((field) => (
                <CardField
                  key={field}
                  surface={surface}
                  draft={draft}
                  field={field}
                  report={report}
                  readOnly={false}
                  withHelp={withHelp}
                  listBase={listBase}
                  onChange={(changed, value) =>
                    onEdit(draft.key, changed, value)
                  }
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const cardClass = (readOnly: boolean, invalid: boolean): string =>
  cn(
    "flex flex-col gap-5 rounded-xl border p-5",
    readOnly
      ? "border-dashed border-info-line bg-canvas"
      : invalid
        ? "border-danger-line bg-surface"
        : "border-line bg-surface",
  );

/* ----------------------------------------------------------------- stacked */

type ItemProps = {
  surface: BulkSurface;
  draft: Draft;
  index: number;
  report: ItemReport | undefined;
  readOnly: boolean;
  canDuplicate: boolean;
  listBase: string;
  onEdit: LayoutProps["onEdit"];
  onDuplicate: LayoutProps["onDuplicate"];
  onRemove: LayoutProps["onRemove"];
};

/**
 * One card in the stacked list.
 *
 * Memoised, and that is what makes fifty of them typeable. Every keystroke
 * replaces one draft and leaves the other forty-nine the same objects, so with
 * stable handlers a `memo` skips them — without it each keystroke re-rendered
 * six hundred fields, which measured at 1.3 seconds a key in a real browser.
 * It only works while the props really are equal, which is why the window hands
 * down `useStableCallback` handlers rather than the ones its hook returns.
 */
const StackedItem = memo(function StackedItem(props: ItemProps) {
  const { surface, draft, index, report, readOnly } = props;
  return (
    <li id={itemDomId(draft.key)}>
      <div className={cardClass(readOnly, errorsOf(report).length > 0)}>
        <ItemHeader
          surface={surface}
          draft={draft}
          index={index}
          report={report}
          readOnly={readOnly}
          canDuplicate={props.canDuplicate}
          onDuplicate={props.onDuplicate}
          onRemove={props.onRemove}
        />
        <ItemBody
          surface={surface}
          draft={draft}
          report={report}
          readOnly={readOnly}
          withHelp={index === 0}
          listBase={props.listBase}
          onEdit={props.onEdit}
        />
      </div>
    </li>
  );
});

export function StackedLayout(props: LayoutProps) {
  const { surface, drafts, reports, readOnly } = props;
  return (
    <ol className="flex flex-col gap-4">
      {drafts.map((draft, index) => (
        <StackedItem
          key={draft.key}
          surface={surface}
          draft={draft}
          index={index}
          report={reports[draft.key]}
          readOnly={readOnly}
          canDuplicate={props.canDuplicate}
          listBase={props.listBase}
          onEdit={props.onEdit}
          onDuplicate={props.onDuplicate}
          onRemove={props.onRemove}
        />
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------ page by page */

export function PagesLayout(
  props: LayoutProps & {
    position: number;
    onPosition: (position: number) => void;
  },
) {
  const { surface, drafts, reports, readOnly, position, onPosition } = props;
  const last = drafts.length - 1;
  const at = Math.max(0, Math.min(position, last));
  const draft = drafts[at];
  if (!draft) return null;
  const report = reports[draft.key];
  const noun = surface.dictionary.noun.one;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <IconButton
            label={`Previous ${noun}`}
            size="sm"
            variant="secondary"
            disabled={at === 0}
            onClick={() => onPosition(at - 1)}
          >
            <ChevronLeft className="size-4" />
          </IconButton>
          <p
            className="min-w-32 text-center text-body-sm font-medium text-ink"
            aria-live="polite"
          >
            {`${noun.charAt(0).toUpperCase()}${noun.slice(1)} ${String(at + 1)} of ${String(drafts.length)}`}
          </p>
          <IconButton
            label={`Next ${noun}`}
            size="sm"
            variant="secondary"
            disabled={at === last}
            onClick={() => onPosition(at + 1)}
          >
            <ChevronRight className="size-4" />
          </IconButton>
        </div>

        <ol
          className="flex flex-wrap gap-1.5"
          aria-label={`All ${surface.dictionary.noun.many}`}
        >
          {drafts.map((each, index) => {
            const problems = errorsOf(reports[each.key]).length;
            const current = index === at;
            return (
              <li key={each.key}>
                <button
                  type="button"
                  onClick={() => onPosition(index)}
                  aria-current={current ? "step" : undefined}
                  aria-label={`${surface.itemName(each, index + 1)}${problems > 0 ? ", needs a change" : ""}`}
                  className={cn(
                    "grid size-8 place-items-center rounded-full border text-meta font-semibold transition-colors",
                    current
                      ? "border-accent bg-accent text-white"
                      : problems > 0
                        ? "border-warning-line bg-warning-soft text-warning-text"
                        : "border-line bg-surface text-body hover:border-ink-soft",
                  )}
                >
                  {index + 1}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div
        id={itemDomId(draft.key)}
        className={cardClass(readOnly, errorsOf(report).length > 0)}
      >
        <ItemHeader
          surface={surface}
          draft={draft}
          index={at}
          report={report}
          readOnly={readOnly}
          canDuplicate={props.canDuplicate}
          onDuplicate={props.onDuplicate}
          onRemove={props.onRemove}
        />
        <ItemBody
          surface={surface}
          draft={draft}
          report={report}
          readOnly={readOnly}
          withHelp
          listBase={props.listBase}
          onEdit={props.onEdit}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- table */

/**
 * Move to the cell below or above, as Excel's Enter and arrow keys do.
 *
 * Found by attribute rather than held in refs: fifty rows by twelve columns is
 * six hundred cells, and the DOM already knows where each one is.
 */
function focusCell(root: HTMLElement | null, row: number, column: number) {
  const next = root?.querySelector<HTMLElement>(
    `[data-cell="${String(row)}:${String(column)}"]`,
  );
  next?.focus();
  if (next instanceof HTMLInputElement) next.select();
}

type RowProps = {
  surface: BulkSurface;
  draft: Draft;
  row: number;
  report: ItemReport | undefined;
  readOnly: boolean;
  canDuplicate: boolean;
  root: RefObject<HTMLDivElement | null>;
  /** The shared suggestion list each column uses, by field. */
  lists: Readonly<Record<string, string | undefined>>;
  onEdit: LayoutProps["onEdit"];
  onDuplicate: LayoutProps["onDuplicate"];
  onRemove: LayoutProps["onRemove"];
  onPaste: (at: { row: number; column: number }, text: string) => boolean;
};

/** One row of the table. Memoised for the reason `StackedItem` is. */
const TableRow = memo(function TableRow(props: RowProps) {
  const { surface, draft, row, report, readOnly, root } = props;
  const columns = surface.dictionary.columns;
  const name = surface.itemName(draft, row + 1);
  const rowErrors = errorsOf(report);

  return (
    <tr
      id={itemDomId(draft.key)}
      className={readOnly ? "bg-canvas" : "bg-surface"}
    >
      <th
        scope="row"
        className={cn(
          "sticky left-0 z-10 border-b border-line px-2.5 text-center text-meta font-semibold",
          readOnly ? "bg-canvas text-muted" : "bg-surface text-muted",
          rowErrors.length > 0 && "text-danger-text",
        )}
      >
        {row + 1}
      </th>
      {columns.map((spec, column) => {
        const value = draft.values[spec.field] ?? "";
        const problem = rowErrors.find(
          (each) => each.field === spec.field,
        )?.problem;
        return (
          <td
            key={spec.field}
            className="border-b border-line p-0 align-top"
            onKeyDown={(event) => {
              if (readOnly) return;
              if (event.target instanceof HTMLSelectElement) return;
              if (event.key === "Enter" || event.key === "ArrowDown") {
                event.preventDefault();
                focusCell(root.current, row + 1, column);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                focusCell(root.current, row - 1, column);
              }
            }}
          >
            {readOnly ? (
              <p className="max-w-72 truncate px-2.5 py-2.5 text-ink">
                {displayValue(surface, spec.field, value) || (
                  <span className="text-muted">—</span>
                )}
              </p>
            ) : (
              <GridCell
                surface={surface}
                field={spec.field}
                value={value}
                invalid={problem}
                label={`${spec.column}, ${name}`}
                position={{ row, column }}
                listId={props.lists[spec.field]}
                onChange={(next) => props.onEdit(draft.key, spec.field, next)}
                onPasteText={(text) => props.onPaste({ row, column }, text)}
              />
            )}
          </td>
        );
      })}
      {!readOnly && (
        <td className="border-b border-line px-1 align-middle">
          <div className="flex items-center justify-end gap-0.5">
            <IconButton
              label={`Copy ${name}`}
              size="sm"
              disabled={!props.canDuplicate}
              onClick={() => props.onDuplicate(draft.key)}
            >
              <Copy className="size-4" />
            </IconButton>
            <IconButton
              label={`Remove ${name}`}
              size="sm"
              onClick={() => props.onRemove(draft.key)}
            >
              <Trash2 className="size-4" />
            </IconButton>
          </div>
        </td>
      )}
    </tr>
  );
});

export function TableLayout(
  props: LayoutProps & {
    /** A block of cells pasted at a cell. Answers whether it took it over. */
    onPaste: (at: { row: number; column: number }, text: string) => boolean;
  },
) {
  const { surface, drafts, reports, readOnly, listBase } = props;
  const columns = surface.dictionary.columns;
  const root = useRef<HTMLDivElement>(null);

  const head =
    "sticky top-0 z-20 border-b border-line bg-canvas px-2.5 py-2 text-left text-meta font-semibold text-muted whitespace-nowrap";
  const idHead = cn(head, "left-0 z-30 w-12 text-center");

  /* The window's shared lists, one per column that has suggestions. A memo, so
     the object handed to every row is the same one until the surface changes. */
  const lists = useMemo(
    () =>
      Object.fromEntries(
        surface.dictionary.columns.map((spec) => {
          const control = controlFor(surface, spec.field);
          return [
            spec.field,
            control.kind === "text" && (control.suggestions?.length ?? 0) > 0
              ? suggestionListId(listBase, spec.field)
              : undefined,
          ];
        }),
      ),
    [surface, listBase],
  );

  return (
    <div
      ref={root}
      className={cn(
        "max-h-[58dvh] overflow-auto rounded-xl border",
        readOnly ? "border-dashed border-info-line" : "border-line",
      )}
    >
      <table className="min-w-full border-separate border-spacing-0 text-body-sm">
        <thead>
          <tr>
            <th scope="col" className={idHead}>
              <span className="sr-only">Number</span>
              <span aria-hidden="true">#</span>
            </th>
            {columns.map((spec) => (
              <th
                key={spec.field}
                scope="col"
                className={cn(head, widthFor(spec.field, surface))}
              >
                {spec.column}
                {spec.required && (
                  <span className="ml-0.5 text-danger-text" aria-hidden="true">
                    *
                  </span>
                )}
              </th>
            ))}
            {!readOnly && (
              <th scope="col" className={cn(head, "w-20")}>
                <span className="sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {drafts.map((draft, row) => (
            <TableRow
              key={draft.key}
              surface={surface}
              draft={draft}
              row={row}
              report={reports[draft.key]}
              readOnly={readOnly}
              canDuplicate={props.canDuplicate}
              root={root}
              lists={lists}
              onEdit={props.onEdit}
              onDuplicate={props.onDuplicate}
              onRemove={props.onRemove}
              onPaste={props.onPaste}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A width for a column, from what goes in it. Wide for prose, narrow for a number. */
function widthFor(field: string, surface: BulkSurface): string {
  const control = controlFor(surface, field);
  if (control.kind === "longtext") return "min-w-72";
  if (control.kind === "select") return "min-w-44";
  if (control.kind === "text" && control.inputMode === "decimal") {
    return "min-w-32";
  }
  return "min-w-56";
}
