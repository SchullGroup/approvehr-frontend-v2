"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Coins, Plus, Slash } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
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
  type ApiPayChange,
  type ApiPayComponent,
  type ApiResolvedAssignment,
  type AssignBody,
} from "@/lib/api/pay-components";
import {
  amountLine,
  assignmentLine,
  basisOf,
  flagChips,
  money,
  signedMoney,
} from "@/lib/pay/flags";
import { usePayrollSettings } from "@/lib/payroll/use-settings";
import {
  demoNetEffectKobo,
  useEmployeePayComponents,
  usePayComponents,
  usePayPreview,
  type PreviewChange,
} from "@/lib/store/pay-components";
import { shortDate } from "@/lib/today";

/**
 * One person's allowances and deductions — a panel, for the employee record.
 *
 * Drop it in with `<PayComponentsPanel employeeId={employee.id} />`; it owns its
 * own card, loading and errors and renders no page header, so it can sit on a
 * record page beside anything else.
 *
 * ## The preview is the whole point
 *
 * Somebody adding a ₦50,000 car allowance is not asking what the gross becomes.
 * They are asking **what lands in the account** — theirs or their employee's —
 * and the honest answer needs PAYE, pension and NHF recomputed with this
 * component's flags honoured. So every add and every removal shows that figure
 * before it saves, from `GET /preview/:employeeId`, which runs the same engine
 * the payroll run runs. Not an estimate, not a second implementation: the same
 * arithmetic, on the same rows.
 *
 * It is also the fastest way to see why the flags matter. Add a non-pensionable
 * allowance and the pension line reads "no change"; tick pensionable on the
 * definition and the same ₦50,000 costs the employee 8% and the company 10%
 * more. That is a lesson no explanatory paragraph delivers.
 *
 * ## What demo mode will and will not say
 *
 * With no API there is no engine, and the frontend's older payslip code does not
 * know about these flags — it treats every addition as pensionable, which is the
 * exact bug the backend engine's header warns about. So offline the panel shows
 * the lines and the totals, and states a take-home effect only for an after-tax
 * deduction, where it is exactly the amount and no engine is needed. Everything
 * else says the figure needs the API rather than inventing one.
 */
export function PayComponentsPanel({
  employeeId,
  className,
}: {
  employeeId: string;
  className?: string;
}) {
  const lines = useEmployeePayComponents(employeeId);
  const baseline = usePayPreview(employeeId);
  const { settings } = usePayrollSettings();
  const toast = useToast();

  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<ApiResolvedAssignment | null>(null);

  const data = lines.data;
  const assignments = data?.assignments ?? [];
  const totals = data?.totals;
  const takeHomeKobo =
    (baseline.data?.current ?? baseline.data?.payslip)?.netKobo ?? null;
  const stale = baseline.data?.taxSchedule.stale ?? false;
  const issues = baseline.data?.settingsIssues ?? [];

  const deductionKobo =
    (totals?.preTaxDeductionKobo ?? 0) + (totals?.postTaxDeductionKobo ?? 0);

  const report = (error: unknown) =>
    toast.push({
      title: "That did not work",
      tone: "danger",
      detail:
        error instanceof ApiError
          ? error.message
          : "Something went wrong. Try again.",
    });

  return (
    <Card className={className}>
      <CardHeader
        level={2}
        title="Allowances and deductions"
        action={
          lines.editable ? (
            <Button variant="accent" size="sm" onClick={() => setAdding(true)}>
              <Plus aria-hidden="true" className="size-4" />
              Add a line
            </Button>
          ) : undefined
        }
      />

      <CardBody className="flex flex-col gap-5">
        {DEMO_ENABLED && !lines.connected && !lines.loading && (
          <Callout tone="warning" title="Demo data, this browser only">
            The take-home figure runs the real payroll engine, which lives on the
            server — offline this panel shows the lines and totals only.
          </Callout>
        )}

        {/* "No monthly pay set" is not a load failure — it is the reason
            there is nothing to show, and the "Salary a month" figure below
            already says so. A red banner repeating it is noise, not help. */}
        {lines.error && !lines.error.message.includes("no monthly pay set") && (
          <LoadFailure subject="this person's pay lines" error={lines.error}  onRetry={lines.reload}/>
        )}

        {issues.length > 0 && (
          <Callout tone="danger" title="Payroll settings need attention first">
            <ul className="flex flex-col gap-1">
              {issues.map((issue) => (
                <li key={issue.field}>{issue.message}</li>
              ))}
            </ul>
            <ButtonLink href="/settings/payroll" variant="secondary" size="sm" className="mt-3">
              Fix payroll settings
            </ButtonLink>
          </Callout>
        )}

        <div className="grid gap-4 rounded-lg border border-line bg-canvas p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Figure
            label="Salary a month"
            value={
              data?.employee.grossMonthlyKobo == null
                ? "Not set yet"
                : money(data.employee.grossMonthlyKobo)
            }
            hint="before anything below"
          />
          <Figure
            label="Added to pay"
            value={totals ? signedMoney(totals.allowanceKobo) : "—"}
            hint={lineCount(
              assignments.filter((a) => a.kind === "ALLOWANCE").length,
              "allowance",
            )}
          />
          <Figure
            label="Taken off"
            value={totals ? signedMoney(-deductionKobo) : "—"}
            hint={lineCount(
              assignments.filter((a) => a.kind === "DEDUCTION").length,
              "deduction",
            )}
          />
          {/* "Needs the API" was on screen for all three of these and is a
              developer's sentence, not a reader's — and for the commonest one
              it was not even true. `takeHomeKobo` is null when the preview has
              no answer, and the usual reason is that this person has no monthly
              pay set, which the "Salary a month" figure to the left already
              says. The API being unreachable is a different fact, `available`
              is what reports it, and neither is "needs the API". */}
          <Figure
            label="Take-home this month"
            value={
              takeHomeKobo !== null
                ? money(takeHomeKobo)
                : baseline.loading
                  ? "…"
                  : data?.employee.grossMonthlyKobo == null
                    ? "Not yet"
                    : !baseline.available
                      ? "Not available"
                      : "Not worked out"
            }
            hint={
              takeHomeKobo === null &&
              !baseline.loading &&
              data?.employee.grossMonthlyKobo == null
                ? "once a monthly salary is set"
                : "after PAYE, pension and NHF"
            }
          />
        </div>

        {stale && (
          <p className="text-body-sm text-muted">
            Computed on the {baseline.data?.taxSchedule.citation} bands, which
            nobody has confirmed cover this period yet.
          </p>
        )}

        {assignments.length === 0 ? (
          <EmptyState
            compact
            icon={<Coins aria-hidden="true" />}
            title={lines.loading ? "Loading…" : "Nothing on top of salary"}
            description={
              lines.loading
                ? undefined
                : lines.editable
                  ? "Add a car allowance, a cooperative deduction, a salary advance being recovered — anything that is not the base salary."
                  : /* Without `MANAGE_PAY_STRUCTURE` there is no Add button, so
                       an instruction to add one is an instruction to nobody.
                       State what the emptiness means instead. */
                    "Nothing is added to or taken off this salary — no car allowance, no cooperative deduction, no advance being recovered."
            }
            action={
              !lines.loading && lines.editable ? (
                <Button variant="accent" size="sm" onClick={() => setAdding(true)}>
                  <Plus aria-hidden="true" className="size-4" />
                  Add the first line
                </Button>
              ) : undefined
            }
          />
        ) : (
          <TableWrap caption="Allowances and deductions on this person's pay">
            <THead>
              <TH>Line</TH>
              <TH>How it is worked out</TH>
              <TH>What it does</TH>
              <TH align="right">This month</TH>
              <TH>
                <span className="sr-only-focusable">Actions</span>
              </TH>
            </THead>
            <TBody>
              {assignments.map((row) => {
                const chips = flagChips(row, settings.pension);
                const allowance = row.kind === "ALLOWANCE";
                return (
                  <TR key={row.id}>
                    <TDPrimary
                      title={row.name}
                      subtitle={
                        row.effectiveTo
                          ? `${shortDate(row.effectiveFrom)} to ${shortDate(row.effectiveTo)}`
                          : `From ${shortDate(row.effectiveFrom)}, every month`
                      }
                    />
                    <TD>
                      <span className="text-body-sm text-body">
                        {assignmentLine(row)}
                      </span>
                      {row.note && (
                        <span className="mt-0.5 block text-meta text-muted">
                          {row.note}
                        </span>
                      )}
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
                      <span
                        className={cn(
                          "tabular text-body-sm font-medium",
                          allowance ? "text-ink" : "text-body",
                        )}
                      >
                        {allowance
                          ? signedMoney(row.resolvedKobo)
                          : signedMoney(-row.resolvedKobo)}
                      </span>
                    </TD>
                    <TD align="right">
                      {lines.editable && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRemoving(row)}
                        >
                          Stop it
                        </Button>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </TableWrap>
        )}
      </CardBody>

      {adding && (
        <AddLineDialog
          employeeId={employeeId}
          onClose={() => setAdding(false)}
          onSave={async (body) => {
            try {
              await lines.assign(body);
              toast.push({ title: "Added to their pay", tone: "success" });
              baseline.reload();
              setAdding(false);
            } catch (error) {
              report(error);
            }
          }}
        />
      )}

      {removing && (
        <RemoveLineDialog
          employeeId={employeeId}
          assignment={removing}
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            try {
              const result = await lines.remove(removing.id);
              toast.push({ title: result.note, tone: "success" });
              setRemoving(null);
            } catch (error) {
              report(error);
            }
          }}
        />
      )}
    </Card>
  );
}

/* ------------------------------------------------------------- the figures */

function Figure({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-meta font-medium text-muted">{label}</p>
      <p className="tabular mt-1 truncate text-h4 text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-meta text-faint">{hint}</p>}
    </div>
  );
}

/* --------------------------------------------------------- the effect box */

/**
 * What a change does, net first.
 *
 * Net is the headline because net is the question. The four lines under it are
 * the working, and they are shown even when they do not move — "Pension: no
 * change" on an allowance is the most useful line on the screen for anybody who
 * has been told that every allowance attracts pension.
 */
function ChangeEffect({
  change,
  loading,
  note,
}: {
  change: ApiPayChange | null;
  loading: boolean;
  note?: string;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-line bg-canvas p-4 text-body-sm text-muted">
        <Spinner size="sm" />
        Working out what it does to take-home pay…
      </div>
    );
  }

  if (!change) return null;

  const net = change.netKobo;
  const heading =
    net === 0
      ? "Take-home pay does not change"
      : `${money(Math.abs(net))} ${net > 0 ? "more" : "less"} in the account`;

  const rows: { label: string; kobo: number }[] = [
    { label: "Gross pay", kobo: change.grossKobo },
    { label: "PAYE", kobo: change.payeKobo },
    { label: "Pension (employee)", kobo: change.pensionEmployeeKobo },
    { label: "NHF", kobo: change.nhfKobo },
  ];

  return (
    <div className="rounded-lg border border-accent-line bg-accent-soft p-4">
      <p className="flex items-center gap-2 text-h4 text-ink">
        {net > 0 ? (
          <ArrowUp aria-hidden="true" className="size-5 text-success-text" />
        ) : net < 0 ? (
          <ArrowDown aria-hidden="true" className="size-5 text-danger-text" />
        ) : (
          <Slash aria-hidden="true" className="size-5 text-muted" />
        )}
        {heading}
      </p>

      <dl className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-body-sm text-body">{row.label}</dt>
            <dd className="tabular text-body-sm font-medium text-ink">
              {row.kobo === 0 ? "no change" : signedMoney(row.kobo)}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 border-t border-accent-line pt-3 text-body-sm text-body">
        Costs the company{" "}
        <span className="tabular font-medium text-ink">
          {change.employerCostKobo === 0
            ? "nothing more"
            : `${signedMoney(change.employerCostKobo)} a month`}
        </span>{" "}
        — salary plus the employer pension on it.
      </p>

      {note && <p className="mt-2 text-body-sm text-body">{note}</p>}
    </div>
  );
}

/* -------------------------------------------------------------- add a line */

type AddDraft = {
  componentId: string;
  amount: string;
  rate: string;
  from: string;
  to: string;
  note: string;
};

const EMPTY_DRAFT: AddDraft = {
  componentId: "",
  amount: "",
  rate: "",
  from: "",
  to: "",
  note: "",
};

/**
 * Pick a component, set the figure, read the effect, save.
 *
 * The library request lives in here rather than in the panel so that a screen
 * showing somebody their own pay never fires it — listing the definitions needs
 * `VIEW_SALARIES`, and a panel that 403s on mount for the person whose pay it is
 * would be a worse answer than not asking.
 */
function AddLineDialog({
  employeeId,
  onClose,
  onSave,
}: {
  employeeId: string;
  onClose: () => void;
  onSave: (body: AssignBody) => Promise<void>;
}) {
  const library = usePayComponents({ active: true, pageSize: 100 });
  const { settings } = usePayrollSettings();
  const [draft, setDraft] = useState<AddDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  const chosen = useMemo(
    () => library.rows.find((row) => row.id === draft.componentId) ?? null,
    [library.rows, draft.componentId],
  );

  const fixed = chosen?.basis === "FIXED";
  const amountKobo =
    fixed && draft.amount.trim() !== "" && Number(draft.amount) > 0
      ? kobo(Number(draft.amount))
      : null;
  const rate =
    chosen && !fixed && draft.rate.trim() !== "" && Number(draft.rate) > 0
      ? rateFraction(Number(draft.rate))
      : null;

  /* Debounced so typing "50000" is one request at the end rather than five on
     the way there. The picker is not debounced — choosing a component should
     answer at once. */
  const settledAmount = useDebounced(amountKobo, 400);
  const settledRate = useDebounced(rate, 400);

  const resolvable = amountKobo !== null || rate !== null;

  /* Nothing is asked until there is a figure to ask about. A component picked
     with the amount still blank would preview as a line of ₦0.00 and answer
     "take-home does not change", which is true and useless — and `assign`
     refuses that row anyway. */
  const change: PreviewChange =
    chosen && (settledAmount !== null || settledRate !== null)
      ? {
          addComponentId: chosen.id,
          ...(settledAmount !== null ? { addAmountKobo: settledAmount } : {}),
          ...(settledRate !== null ? { addRate: settledRate } : {}),
        }
      : {};
  const preview = usePayPreview(employeeId, change);

  /** The preview always prices a full month. Say so when the start is later. */
  const startsLater =
    draft.from !== "" &&
    preview.data !== null &&
    draft.from > preview.data.period.end;

  const allowances = library.rows.filter((row) => row.kind === "ALLOWANCE");
  const deductions = library.rows.filter((row) => row.kind === "DEDUCTION");

  const submit = async () => {
    if (!chosen || !resolvable || saving) return;
    setSaving(true);
    try {
      await onSave({
        payComponentId: chosen.id,
        ...(amountKobo !== null ? { amountKobo } : {}),
        ...(rate !== null ? { rate } : {}),
        ...(draft.from ? { effectiveFrom: draft.from } : {}),
        ...(draft.to ? { effectiveTo: draft.to } : {}),
        ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Add to this person's pay"
      description="Pick what it is, set the figure, and see what it does to their take-home before you save."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={saving}
            disabled={!chosen || !resolvable}
            onClick={() => void submit()}
          >
            Save it
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {DEMO_ENABLED && !library.connected && !library.loading && (
          <Callout tone="warning" title="Demo data, this browser only">
            Adding a line needs the API — pay set in a browser would never reach
            a payroll run.
          </Callout>
        )}

        {/* Reading the definitions needs VIEW_SALARIES. An account that may
            assign but not read the library gets the reason rather than an empty
            list with no explanation. */}
        {library.error && (
          <LoadFailure subject="the list to choose from" error={library.error}  onRetry={library.reload}/>
        )}

        <Field label="What is it?" required>
          <Select
            placeholder="Choose an allowance or a deduction"
            value={draft.componentId}
            onChange={(e) => {
              const value = e.target.value;
              /* The default is filled in here, in the event, rather than by an
                 effect watching the choice. Prefilling is a consequence of
                 picking something, not state to be kept in sync — and an effect
                 doing it would also wipe a figure the user had already typed
                 whenever the library list refreshed underneath them. */
              const picked = library.rows.find((row) => row.id === value);
              setDraft((current) => ({
                ...current,
                componentId: value,
                amount:
                  picked?.defaultAmountKobo != null
                    ? String(naira(picked.defaultAmountKobo))
                    : "",
                rate:
                  picked?.defaultRate != null
                    ? String(ratePercent(picked.defaultRate))
                    : "",
              }));
            }}
          >
            <optgroup label="Allowances — added to pay">
              {allowances.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Deductions — taken off pay">
              {deductions.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </optgroup>
          </Select>
        </Field>

        {chosen && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {flagChips(chosen, settings.pension).map((chip) => (
                <span key={chip.label} title={chip.why}>
                  <Badge size="sm" tone={chip.tone} className="cursor-help">
                    {chip.label}
                  </Badge>
                </span>
              ))}
              <span className="text-body-sm text-muted">
                {amountLine(chosen)}
              </span>
            </div>

            <ul className="flex flex-col gap-1">
              {flagChips(chosen, settings.pension).map((chip) => (
                <li key={chip.label} className="text-body-sm leading-relaxed text-body">
                  {chip.why}
                </li>
              ))}
            </ul>

            {fixed ? (
              <Field
                label="Amount each month (₦)"
                required
                help="What this person gets. It does not change anybody else."
              >
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={1000}
                  value={draft.amount}
                  onChange={(e) => {
                    const value = e.target.value;
                    setDraft((current) => ({ ...current, amount: value }));
                  }}
                />
              </Field>
            ) : (
              <Field
                label={`Percentage of ${basisOf(chosen.basis)}`}
                required
                help="100 is one whole month's pay."
              >
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.5}
                  value={draft.rate}
                  onChange={(e) => {
                    const value = e.target.value;
                    setDraft((current) => ({ ...current, rate: value }));
                  }}
                />
              </Field>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Starts" help="Blank starts it this month.">
                <Input
                  type="date"
                  value={draft.from}
                  onChange={(e) => {
                    const value = e.target.value;
                    setDraft((current) => ({ ...current, from: value }));
                  }}
                />
              </Field>
              <Field
                label="Ends"
                help="Blank keeps it running every month. A one-off ends in the month it is paid."
              >
                <Input
                  type="date"
                  value={draft.to}
                  onChange={(e) => {
                    const value = e.target.value;
                    setDraft((current) => ({ ...current, to: value }));
                  }}
                />
              </Field>
            </div>

            <Field label="Note" help="Why this person has it. Optional.">
              <Input
                value={draft.note}
                maxLength={200}
                onChange={(e) => {
                  const value = e.target.value;
                  setDraft((current) => ({ ...current, note: value }));
                }}
              />
            </Field>

            {resolvable &&
              (preview.available ? (
                <ChangeEffect
                  change={preview.data?.change ?? null}
                  loading={preview.loading}
                  {...(startsLater
                    ? {
                        note: `It starts ${shortDate(draft.from)}, so this is the effect on a full month from then.`,
                      }
                    : {})}
                />
              ) : (
                <OfflineEffect component={chosen} amountKobo={amountKobo} />
              ))}

            <LoadFailure
              subject="the effect on their pay"
              error={preview.error}
             onRetry={preview.reload}/>
          </>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------ stop a line */

function RemoveLineDialog({
  employeeId,
  assignment,
  onClose,
  onConfirm,
}: {
  employeeId: string;
  assignment: ApiResolvedAssignment;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const preview = usePayPreview(employeeId, { dropAssignmentId: assignment.id });
  const [saving, setSaving] = useState(false);

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={`Stop ${assignment.name}?`}
      description="It ends at the end of last month, so the next run does not include it. Payslips that already show it are unchanged."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Keep it
          </Button>
          <Button
            variant="danger"
            loading={saving}
            onClick={() => {
              setSaving(true);
              void onConfirm().finally(() => setSaving(false));
            }}
          >
            Stop it
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {preview.available ? (
          <ChangeEffect
            change={preview.data?.change ?? null}
            loading={preview.loading}
          />
        ) : (
          <OfflineEffect
            component={assignment}
            amountKobo={assignment.resolvedKobo === 0 ? null : -assignment.resolvedKobo}
          />
        )}

        <LoadFailure subject="the effect on their pay" error={preview.error}  onRetry={preview.reload}/>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------- offline substitute */

/**
 * What demo mode may honestly say about take-home pay.
 *
 * An after-tax deduction comes off after PAYE, pension and NHF are all settled,
 * so take-home moves by exactly its own amount and no engine is needed to say
 * so. Everything else — every allowance, every before-tax deduction — changes
 * the tax base, and the only correct answer to that lives on the server. This
 * says which case it is instead of showing a figure it cannot stand behind.
 */
function OfflineEffect({
  component,
  amountKobo,
}: {
  component: Pick<ApiPayComponent, "kind" | "preTax" | "basis">;
  amountKobo: number | null;
}) {
  const exact = demoNetEffectKobo(component, amountKobo);

  return (
    <div className="rounded-lg border border-line bg-canvas p-4">
      {exact === null ? (
        <p className="text-body-sm leading-relaxed text-body">
          The take-home figure needs the API. It recomputes PAYE, pension and NHF
          with this line&apos;s tax and pension settings, and there is one
          implementation of that — on the server, the same one the payroll run
          uses.
        </p>
      ) : (
        <p className="text-body-sm text-ink">
          Take-home {exact < 0 ? "falls" : "rises"} by exactly{" "}
          <span className="tabular font-semibold">{money(Math.abs(exact))}</span>{" "}
          — an after-tax deduction does not change PAYE, pension or NHF, so
          adding or stopping one moves take-home by its own amount and nothing
          else.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ helper */

/** "1 allowance line", "3 allowance lines". One is not "1 lines". */
function lineCount(count: number, kind: string): string {
  return `${count} ${kind} line${count === 1 ? "" : "s"}`;
}

function useDebounced<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}
