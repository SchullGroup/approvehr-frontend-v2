"use client";

import { useId, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Download,
  Lock,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import {
  Button,
  Callout,
  Disclosure,
  Field,
  Modal,
  SegmentedControl,
  Select,
  TextLink,
  useToast,
} from "@/components/ui";
import { useStableCallback } from "@/hooks/use-stable-callback";
import { downloadCsv } from "@/lib/csv";
import { downloadXlsx } from "@/lib/xlsx";
import { buildDraftFiles } from "@/lib/bulk-create/draft-file";
import {
  draftsFromFile,
  looksLikeCells,
  MAX_ITEMS,
  overLimit,
  type Draft,
} from "@/lib/bulk-create/model";
import { errorsOf, type ItemReport } from "@/lib/bulk-create/report";
import type { BulkSurface } from "@/lib/bulk-create/surface";
import { readImportFile } from "@/lib/imports/read-file";
import { BULK_LAYOUTS, useBulkLayout } from "@/lib/store/bulk-create-layout";
import { nextDraftKey, useBulkCreate } from "@/lib/store/bulk-create";
import {
  controlFor,
  FieldEditor,
  suggestionListId,
  SuggestionLists,
} from "./field-control";
import {
  itemDomId,
  PagesLayout,
  StackedLayout,
  TableLayout,
  type LayoutProps,
} from "./layouts";
import { useDismiss } from "@/hooks/use-dismiss";

/**
 * The window for adding several records at once, in three layouts, with a
 * read-only review before anything is created.
 *
 * Everything particular to one kind of record arrives in `surface`; see
 * `lib/bulk-create/surface.ts`. What is here is the window: the toolbar, the
 * check, the review, the result, and the question asked before closing.
 *
 * ## Nothing is kept
 *
 * Closing with something typed asks first, and the way to keep it is the
 * download — an .xlsx or .csv the person can carry on in Excel and load back.
 * Nothing is written to the browser, for the reason `lib/store/bulk-create-
 * layout.ts` gives: a draft that saved itself is one nobody can see or take
 * with them.
 */

const cap = (text: string): string =>
  `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

const countOf = (n: number, noun: { one: string; many: string }): string =>
  `${String(n)} ${n === 1 ? noun.one : noun.many}`;

export function BulkCreateDialog({
  open,
  onClose,
  surface,
}: {
  open: boolean;
  onClose: () => void;
  surface: BulkSurface;
}) {
  /* A blank window on every open. The window stays mounted while it animates
     out, and anything it kept would be the last person's rows greeting the
     next. A fresh `key` is the whole reset: nothing in there has to remember to
     clear itself. */
  const [generation, setGeneration] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setGeneration((current) => current + 1);
  }
  return (
    <BulkCreateWindow
      key={generation}
      open={open}
      onClose={onClose}
      surface={surface}
    />
  );
}

function BulkCreateWindow({
  open,
  onClose,
  surface,
}: {
  open: boolean;
  onClose: () => void;
  surface: BulkSurface;
}) {
  const { dictionary } = surface;
  const noun = dictionary.noun;
  const bulk = useBulkCreate({
    dictionary,
    defaults: surface.defaults,
    noun,
    refusalWithoutApi: surface.refusalWithoutApi,
    itemName: surface.itemName,
    onChanged: surface.onChanged,
  });
  const [layout, setLayout] = useBulkLayout();
  const { push } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  /* One set of suggestion lists for the whole window, whatever the layout. */
  const listBase = useId();
  const [leaving, setLeaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  const { phase } = bulk;
  const busy = phase === "checking" || phase === "applying";
  const readOnly = phase === "review" || phase === "applying";
  const toCreate = bulk.checked?.keys.length ?? 0;

  /* ----------------------------------------------------------- closing */

  const hasWork = bulk.touched.length > 0 && phase !== "done";
  const requestClose = () => {
    if (busy) return;
    if (hasWork) setLeaving(true);
    else onClose();
  };

  /* --------------------------------------------------------- downloads */

  const download = (format: "xlsx" | "csv") => {
    const files = buildDraftFiles({
      dictionary,
      drafts: bulk.touched,
      lists: surface.lists,
    });
    if (format === "csv") downloadCsv(files.csvFilename, files.csv);
    else downloadXlsx(files.xlsxFilename, files.xlsx);
    push({
      tone: "success",
      title: "Draft downloaded",
      detail: `${countOf(bulk.touched.length, noun)} saved to ${format === "csv" ? files.csvFilename : files.xlsxFilename}. Load it back here, or upload it.`,
    });
  };

  /* ----------------------------------------------------------- loading */

  const loadFile = async (file: File) => {
    bulk.setNotice(null);
    const read = await readImportFile(file);
    if (!read.ok) {
      bulk.setError(read.message);
      return;
    }
    const loaded = draftsFromFile(dictionary, read.csv, nextDraftKey);
    if (loaded.drafts.length === 0) {
      bulk.setError(
        `That file has no ${noun.many} in it that we could read. Check you saved the sheet they are on.`,
      );
      return;
    }
    const refusal = overLimit(
      bulk.touched.length,
      loaded.drafts.length,
      noun.many,
      surface.upload.label,
    );
    if (refusal) {
      bulk.setError(refusal);
      return;
    }
    bulk.append(loaded.drafts);
    const said = [
      `Loaded ${countOf(loaded.drafts.length, noun)} from ${file.name}.`,
    ];
    if (loaded.ignored.length > 0) {
      said.push(
        `Left out ${loaded.ignored.length === 1 ? "a column" : `${String(loaded.ignored.length)} columns`} we did not recognise: ${loaded.ignored.join(", ")}.`,
      );
    }
    if (loaded.missingRequired.length > 0) {
      said.push(
        `The file has no ${loaded.missingRequired.join(" or ")} column, so that is empty on every one. Fill it in before you check.`,
      );
    }
    bulk.setNotice(said.join(" "));
  };

  /* -------------------------------------------------------- navigation */

  /* Handed to the cards and rows, which are memoised: see `StackedItem`. A
     handler that is new on every render would make every card look changed. */
  const onEdit = useStableCallback(bulk.edit);
  const onDuplicate = useStableCallback(bulk.duplicate);
  const onRemove = useStableCallback(bulk.remove);
  const onPaste = useStableCallback(
    (at: { row: number; column: number }, text: string): boolean => {
      if (!looksLikeCells(text)) return false;
      const pasted = bulk.paste(at, text);
      const said = [
        `Pasted ${countOf(pasted.rows, { one: "row", many: "rows" })}.`,
      ];
      if (pasted.droppedRows > 0) {
        said.push(
          `${String(pasted.droppedRows)} did not fit: this window holds ${String(MAX_ITEMS)}.`,
        );
      }
      if (pasted.droppedColumns > 0) {
        said.push(
          `${String(pasted.droppedColumns)} extra ${pasted.droppedColumns === 1 ? "column was" : "columns were"} past the last column and left out.`,
        );
      }
      bulk.setNotice(said.join(" "));
      return true;
    },
  );

  const goTo = (key: string) => {
    const index = bulk.drafts.findIndex((draft) => draft.key === key);
    if (index >= 0) bulk.setPosition(index);
    /* After the page has had a render to show the item, when it is the page
       layout. A plain scroll otherwise: no smooth scrolling, so a person who
       has asked their system for less motion gets none. */
    window.setTimeout(() => {
      document
        .getElementById(itemDomId(key))
        ?.scrollIntoView({ block: "center" });
    }, 0);
  };

  /* ----------------------------------------------------------- render */

  const layoutProps: LayoutProps = {
    surface,
    drafts: bulk.drafts,
    reports: bulk.reports,
    readOnly,
    onEdit,
    onDuplicate,
    onRemove,
    canDuplicate: !bulk.atLimit,
    listBase,
  };

  const title =
    phase === "done"
      ? "Done"
      : readOnly
        ? `Review ${countOf(toCreate, noun)}`
        : surface.title;
  const description =
    phase === "done"
      ? undefined
      : readOnly
        ? "Read only. Nothing is created until you confirm."
        : surface.intro;

  return (
    <>
      <Modal
        open={open}
        onClose={requestClose}
        dismissible={!busy}
        title={title}
        {...(description ? { description } : {})}
        size={layout === "table" && phase !== "done" ? "full" : "xl"}
        footer={
          phase === "done" ? (
            <DoneFooter
              left={bulk.outcome?.notLanded.length ?? 0}
              noun={noun}
              onFix={bulk.fixTheRest}
              onClose={onClose}
            />
          ) : readOnly ? (
            <>
              <p className="mr-auto hidden text-body-sm text-muted sm:block">
                {countOf(toCreate, noun)} to create
              </p>
              <Button disabled={busy} onClick={bulk.editAgain}>
                Edit again
              </Button>
              <DownloadMenu onDownload={download} disabled={busy} />
              <Button
                variant="accent"
                loading={phase === "applying"}
                onClick={() => void bulk.apply()}
              >
                {`Create ${countOf(toCreate, noun)}`}
              </Button>
            </>
          ) : (
            <>
              <p className="mr-auto hidden text-body-sm text-muted sm:block">
                {`${String(bulk.drafts.length)} of ${String(MAX_ITEMS)}`}
              </p>
              <Button disabled={busy} onClick={requestClose}>
                Cancel
              </Button>
              <Button
                variant="accent"
                loading={phase === "checking"}
                onClick={() => void bulk.check()}
              >
                Check and review
              </Button>
            </>
          )
        }
      >
        {phase === "done" && bulk.outcome ? (
          <ResultView
            surface={surface}
            outcome={bulk.outcome}
            drafts={bulk.drafts}
          />
        ) : (
          <fieldset
            disabled={busy}
            className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SegmentedControl
                label="How the list is laid out"
                value={layout}
                onChange={setLayout}
                options={[...BULK_LAYOUTS]}
              />
              <div className="flex flex-wrap items-center gap-2">
                {!readOnly && (
                  <Button size="sm" onClick={() => fileInput.current?.click()}>
                    <Upload aria-hidden="true" className="size-4" />
                    Load from a file
                  </Button>
                )}
                {!readOnly && (
                  <DownloadMenu
                    onDownload={download}
                    disabled={bulk.touched.length === 0}
                    small
                  />
                )}
              </div>
              <input
                ref={fileInput}
                type="file"
                tabIndex={-1}
                aria-hidden="true"
                className="sr-only"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(event) => {
                  const chosen = event.target.files?.[0];
                  /* Cleared first, so choosing the same file again — after
                     fixing it — fires another change event. */
                  event.target.value = "";
                  if (chosen) void loadFile(chosen);
                }}
              />
            </div>

            {!readOnly && <SuggestionLists surface={surface} base={listBase} />}

            {readOnly && (
              <ReviewBanner
                surface={surface}
                notes={bulk.checked ? bulk.findings.notes : []}
                count={toCreate}
              />
            )}

            {!readOnly && bulk.notice && (
              <Callout tone="info">{bulk.notice}</Callout>
            )}

            {!readOnly && bulk.error && (
              <Problems
                surface={surface}
                heading={bulk.error}
                drafts={bulk.drafts}
                reports={bulk.reports}
                missing={bulk.findings.missing}
                onGo={goTo}
              />
            )}

            {!readOnly && bulk.touched.length > 0 && (
              <SameForAll
                surface={surface}
                listBase={listBase}
                count={bulk.touched.length}
                onFill={(field, value) => {
                  const n = bulk.fill(field, value);
                  const spec = dictionary.byField.get(field);
                  bulk.setNotice(
                    `Set ${spec?.column ?? field} on ${countOf(n, noun)}.`,
                  );
                }}
              />
            )}

            {layout === "stacked" && <StackedLayout {...layoutProps} />}
            {layout === "pages" && (
              <PagesLayout
                {...layoutProps}
                position={bulk.position}
                onPosition={bulk.setPosition}
              />
            )}
            {layout === "table" && (
              <TableLayout {...layoutProps} onPaste={onPaste} />
            )}

            {!readOnly && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={() => bulk.add()} disabled={bulk.atLimit}>
                    <Plus aria-hidden="true" className="size-4" />
                    Add another
                  </Button>
                  {(bulk.drafts.length > 1 || bulk.touched.length > 0) && (
                    <Button variant="ghost" onClick={() => setClearing(true)}>
                      <Trash2 aria-hidden="true" className="size-4" />
                      Clear all
                    </Button>
                  )}
                </div>
                <p className="text-body-sm text-muted">
                  {bulk.atLimit ? (
                    <>
                      {`${String(MAX_ITEMS)} is the most this window holds. For more, `}
                      <TextLink href={surface.upload.href}>
                        {surface.upload.label.toLowerCase()}
                      </TextLink>
                      .
                    </>
                  ) : (
                    <>
                      {`Up to ${String(MAX_ITEMS)} at a time. For more, `}
                      <TextLink href={surface.upload.href}>
                        {surface.upload.label.toLowerCase()}
                      </TextLink>
                      .
                    </>
                  )}
                </p>
              </div>
            )}
          </fieldset>
        )}
      </Modal>

      <Modal
        open={leaving}
        onClose={() => setLeaving(false)}
        title={`Close without creating ${countOf(bulk.touched.length, noun)}?`}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setLeaving(false)}>
              Keep editing
            </Button>
            <Button onClick={() => download("xlsx")}>
              Download Excel draft
            </Button>
            <Button onClick={() => download("csv")}>Download CSV draft</Button>
            <Button
              variant="danger"
              onClick={() => {
                setLeaving(false);
                onClose();
              }}
            >
              Discard
            </Button>
          </>
        }
      >
        <p className="text-body-sm leading-relaxed text-body">
          {`Nothing here is saved anywhere. Closing throws away ${countOf(bulk.touched.length, noun)}. To carry on later, download a draft first: it opens in Excel, and you can load it back into this window or upload it.`}
        </p>
      </Modal>

      <Modal
        open={clearing}
        onClose={() => setClearing(false)}
        title={`Clear all ${noun.many}?`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setClearing(false)}>
              Keep them
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                bulk.clearAll();
                setClearing(false);
              }}
            >
              Clear all
            </Button>
          </>
        }
      >
        <p className="text-body-sm leading-relaxed text-body">
          {`This empties the window. Download a draft first if you might want ${countOf(bulk.touched.length, noun)} back.`}
        </p>
      </Modal>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function DownloadMenu({
  onDownload,
  disabled,
  small = false,
}: {
  onDownload: (format: "xlsx" | "csv") => void;
  disabled: boolean;
  small?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { mounted, closing } = useDismiss(open, 170);
  return (
    <div className="relative inline-block text-left">
      <Button
        size={small ? "sm" : "md"}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Download aria-hidden="true" className="size-4" />
        Download draft
        <ChevronDown aria-hidden="true" className="size-4" />
      </Button>
      {mounted && (
        <>
          <div
            className={
              closing
                ? "pointer-events-none fixed inset-0 z-40"
                : "fixed inset-0 z-40"
            }
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className={`${closing ? "animate-scale-out" : "animate-scale-in"} origin-top-right absolute right-0 z-50 mt-1.5 w-64 rounded-lg border border-line bg-surface p-1.5 shadow-lg`}
          >
            {(
              [
                [
                  "xlsx",
                  "Excel (.xlsx)",
                  "With your dropdowns, to carry on in Excel",
                ],
                ["csv", "CSV", "Plain text, opens anywhere"],
              ] as const
            ).map(([format, name, hint]) => (
              <button
                key={format}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onDownload(format);
                }}
                className="block w-full rounded-md px-2.5 py-2 text-left text-body-sm text-body hover:bg-canvas hover:text-ink"
              >
                {name}
                <span className="block text-meta text-muted">{hint}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** What the check found wrong, and where, with a way to get to each one. */
function Problems({
  surface,
  heading,
  drafts,
  reports,
  missing,
  onGo,
}: {
  surface: BulkSurface;
  heading: string;
  drafts: readonly Draft[];
  reports: Readonly<Record<string, ItemReport>>;
  missing: Record<string, string[]>;
  onGo: (key: string) => void;
}) {
  const failing = drafts
    .map((draft, index) => ({
      draft,
      index,
      errors: errorsOf(reports[draft.key]),
    }))
    .filter((entry) => entry.errors.length > 0);
  const named = Object.entries(missing).filter(([, names]) => names.length > 0);

  /* A name the red list already quotes is not said twice. The importer reports
     the same wrong email once per item and once as a group, and showing both
     put one fact in two boxes. What the group adds is where to put it right, so
     that rides on the red box; an amber one is only for names no item mentions. */
  const quoted = (name: string) =>
    failing.some(({ errors }) =>
      errors.some((error) => error.problem.includes(name)),
    );
  const unquoted = named
    .map(([kind, names]): [string, string[]] => [
      kind,
      names.filter((name) => !quoted(name)),
    ])
    .filter(([, names]) => names.length > 0);
  const fixes = named
    .filter(
      ([kind, names]) =>
        names.some(quoted) && surface.prerequisites[kind]?.action,
    )
    .map(([kind]) => surface.prerequisites[kind]?.action)
    .filter((action): action is NonNullable<typeof action> => Boolean(action));

  return (
    <div className="flex flex-col gap-3">
      <Callout tone="danger" title={heading}>
        {failing.length > 0 && (
          <ul className="mt-1 flex flex-col gap-1.5">
            {failing.map(({ draft, index, errors }) => (
              <li key={draft.key}>
                <button
                  type="button"
                  onClick={() => onGo(draft.key)}
                  className="text-left underline-offset-4 hover:underline"
                >
                  <span className="font-medium">
                    {surface.itemName(draft, index + 1)}
                  </span>
                  {`: ${errors[0]?.problem ?? ""}`}
                  {errors.length > 1 &&
                    ` (and ${String(errors.length - 1)} more)`}
                </button>
              </li>
            ))}
          </ul>
        )}
        {fixes.length > 0 && (
          <p className="mt-2">
            {fixes.map((action, index) => (
              <span key={action.href}>
                {index > 0 && " · "}
                <TextLink href={action.href}>{action.label}</TextLink>
              </span>
            ))}
          </p>
        )}
      </Callout>
      {unquoted.map(([kind, names]) => {
        const rule = surface.prerequisites[kind];
        return (
          <Callout
            key={kind}
            tone="warning"
            title={rule?.title ?? `Some ${kind} were not found`}
          >
            {`${names.slice(0, 8).join(", ")}${names.length > 8 ? ` and ${String(names.length - 8)} more` : ""}. `}
            {rule?.action && (
              <TextLink href={rule.action.href}>{rule.action.label}</TextLink>
            )}
          </Callout>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Set one column for every item that has something in it.
 *
 * The thing a spreadsheet does by filling down. Closed by default: most people
 * adding three objectives never need it, and the ones adding thirty will look
 * for exactly this.
 */
function SameForAll({
  surface,
  listBase,
  count,
  onFill,
}: {
  surface: BulkSurface;
  listBase: string;
  count: number;
  onFill: (field: string, value: string) => void;
}) {
  const fields = surface.fillable.filter((field) =>
    surface.dictionary.byField.has(field),
  );
  const [field, setField] = useState(fields[0] ?? "");
  const [value, setValue] = useState("");
  if (fields.length === 0) return null;
  const control = controlFor(surface, field);

  return (
    <Disclosure
      title={`Set one value for every ${surface.dictionary.noun.one}`}
      hint="Fills one column on everything you have typed, instead of choosing it on each."
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48">
          <Field label="Column">
            <Select
              value={field}
              onChange={(event) => {
                setField(event.target.value);
                setValue("");
              }}
            >
              {fields.map((each) => (
                <option key={each} value={each}>
                  {surface.dictionary.heading[each]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="min-w-56 flex-1">
          <Field label="Value">
            <FieldEditor
              control={control}
              value={value}
              placeholder=""
              listId={suggestionListId(listBase, field)}
              onChange={setValue}
            />
          </Field>
        </div>
        <Button
          disabled={value === ""}
          onClick={() => {
            onFill(field, value);
            setValue("");
          }}
        >
          {`Set on ${String(count)}`}
        </Button>
      </div>
    </Disclosure>
  );
}

/* -------------------------------------------------------------------------- */

function ReviewBanner({
  surface,
  notes,
  count,
}: {
  surface: BulkSurface;
  notes: readonly string[];
  count: number;
}) {
  const noun = surface.dictionary.noun;
  return (
    <div className="flex flex-col gap-3">
      <Callout
        tone="info"
        icon={<Lock />}
        title={`Read only. ${cap(countOf(count, noun))} passed the check.`}
      >
        Nothing is created yet. Read through them, then create them, or go back
        and change anything.
      </Callout>
      {notes.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-body-sm leading-relaxed text-body">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ResultView({
  surface,
  outcome,
  drafts,
}: {
  surface: BulkSurface;
  outcome: NonNullable<ReturnType<typeof useBulkCreate>["outcome"]>;
  drafts: readonly Draft[];
}) {
  const noun = surface.dictionary.noun;
  const made = outcome.created + outcome.updated;
  const extras = (surface.linkedStats ?? [])
    .map((stat) => ({
      label: stat.label,
      value: outcome.extras[stat.key as keyof typeof outcome.extras],
    }))
    .filter(
      (entry): entry is { label: string; value: number } =>
        typeof entry.value === "number",
    );
  const left = drafts
    .map((draft, index) => ({ draft, index }))
    .filter(({ draft }) => outcome.notLanded.includes(draft.key));

  return (
    <div className="flex flex-col gap-5">
      {made > 0 && (
        <Callout
          tone="success"
          icon={<CheckCircle2 />}
          title={`${cap(countOf(made, noun))} created`}
        >
          {extras.length > 0 && (
            <p>
              {extras
                .map((entry) => `${entry.label}: ${String(entry.value)}`)
                .join(" · ")}
            </p>
          )}
          {outcome.notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </Callout>
      )}

      {outcome.landed.length > 0 && (
        <ul className="flex flex-col gap-1 text-body-sm text-ink">
          {outcome.landed.slice(0, 12).map((each) => (
            <li key={each.key} className="flex items-center gap-2">
              <CheckCircle2
                aria-hidden="true"
                className="size-4 shrink-0 text-success-text"
              />
              {each.name}
            </li>
          ))}
          {outcome.landed.length > 12 && (
            <li className="text-muted">{`and ${String(outcome.landed.length - 12)} more`}</li>
          )}
        </ul>
      )}

      {(outcome.notLanded.length > 0 || outcome.failure) && (
        <Callout
          tone="danger"
          title={
            outcome.notLanded.length === 0
              ? "Something went wrong"
              : `${cap(countOf(outcome.notLanded.length, noun))} did not go in`
          }
        >
          {outcome.failure && <p>{outcome.failure}</p>}
          {left.length > 0 && (
            <ul className="mt-1 flex flex-col gap-1">
              {left.map(({ draft, index }) => (
                <li key={draft.key}>
                  <span className="font-medium">
                    {surface.itemName(draft, index + 1)}
                  </span>
                  {/* The reasons came with the apply, not from the check that
                      came before it — that one passed. */}
                  {errorsOf(outcome.reports[draft.key])[0]
                    ? `: ${errorsOf(outcome.reports[draft.key])[0]?.problem ?? ""}`
                    : ""}
                </li>
              ))}
            </ul>
          )}
        </Callout>
      )}
    </div>
  );
}

function DoneFooter({
  left,
  noun,
  onFix,
  onClose,
}: {
  left: number;
  noun: { one: string; many: string };
  onFix: () => void;
  onClose: () => void;
}) {
  if (left === 0) {
    return (
      <Button variant="accent" onClick={onClose}>
        Done
      </Button>
    );
  }
  return (
    <>
      <Button onClick={onClose}>Close</Button>
      <Button variant="accent" onClick={onFix}>
        {`Fix the ${countOf(left, noun)} that did not go in`}
      </Button>
    </>
  );
}
