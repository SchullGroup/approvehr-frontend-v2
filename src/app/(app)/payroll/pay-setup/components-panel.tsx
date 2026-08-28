"use client";

import { useEffect, useMemo, useState } from "react";
import { Coins, Pencil, Plus, Scissors, Search, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  ConfirmDialog,
  Drawer,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  SegmentedControl,
  Switch,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { ApiError } from "@/lib/api/client";
import {
  kobo,
  naira,
  rateFraction,
  ratePercent,
  type ApiPayComponent,
  type CreatePayComponentBody,
  type PayComponentBasis,
  type PayComponentKind,
  type UpdatePayComponentBody,
} from "@/lib/api/pay-components";
import {
  amountLine,
  basisOf,
  flagChips,
  money,
  pensionSwitch,
  percent,
  preTaxSwitch,
  taxableSwitch,
} from "@/lib/pay/flags";
import { usePayrollSettings } from "@/lib/payroll/use-settings";
import {
  usePayComponentDetail,
  usePayComponents,
} from "@/lib/store/pay-components";
import { shortDate } from "@/lib/today";

/**
 * One kind of pay component — the Allowances tab or the Deductions tab.
 *
 * ## The flags are the screen
 *
 * A component's name and amount are the easy part. What decides whether the
 * payroll run is right is three booleans: does PAYE apply, does pension apply,
 * does it come off before or after tax. So the table has a column for them and
 * it is written in words — "Taxed", "Counts for pension", "Before tax" — with
 * the consequence on the badge's tooltip and spelled out in full on the form
 * that sets them. Nothing on this screen prints `taxable: true`, because nobody
 * outside a payroll department can act on that.
 *
 * The wording lives in `lib/pay/flags.ts` so the table, the form and the
 * per-person panel cannot drift apart.
 *
 * ## Off, not gone
 *
 * Every row can be switched off, and only a row nobody has ever been on can be
 * archived. That is not timidity — a component is what a payslip line points at,
 * so deleting one makes last year's payslip unexplainable. "Turn off" stops the
 * next run from charging it and is reversible in a click, which is what somebody
 * asking to delete it almost always meant.
 *
 * The ones we ship are marked "Built in" and cannot be archived at all. The
 * drawer says so in a sentence and puts the button that does the intended thing
 * — turn it off — beside the reason.
 */

const COPY = {
  ALLOWANCE: {
    plural: "allowances",
    /* Carries its own article. "an {one}" would print "an deduction". */
    one: "an allowance",
    caption: "Allowances, with what each one does to tax and pension",
    title: "Allowances",
    description: "Each one carries whether tax and pension apply to it.",
    add: "Add an allowance",
    empty: "No allowances yet",
    emptyHint:
      "An allowance is anything paid on top of salary — a car allowance, a housing top-up, 13th month.",
    icon: <Coins aria-hidden="true" />,
  },
  DEDUCTION: {
    plural: "deductions",
    one: "a deduction",
    caption: "Deductions, with what each one does to tax and take-home pay",
    title: "Deductions",
    description: "Each one carries whether it comes off before or after tax.",
    add: "Add a deduction",
    empty: "No deductions yet",
    emptyHint:
      "A deduction is anything taken off pay — union dues, a cooperative contribution, a salary advance being recovered.",
    icon: <Scissors aria-hidden="true" />,
  },
} as const;

export function ComponentsPanel({ kind }: { kind: PayComponentKind }) {
  const copy = COPY[kind];
  const [query, setQuery] = useState("");
  const search = useDebounced(query.trim(), 250);
  const [includeArchived, setIncludeArchived] = useState(false);

  const components = usePayComponents({
    kind,
    ...(search ? { q: search } : {}),
    ...(includeArchived ? { includeArchived: true } : {}),
    pageSize: 100,
  });
  const { settings } = usePayrollSettings();
  const toast = useToast();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ApiPayComponent | null>(null);
  const [archiving, setArchiving] = useState<ApiPayComponent | null>(null);
  const [viewing, setViewing] = useState<ApiPayComponent | null>(null);

  const onCount = useMemo(
    () => components.rows.filter((row) => row.active && !row.archived).length,
    [components.rows],
  );

  /** Every mutation reports its own failure — the API messages are the useful
      part, and the archive refusal names the people still on the component. */
  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      toast.push({ title: success, tone: "success" });
      return true;
    } catch (error) {
      toast.push({
        title: "That did not work",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
      return false;
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {DEMO_ENABLED && !components.connected && !components.loading && (
        <Callout tone="warning" title="Demo data, this browser only">
          These are the {copy.plural} ApproveHR sets up for a new company. Adding
          or changing one needs the API — a deduction kept in a browser would
          never reach a payroll run.
        </Callout>
      )}

      <LoadFailure subject={`the ${copy.plural}`} error={components.error}  onRetry={components.reload}/>

      <Card>
        <CardHeader
          level={2}
          title={copy.title}
          description={copy.description}
          action={
            components.editable ? (
              <Button variant="accent" size="sm" onClick={() => setCreating(true)}>
                <Plus aria-hidden="true" className="size-4" />
                {copy.add}
              </Button>
            ) : undefined
          }
        />

        <CardBody className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="w-full max-w-xs">
              <Input
                type="search"
                value={query}
                placeholder={`Search ${copy.plural}`}
                aria-label={`Search ${copy.plural}`}
                icon={<Search aria-hidden="true" />}
                onChange={(e) => {
                  const value = e.target.value;
                  setQuery(value);
                }}
              />
            </div>
            <div className="flex items-center gap-4">
              <p className="text-body-sm text-muted">
                {onCount} switched on
              </p>
              <Checkbox
                label="Show archived"
                checked={includeArchived}
                onChange={(e) => {
                  const value = e.target.checked;
                  setIncludeArchived(value);
                }}
              />
            </div>
          </div>

          {components.rows.length === 0 ? (
            <EmptyState
              compact
              icon={copy.icon}
              title={
                components.loading
                  ? "Loading…"
                  : search
                    ? "Nothing matches that"
                    : copy.empty
              }
              description={
                components.loading
                  ? undefined
                  : search
                    ? "Try a different name."
                    : copy.emptyHint
              }
              action={
                !components.loading && !search && components.editable ? (
                  <Button
                    variant="accent"
                    size="sm"
                    onClick={() => setCreating(true)}
                  >
                    <Plus aria-hidden="true" className="size-4" />
                    {copy.add}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <TableWrap caption={copy.caption}>
              <THead>
                <TH>Name</TH>
                <TH>How much</TH>
                <TH>What it does</TH>
                <TH align="right">People</TH>
                <TH>Status</TH>
                <TH>
                  <span className="sr-only-focusable">Actions</span>
                </TH>
              </THead>
              <TBody>
                {components.rows.map((row) => (
                  <ComponentRow
                    key={row.id}
                    row={row}
                    rates={settings.pension}
                    editable={components.editable}
                    onView={() => setViewing(row)}
                    onEdit={() => setEditing(row)}
                    onArchive={() => setArchiving(row)}
                    onToggle={() =>
                      void run(
                        () => components.setActive(row.id, !row.active),
                        row.active
                          ? `${row.name} is off. The next run will not include it.`
                          : `${row.name} is on again.`,
                      )
                    }
                  />
                ))}
              </TBody>
            </TableWrap>
          )}
        </CardBody>
      </Card>

      {(creating || editing) && (
        <ComponentDialog
          kind={kind}
          component={editing}
          rates={settings.pension}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onCreate={async (body) => {
            const ok = await run(() => components.create(body), `${body.name} added`);
            if (ok) setCreating(false);
          }}
          onUpdate={async (id, body) => {
            const ok = await run(() => components.update(id, body), "Saved");
            if (ok) setEditing(null);
          }}
        />
      )}

      {archiving && (
        <ConfirmDialog
          open
          tone="danger"
          title={`Archive ${archiving.name}?`}
          confirmLabel="Archive it"
          onClose={() => setArchiving(null)}
          onConfirm={() => {
            void run(
              () => components.archive(archiving.id),
              `${archiving.name} archived`,
            ).then((ok) => {
              if (ok) setArchiving(null);
            });
          }}
          body={
            <>
              <p>
                It stops appearing when you add a line to somebody&apos;s pay.
                Payslips that already show it are unchanged.
              </p>
              {archiving.assignmentCount > 0 && (
                <p className="mt-2">
                  {archiving.assignmentCount === 1
                    ? "One person has been on it."
                    : `${archiving.assignmentCount} people have been on it.`}{" "}
                  If anyone still is, this will be refused and it will name them
                  — take them off first, or turn it off instead.
                </p>
              )}
            </>
          }
        />
      )}

      {viewing && (
        <AssigneesDrawer
          component={viewing}
          rates={settings.pension}
          editable={components.editable}
          onClose={() => setViewing(null)}
          onEdit={() => {
            setEditing(viewing);
            setViewing(null);
          }}
          onToggle={() =>
            void run(
              () => components.setActive(viewing.id, !viewing.active),
              viewing.active
                ? `${viewing.name} is off. The next run will not include it.`
                : `${viewing.name} is on again.`,
            ).then(() => setViewing(null))
          }
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- a row */

type Rates = { employeeRate: number; employerRate: number };

function ComponentRow({
  row,
  rates,
  editable,
  onView,
  onEdit,
  onArchive,
  onToggle,
}: {
  row: ApiPayComponent;
  rates: Rates;
  editable: boolean;
  onView: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onToggle: () => void;
}) {
  const chips = flagChips(row, rates);

  return (
    <TR interactive onClick={onView}>
      <TDPrimary
        title={
          /* A button, not only a clickable row. `tr` with an onClick is not
             reachable by keyboard and does not appear in the accessibility
             tree at all — the row click stays as a convenience for a mouse,
             and this is the control that actually opens the drawer. */
          <span className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="text-left font-medium text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
              onClick={(e) => {
                e.stopPropagation();
                onView();
              }}
            >
              {row.name}
            </button>
            {row.isSystem && (
              /* `title` on the wrapper, not the Badge: Badge takes no DOM
                 props, and the label already carries the meaning — the tooltip
                 is the extra sentence, not the only one. The drawer says the
                 same thing in full for anybody not using a mouse. */
              <span title="Built in. It can be turned off but not removed — payslips already point at it.">
                <Badge size="sm" tone="neutral" className="cursor-help">
                  Built in
                </Badge>
              </span>
            )}
          </span>
        }
        subtitle={row.code}
      />

      <TD>
        <span className="text-body-sm text-body">{amountLine(row)}</span>
      </TD>

      <TD>
        <span className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <span key={chip.label} title={chip.why}>
              <Badge size="sm" tone={chip.tone} className="cursor-help">
                {chip.label}
              </Badge>
            </span>
          ))}
        </span>
      </TD>

      <TD align="right">
        <span className="tabular text-body-sm text-body">
          {row.assignmentCount}
        </span>
      </TD>

      <TD>
        {row.archived ? (
          <Badge size="sm" tone="warning">
            Archived
          </Badge>
        ) : row.active ? (
          <Badge size="sm" tone="success" dot>
            On
          </Badge>
        ) : (
          <Badge size="sm" tone="neutral" dot>
            Off
          </Badge>
        )}
      </TD>

      {/* The row opens the drawer, so each control below stops the click from
          reaching it. Done per button rather than on a wrapping span: a click
          handler on a plain span is not something a keyboard can reach. */}
      <TD>
        {editable && !row.archived ? (
          <span className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
            >
              {row.active ? "Turn off" : "Turn on"}
            </Button>
            <IconButton
              size="sm"
              label={`Edit ${row.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
            >
              <Pencil aria-hidden="true" className="size-4" />
            </IconButton>
            {row.isSystem ? (
              <IconButton
                size="sm"
                disabled
                label="Built in — turn it off instead of removing it"
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </IconButton>
            ) : (
              <IconButton
                size="sm"
                label={`Archive ${row.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onArchive();
                }}
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </IconButton>
            )}
          </span>
        ) : null}
      </TD>
    </TR>
  );
}

/* ------------------------------------------------------------- who is on it */

function AssigneesDrawer({
  component,
  rates,
  editable,
  onClose,
  onEdit,
  onToggle,
}: {
  component: ApiPayComponent;
  rates: Rates;
  editable: boolean;
  onClose: () => void;
  onEdit: () => void;
  onToggle: () => void;
}) {
  const { detail, loading, error } = usePayComponentDetail(component.id);
  const chips = flagChips(component, rates);
  const assignees = detail?.assignees ?? [];

  return (
    <Drawer
      open
      onClose={onClose}
      title={component.name}
      description={amountLine(component)}
      footer={
        editable ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onEdit}>
              <Pencil aria-hidden="true" className="size-4" />
              Edit
            </Button>
            <Button variant="secondary" size="sm" onClick={onToggle}>
              {component.active ? "Turn off" : "Turn on"}
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <Badge key={chip.label} tone={chip.tone} size="sm">
              {chip.label}
            </Badge>
          ))}
        </div>

        <ul className="flex flex-col gap-2">
          {chips.map((chip) => (
            <li key={chip.label} className="text-body-sm leading-relaxed text-body">
              <span className="font-medium text-ink">{chip.label}</span> — {chip.why}
            </li>
          ))}
        </ul>

        {component.isSystem && (
          <div className="rounded-lg border border-line bg-canvas p-4">
            <p className="text-body-sm font-semibold text-ink">
              Built in, so it cannot be removed
            </p>
            <p className="mt-1 text-body-sm leading-relaxed text-body">
              Payslips point at it by name. Turning it off stops the next run
              from charging it and leaves those payslips readable.
            </p>
            {editable && (
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={onToggle}
              >
                {component.active ? "Turn it off" : "Turn it on"}
              </Button>
            )}
          </div>
        )}

        {error && (
          <LoadFailure subject="who is on it" error={error} />
        )}

        <div>
          <h3 className="text-body-sm font-semibold text-ink">
            {loading
              ? "Who is on it"
              : assignees.length === 0
                ? "Nobody is on it yet"
                : `On it now: ${detail?.liveAssignments ?? 0} of ${assignees.length}`}
          </h3>

          {assignees.length === 0 ? (
            <p className="mt-1.5 text-body-sm leading-relaxed text-muted">
              {loading
                ? "Reading the assignments…"
                : "Add it to somebody from their record, on the Pay tab."}
            </p>
          ) : (
            <ul className="mt-3 flex flex-col divide-y divide-line">
              {assignees.map((person) => (
                <li
                  key={person.assignmentId}
                  className="flex items-start justify-between gap-3 py-2.5"
                >
                  <span className="min-w-0">
                    <span className="block text-body-sm font-medium text-ink">
                      {person.name}
                    </span>
                    <span className="block text-meta text-muted">
                      From {shortDate(person.effectiveFrom)}
                      {person.effectiveTo
                        ? ` to ${shortDate(person.effectiveTo)}`
                        : " — every month"}
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-body-sm text-body">
                    {person.amountKobo !== null
                      ? money(person.amountKobo)
                      : person.rate !== null
                        ? `${percent(person.rate)} of ${basisOf(component.basis)}`
                        : "Default"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Drawer>
  );
}

/* --------------------------------------------------------------- the form */

type Draft = {
  name: string;
  basis: PayComponentBasis;
  /** Naira, as typed. Empty means "it differs by person". */
  amount: string;
  /** Percentage, as typed. 7.5 means 7.5%. */
  rate: string;
  taxable: boolean;
  pensionable: boolean;
  preTax: boolean;
};

const BASIS_OPTIONS: { value: PayComponentBasis; label: string }[] = [
  { value: "FIXED", label: "A fixed amount" },
  { value: "PERCENT_OF_GROSS", label: "% of monthly pay" },
  { value: "PERCENT_OF_BASIC", label: "% of basic" },
];

/**
 * Define or edit one component.
 *
 * The flags are switches with the consequence written under them, and the
 * consequence changes as you toggle — so the sentence on screen is always the
 * one that describes what saving would do. That is the whole reason they are
 * switches rather than checkboxes in a row: there is room for the sentence.
 *
 * Leaving the amount blank is a real choice and the form says so. Most
 * components differ by person — a car allowance always does — and a default
 * nobody checked is worse than a blank somebody has to fill in.
 */
function ComponentDialog({
  kind,
  component,
  rates,
  onClose,
  onCreate,
  onUpdate,
}: {
  kind: PayComponentKind;
  component: ApiPayComponent | null;
  rates: Rates;
  onClose: () => void;
  onCreate: (body: CreatePayComponentBody) => Promise<void>;
  onUpdate: (id: string, body: UpdatePayComponentBody) => Promise<void>;
}) {
  const editing = component !== null;
  const [draft, setDraft] = useState<Draft>({
    name: component?.name ?? "",
    basis: component?.basis ?? "FIXED",
    amount:
      component?.defaultAmountKobo != null
        ? String(naira(component.defaultAmountKobo))
        : "",
    rate: component?.defaultRate != null ? String(ratePercent(component.defaultRate)) : "",
    taxable: component?.taxable ?? true,
    pensionable: component?.pensionable ?? false,
    preTax: component?.preTax ?? false,
  });
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof Draft>(field: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [field]: value }));

  const fixed = draft.basis === "FIXED";
  const amountKobo = draft.amount.trim() === "" ? null : kobo(Number(draft.amount));
  const rate = draft.rate.trim() === "" ? null : rateFraction(Number(draft.rate));

  const nameError =
    draft.name.trim().length > 0 && draft.name.trim().length < 2
      ? "Give it a name of at least two characters."
      : undefined;
  const amountError =
    fixed && draft.amount.trim() !== "" && !(Number(draft.amount) > 0)
      ? "Either a figure above zero, or leave it blank to set it per person."
      : undefined;
  const rateError =
    !fixed && draft.rate.trim() !== "" && !(Number(draft.rate) > 0)
      ? "Either a percentage above zero, or leave it blank to set it per person."
      : undefined;

  const valid =
    draft.name.trim().length >= 2 && !amountError && !rateError && !nameError;

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      if (editing && component) {
        /* The unused half is nulled explicitly rather than left behind: a row
           that changed from a fixed amount to a percentage still holds the old
           amount, and the API would rather refuse the pair than guess. */
        await onUpdate(component.id, {
          name: draft.name.trim(),
          basis: draft.basis,
          defaultAmountKobo: fixed ? amountKobo : null,
          defaultRate: fixed ? null : rate,
          ...(kind === "ALLOWANCE"
            ? { taxable: draft.taxable, pensionable: draft.pensionable }
            : { preTax: draft.preTax }),
        });
      } else {
        await onCreate({
          name: draft.name.trim(),
          kind,
          basis: draft.basis,
          /* Omitted, never null: the create schema takes a number or nothing. */
          ...(fixed && amountKobo !== null ? { defaultAmountKobo: amountKobo } : {}),
          ...(!fixed && rate !== null ? { defaultRate: rate } : {}),
          ...(kind === "ALLOWANCE"
            ? { taxable: draft.taxable, pensionable: draft.pensionable }
            : { preTax: draft.preTax }),
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const taxable = taxableSwitch(draft.taxable);
  const pension = pensionSwitch(draft.pensionable, rates);
  const preTax = preTaxSwitch(draft.preTax);

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={
        editing
          ? `Edit ${component?.name}`
          : kind === "ALLOWANCE"
            ? "Add an allowance"
            : "Add a deduction"
      }
      description={
        editing
          ? "The code and the kind stay as they are — payslips already point at them."
          : "Name it the way it should read on a payslip. We work out the code."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={saving}
            disabled={!valid}
            onClick={() => void submit()}
          >
            {editing ? "Save" : `Add ${kind === "ALLOWANCE" ? "allowance" : "deduction"}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field
          label="Name"
          required
          {...(nameError ? { error: nameError } : {})}
          help={
            editing
              ? undefined
              : kind === "ALLOWANCE"
                ? "For example: Car allowance."
                : "For example: Cooperative contribution."
          }
        >
          <Input
            value={draft.name}
            autoFocus
            maxLength={60}
            onChange={(e) => {
              const value = e.target.value;
              set("name", value);
            }}
          />
        </Field>

        <div className="flex flex-col gap-2">
          <p className="text-body-sm font-medium text-ink">How is it worked out?</p>
          <SegmentedControl
            label="How the amount is worked out"
            options={BASIS_OPTIONS}
            value={draft.basis}
            onChange={(value) => set("basis", value)}
          />
        </div>

        {fixed ? (
          <Field
            optional
            label="Amount each month (₦)"
            help="Leave it blank if the figure differs by person — most do."
            {...(amountError ? { error: amountError } : {})}>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step={100}
              placeholder="Set per person"
              value={draft.amount}
              onChange={(e) => {
                const value = e.target.value;
                set("amount", value);
              }}
            />
          </Field>
        ) : (
          <Field
            label={`Percentage of ${basisOf(draft.basis)}`}
            help={
              draft.basis === "PERCENT_OF_GROSS"
                ? "100 is one whole month's pay — which is what a 13th month is."
                : "Blank if it comes from an agreement that differs by person."
            }
            {...(rateError ? { error: rateError } : {})}
          >
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step={0.5}
              placeholder="Set per person"
              value={draft.rate}
              onChange={(e) => {
                const value = e.target.value;
                set("rate", value);
              }}
            />
          </Field>
        )}

        <div className="flex flex-col gap-4 rounded-lg border border-line bg-canvas p-4">
          {kind === "ALLOWANCE" ? (
            <>
              <Switch
                label={taxable.label}
                description={taxable.why}
                checked={draft.taxable}
                onChange={(e) => {
                  const value = e.target.checked;
                  set("taxable", value);
                }}
              />
              <Switch
                label={pension.label}
                description={pension.why}
                checked={draft.pensionable}
                onChange={(e) => {
                  const value = e.target.checked;
                  set("pensionable", value);
                }}
              />
            </>
          ) : (
            <Switch
              label={preTax.label}
              description={preTax.why}
              checked={draft.preTax}
              onChange={(e) => {
                const value = e.target.checked;
                set("preTax", value);
              }}
            />
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ helper */

function useDebounced<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}
