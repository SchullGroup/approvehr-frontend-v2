"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { AttentionMark, Button, ButtonLink, Drawer } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/api/client";
import {
  formatKobo,
  overtimeOn,
  wasDeducted,
  type DeductionKind,
  type LineSummary,
  type Payslip,
  type PayslipLoan,
  payrollApi,
  type RunException,
} from "@/lib/api/payroll";
import { useOvertimePolicy } from "@/lib/store/overtime";
import { usePayrollActions } from "@/lib/store/payroll";
import { usePayrollSettings } from "@/lib/payroll/use-settings";
import type { ApiScheduledAllowance } from "@/lib/api/pay-components";
import { AmountForm, DaysForm, HoursForm, LoanForm } from "./adjust-forms";
import { allowanceLine } from "./scheduled-note";
import { TOUCH } from "./drawer-parts";
import { LinesEditor } from "./lines-editor";
import {
  bonusOn,
  hasManualOvertime,
  hourlyFor,
  manualOvertimeHours,
  monthlyOf,
} from "./review-model";

/**
 * Adjusting one person's payslip. The one edit pattern on the Review step.
 *
 * ## What this replaced
 *
 * Four small underlined controls on every row ("Add hours", "Add", "Change",
 * "Add or edit a deduction"). With ten people that is forty links with the same
 * text, and with three hundred it is twelve hundred. Two of them edited in the
 * cell, with icon buttons well under 44px, and two opened a dialog: one table,
 * two interaction models, and a dotted underline as the only sign that a figure
 * could be changed.
 *
 * Now a row has one button. It opens this, which is the payslip worked out line
 * by line, from gross to net, with an Edit beside each line that can be changed.
 * Picking one opens that figure's form in place of the overview, with a way back.
 *
 * ## Why a drawer and not a dialog
 *
 * Somebody working down a payroll keeps the table in view: the person above and
 * below are the context for the figure they are changing. A drawer leaves them
 * there; a centred dialog covers them. On a phone it is the full width either
 * way.
 *
 * ## What it does not change
 *
 * Every save is the call the table already made, with the same payload, and is
 * followed by the same recalculation (`onSaved`). Nothing here computes a
 * payslip figure: gross, PAYE, pension and net are the engine's, as the API
 * sent them, and the overtime working is the same arithmetic the inline editor
 * showed, labelled as a preview in the sentence beside it.
 *
 * ## Read-only is the same drawer
 *
 * An approved run's figures are the record, and nothing offers to change them.
 * The drawer still opens, because "how did this person's net come to this" is
 * the question a reviewer has on an approved payroll too. It shows the same
 * lines with no Edit beside them.
 */

type View =
  | "overview"
  | "days"
  | "overtime"
  | "loan"
  | "bonus"
  | "paye"
  | "PENSION_EMPLOYEE"
  | "NHF"
  | "deductions";

/**
 * How many days the month named by "October 2026" has. People paid by the day
 * are paid by the calendar day, so the divisor is the month's own length. An
 * unreadable label falls back to 30 rather than refusing the form; the API
 * validates the count against the real period anyway.
 */
function daysInLabel(label: string): number {
  const first = new Date(`1 ${label}`);
  if (Number.isNaN(first.getTime())) return 30;
  return new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
}

/** The − minus sign, not a hyphen: it is the one that sits at figure width. */
const minus = (kobo: number) => `−${formatKobo(kobo)}`;

export function AdjustDrawer({
  slip,
  runId,
  periodLabel,
  editable,
  readOnlyReason,
  refreshing,
  employees,
  warnings,
  typedDeduction,
  scheduled,
  showOvertime,
  showBonus,
  onClose,
  onSaved,
  onAdjusted,
}: {
  /** The payslip being adjusted. Null closes the drawer. */
  slip: Payslip | null;
  runId: string;
  /** "September 2026". */
  periodLabel: string;
  editable: boolean;
  /** Why nothing here can be changed, when `editable` is false. */
  readOnlyReason: string | null;
  /** The run is being recalculated. Figures on screen are the previous ones. */
  refreshing: boolean;
  employees: readonly { id: string; grossMonthly?: number | null }[];
  warnings: readonly RunException[];
  /** What the run says about hand-typed deduction lines for this person. */
  typedDeduction: LineSummary | undefined;
  /**
   * This person's allowances on a schedule, as the API reports them for an open
   * run. Absent when there is no answer, which says nothing; empty never occurs,
   * because only people with one are in the read.
   */
  scheduled?: readonly ApiScheduledAllowance[] | undefined;
  showOvertime: boolean;
  showBonus: boolean;
  onClose: () => void;
  /** Recalculate. The wizard's `prepare`, which is what every save already did. */
  onSaved: () => void;
  /** What a lines save did, for the wizard's toast. */
  onAdjusted: (summary: string) => void;
}) {
  const actions = usePayrollActions();
  const overtimePolicy = useOvertimePolicy();
  const { settings: paySettings } = usePayrollSettings();

  /* Remembers the last real payslip: `slip` goes null the instant this closes,
     but the drawer has to stay mounted with real content so it can animate out
     rather than emptying while it slides away. */
  const open = slip !== null;
  const [shown, setShown] = useState(slip);
  if (slip && slip !== shown) setShown(slip);

  const [state, setState] = useState<{ forId: string; view: View }>({
    forId: "",
    view: "overview",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const view: View =
    shown && state.forId === shown.employeeId ? state.view : "overview";

  /* The loans on this run, with this month's instalment, balance and whether HR
     has changed it. Read from the API when the drawer opens and after each save
     (the net moves with a save); offline there is nothing to read, and the loan
     lines simply do not appear. */
  const [loansOnRun, setLoansOnRun] = useState<
    { employeeId: string; loans: PayslipLoan[] }[] | null
  >(null);
  const [loanId, setLoanId] = useState("");
  const shownId = shown?.employeeId;
  const shownNet = shown?.netKobo;
  useEffect(() => {
    if (!open || !shownId) return;
    let cancelled = false;
    payrollApi
      .runLoans(runId)
      .then((rows) => {
        if (!cancelled) setLoansOnRun(rows);
      })
      .catch(() => {
        if (!cancelled) setLoansOnRun(null);
      });
    return () => {
      cancelled = true;
    };
  }, [runId, shownId, shownNet, open]);

  const go = (next: View) => {
    if (!shown) return;
    setError(null);
    setState({ forId: shown.employeeId, view: next });
  };

  const close = () => {
    setError(null);
    setState({ forId: "", view: "overview" });
    onClose();
  };

  /**
   * One place every by-hand write goes through.
   *
   * Each returns a rebuilt run, so the table reloads rather than patching one
   * figure locally: the whole period is recomputed server-side, and a local
   * patch would show one moved number beside five stale ones. A refusal stays
   * in the form it came from, with the server's own words.
   */
  async function perform(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      go("overview");
      onSaved();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const person = shown;

  if (!person) {
    return (
      <Drawer open={false} onClose={close} title="Adjust payslip">
        {null}
      </Drawer>
    );
  }

  const employeeId = person.employeeId;
  const overridden = person.overriddenDeductions ?? [];
  const overtimeKobo = overtimeOn(person);
  const manualOvertime = hasManualOvertime(person);
  const bonus = bonusOn(person);
  const payeOn = wasDeducted(person.operates, "paye");
  const pensionOn = wasDeducted(person.operates, "pension");
  const nhfOn = wasDeducted(person.operates, "nhf");
  const typedLines =
    typedDeduction !== undefined && typedDeduction.state !== "none";
  const firstName = person.name.split(" ")[0] ?? person.name;
  /* Somebody paid by the day is paid by the calendar day, so the month they
     are counted against is the month's own length (31 in October), not the
     company's working month. Once days are typed the payslip carries the
     divisor the API used. */
  const daysWorked = person.daysWorked ?? null;
  const workingDays =
    daysWorked !== null
      ? (person.workingDays ?? daysInLabel(periodLabel))
      : daysInLabel(periodLabel);

  const canEditOvertime =
    editable && (overtimePolicy.policy.enabled || manualOvertime);
  const canEditBonus =
    editable && (paySettings.bonus.enabled || (bonus?.amountKobo ?? 0) > 0);

  const title: Record<View, string> = {
    overview: person.name,
    days: "Days worked",
    overtime: "Overtime",
    loan: "Staff loan",
    bonus: "Bonus",
    paye: "PAYE",
    PENSION_EMPLOYEE: "Pension",
    NHF: "Housing fund",
    deductions: "Other deductions",
  };

  const blocking = warnings.some((w) => w.severity === "BLOCKER");

  return (
    <Drawer
      open={open}
      onClose={close}
      title={title[view]}
      description={
        view === "overview"
          ? `${person.employeeNo} · ${periodLabel}`
          : `${person.name} · ${periodLabel}`
      }
      size="md"
      {...(view === "overview"
        ? {
            footer: (
              <>
                <ButtonLink
                  href={`/payroll/payslips/${person.id}`}
                  variant="ghost"
                  className={TOUCH}
                >
                  Open the payslip
                </ButtonLink>
                <Button
                  type="button"
                  variant="accent"
                  className={TOUCH}
                  onClick={close}
                >
                  Done
                </Button>
              </>
            ),
          }
        : {})}
    >
      {view === "overview" && (
        <div className="flex flex-col gap-5">
          {refreshing && (
            <p role="status" className="text-body-sm text-muted">
              Recalculating the payroll. The figures below are the previous ones
              until it finishes.
            </p>
          )}

          {!editable && readOnlyReason && (
            <p className="text-body-sm leading-relaxed text-body">
              {readOnlyReason}
            </p>
          )}

          {warnings.length > 0 && (
            <p className="inline-flex max-w-full items-center gap-2 text-body-sm text-muted">
              <span className="min-w-0">
                {warnings.length === 1
                  ? `1 note for ${firstName}`
                  : `${warnings.length} notes for ${firstName}`}
              </span>
              <AttentionMark
                tone={blocking ? "attention" : "info"}
                text={warnings.map((warning) => warning.message)}
              />
            </p>
          )}

          {scheduled && scheduled.length > 0 && (
            <ul className="flex flex-col gap-1 text-body-sm text-muted">
              {scheduled.map((allowance) => (
                <li key={allowance.assignmentId ?? allowance.componentId}>
                  {allowanceLine(allowance)}
                </li>
              ))}
            </ul>
          )}

          <div
            aria-busy={refreshing}
            className={cn(
              "overflow-hidden rounded-lg border border-line",
              refreshing && "opacity-60",
            )}
          >
            <SectionHead>Earned</SectionHead>
            <Line
              editColumn={editable}
              label="Gross pay"
              value={formatKobo(person.grossKobo)}
              {...(daysWorked !== null
                ? {
                    note: `Paid for ${daysWorked} of ${workingDays} days`,
                  }
                : person.unpaidDays > 0
                  ? {
                      note: `After ${person.unpaidDays} unpaid ${
                        person.unpaidDays === 1 ? "day" : "days"
                      }`,
                    }
                  : { note: "The whole month" })}
              marked={daysWorked !== null}
              edit={
                editable
                  ? {
                      label: `Pay ${person.name} by days worked`,
                      disabled: refreshing,
                      onClick: () => go("days"),
                    }
                  : undefined
              }
            />
            {showOvertime && (
              <Line
                editColumn={editable}
                label="Overtime"
                note={
                  manualOvertime
                    ? "Included in gross"
                    : overtimeKobo > 0
                      ? "Included in gross, from approved overtime"
                      : "Included in gross"
                }
                value={overtimeKobo > 0 ? formatKobo(overtimeKobo) : "—"}
                marked={manualOvertime}
                indent
                edit={
                  canEditOvertime
                    ? {
                        label: `Edit overtime for ${person.name}`,
                        disabled: refreshing,
                        onClick: () => go("overtime"),
                      }
                    : undefined
                }
              />
            )}
            {showBonus && (
              <Line
                editColumn={editable}
                label="Bonus"
                note={
                  bonus?.reason
                    ? `${bonus.reason} · included in gross`
                    : "Included in gross"
                }
                value={bonus ? formatKobo(bonus.amountKobo) : "—"}
                marked={(bonus?.amountKobo ?? 0) > 0}
                indent
                edit={
                  canEditBonus
                    ? {
                        label: `Edit bonus for ${person.name}`,
                        disabled: refreshing,
                        onClick: () => go("bonus"),
                      }
                    : undefined
                }
              />
            )}

            <SectionHead>Taken off</SectionHead>
            {payeOn ? (
              <Line
                editColumn={editable}
                label="PAYE"
                note={
                  person.payeOverridden
                    ? person.payeOverrideReason?.trim()
                      ? person.payeOverrideReason
                      : "Entered by hand instead of the tax bands"
                    : "Worked out from the tax bands"
                }
                value={minus(person.payeKobo)}
                marked={person.payeOverridden}
                edit={
                  editable
                    ? {
                        label: `Edit PAYE for ${person.name}`,
                        disabled: refreshing,
                        onClick: () => go("paye"),
                      }
                    : undefined
                }
              />
            ) : (
              <Line
                editColumn={editable}
                label="PAYE"
                note="This payroll does not deduct it"
                value="Not operated"
              />
            )}
            {pensionOn && (
              <Line
                editColumn={editable}
                label="Pension"
                note="The employee's share, taken before tax"
                value={minus(person.pensionEmployeeKobo)}
                marked={overridden.includes("PENSION_EMPLOYEE")}
                edit={
                  editable
                    ? {
                        label: `Edit pension for ${person.name}`,
                        disabled: refreshing,
                        onClick: () => go("PENSION_EMPLOYEE"),
                      }
                    : undefined
                }
              />
            )}
            {nhfOn && (
              <Line
                editColumn={editable}
                label="Housing fund"
                note="Taken before tax"
                value={minus(person.nhfKobo)}
                marked={overridden.includes("NHF")}
                edit={
                  editable
                    ? {
                        label: `Edit the housing fund for ${person.name}`,
                        disabled: refreshing,
                        onClick: () => go("NHF"),
                      }
                    : undefined
                }
              />
            )}
            {(loansOnRun?.find((row) => row.employeeId === employeeId)?.loans ?? []).map(
              (loan) => (
                <Line
                  key={loan.loanId}
                  editColumn={editable}
                  label="Staff loan"
                  note={`Owed ${formatKobo(loan.balanceBeforeKobo)}, ${formatKobo(loan.balanceAfterKobo)} after this month · of ${formatKobo(loan.accumulatedKobo)} borrowed`}
                  value={minus(loan.deductionKobo)}
                  marked={loan.overridden === true}
                  indent
                  edit={
                    editable
                      ? {
                          label: `Change this month's loan deduction for ${person.name}`,
                          disabled: refreshing,
                          onClick: () => {
                            setLoanId(loan.loanId);
                            go("loan");
                          },
                        }
                      : undefined
                  }
                />
              ),
            )}
            <Line
              editColumn={editable}
              label="Other deductions"
              note="Loan instalments, expense claims and anything typed here"
              value={
                person.otherDeductionsKobo > 0
                  ? minus(person.otherDeductionsKobo)
                  : "—"
              }
              marked={typedLines}
              edit={
                editable
                  ? {
                      label: `Edit other deductions for ${person.name}`,
                      disabled: refreshing,
                      onClick: () => go("deductions"),
                    }
                  : undefined
              }
            />

            <div className="flex items-baseline justify-between gap-4 border-t border-line bg-canvas px-4 py-4">
              <p className="text-body-sm font-semibold text-ink">Net pay</p>
              <p className="tabular text-h4 text-ink">
                {formatKobo(person.netKobo)}
              </p>
            </div>
          </div>

          {editable && (
            <p className="text-meta leading-relaxed text-muted">
              Saving a change works the whole payroll out again. Nothing is paid
              until you approve it.
            </p>
          )}
        </div>
      )}

      {view === "loan" && (() => {
        const loan = loansOnRun
          ?.find((row) => row.employeeId === employeeId)
          ?.loans.find((l) => l.loanId === loanId);
        if (!loan) return null;
        return (
          <LoanForm
            name={person.name}
            scheduledKobo={loan.scheduledKobo ?? loan.deductionKobo}
            balanceBeforeKobo={loan.balanceBeforeKobo}
            currentKobo={loan.deductionKobo}
            overridden={loan.overridden === true}
            saving={busy}
            error={error}
            onBack={() => go("overview")}
            onSave={(amountKobo) =>
              void perform(() =>
                payrollApi.setLoanDeduction(runId, {
                  loanId: loan.loanId,
                  amountKobo,
                }),
              )
            }
            onReset={() =>
              void perform(() =>
                payrollApi.clearLoanDeduction(runId, loan.loanId),
              )
            }
          />
        );
      })()}

      {view === "days" && (
        <DaysForm
          name={person.name}
          periodLabel={periodLabel}
          monthlyKobo={monthlyOf(person, employees)}
          workingDays={workingDays}
          currentDays={daysWorked}
          saving={busy}
          error={error}
          onBack={() => go("overview")}
          onSave={(days) =>
            void perform(() =>
              actions.setDaysWorked(runId, { employeeId, days }),
            )
          }
          onRemove={() =>
            void perform(() => actions.clearDaysWorked(runId, employeeId))
          }
        />
      )}

      {view === "overtime" && (
        <HoursForm
          name={person.name}
          periodLabel={periodLabel}
          hourlyKobo={hourlyFor(
            monthlyOf(person, employees),
            overtimePolicy.policy.hoursPerDay,
            paySettings.workingDaysPerMonth,
            overtimePolicy.policy.hourlyBasis,
          )}
          rate={overtimePolicy.policy.weekdayRate}
          currentHours={manualOvertimeHours(person)}
          currentKobo={manualOvertime ? overtimeKobo : 0}
          canSet={overtimePolicy.policy.enabled}
          canRemove={manualOvertime}
          saving={busy}
          error={error}
          onBack={() => go("overview")}
          onSave={(hours) =>
            void perform(() =>
              actions.setOvertimeOverride(runId, {
                employeeId,
                hours,
                kind: "WEEKDAY",
              }),
            )
          }
          onRemove={() =>
            void perform(() => actions.clearOvertimeOverride(runId, employeeId))
          }
        />
      )}

      {view === "bonus" && (
        <LinesEditor
          runId={runId}
          employeeId={employeeId}
          name={person.name}
          kind="bonus"
          onBack={() => go("overview")}
          onSaved={(summary) => {
            go("overview");
            onAdjusted(summary);
            onSaved();
          }}
        />
      )}

      {view === "deductions" && (
        <LinesEditor
          runId={runId}
          employeeId={employeeId}
          name={person.name}
          kind="deduction"
          onBack={() => go("overview")}
          onSaved={(summary) => {
            go("overview");
            onAdjusted(summary);
            onSaved();
          }}
        />
      )}

      {view === "paye" && (
        <AmountForm
          label={`PAYE for ${periodLabel}`}
          intro={
            <>
              This replaces the tax worked out from the bands, for {periodLabel}{" "}
              only. Net pay moves with what you enter; pension and the housing
              fund do not.
            </>
          }
          now={
            person.payeOverridden
              ? `${formatKobo(person.payeKobo)} is entered by hand now.${
                  person.payeOverrideReason
                    ? ` Reason given: ${person.payeOverrideReason}`
                    : ""
                }`
              : `The bands put this at ${formatKobo(person.payeKobo)}.`
          }
          valueKobo={person.payeKobo}
          placeholder="PAYE"
          saveLabel="Enter it by hand"
          {...(person.payeOverridden
            ? { undoLabel: "Undo: use the bands instead" }
            : {})}
          saving={busy}
          error={error}
          onBack={() => go("overview")}
          onSave={(payeKobo) =>
            void perform(() =>
              actions.setTaxOverride(runId, { employeeId, payeKobo }),
            )
          }
          onUndo={() =>
            void perform(() => actions.clearTaxOverride(runId, employeeId))
          }
        />
      )}

      {(view === "PENSION_EMPLOYEE" || view === "NHF") && (
        <StatutoryForm
          kind={view}
          person={person}
          periodLabel={periodLabel}
          edited={overridden.includes(view)}
          busy={busy}
          error={error}
          onBack={() => go("overview")}
          onSave={(kind, amountKobo) =>
            void perform(() =>
              actions.setDeductionOverride(runId, {
                employeeId,
                kind,
                amountKobo,
              }),
            )
          }
          onUndo={(kind) =>
            void perform(() =>
              actions.clearDeductionOverride(runId, employeeId, kind),
            )
          }
        />
      )}
    </Drawer>
  );
}

/**
 * Pension and the housing fund, which share one form.
 *
 * Statutory, so the form says what overriding one does to the rest of the
 * payslip: both are taken before tax, so PAYE and net move with it.
 */
function StatutoryForm({
  kind,
  person,
  periodLabel,
  edited,
  busy,
  error,
  onBack,
  onSave,
  onUndo,
}: {
  kind: DeductionKind;
  person: Payslip;
  periodLabel: string;
  edited: boolean;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onSave: (kind: DeductionKind, amountKobo: number) => void;
  onUndo: (kind: DeductionKind) => void;
}) {
  const name = kind === "PENSION_EMPLOYEE" ? "Pension" : "Housing fund";
  const kobo =
    kind === "PENSION_EMPLOYEE" ? person.pensionEmployeeKobo : person.nhfKobo;
  return (
    <AmountForm
      label={`${name} for ${periodLabel}`}
      intro={
        <>
          This replaces the {name.toLowerCase()} worked out for {periodLabel}{" "}
          only. Pension and the housing fund are taken off before tax is worked
          out, so PAYE and net pay move with it. Entering 0 deducts nothing from{" "}
          {person.name} this month.
        </>
      }
      now={
        edited
          ? `${formatKobo(kobo)} is entered by hand now.`
          : `${formatKobo(kobo)} was worked out for them.`
      }
      valueKobo={kobo}
      saveLabel="Enter it by hand"
      {...(edited ? { undoLabel: "Undo: use the worked-out figure" } : {})}
      saving={busy}
      error={error}
      onBack={onBack}
      onSave={(amountKobo) => onSave(kind, amountKobo)}
      onUndo={() => onUndo(kind)}
    />
  );
}

/* ---------------------------------------------------------- overview parts */

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-b border-line bg-canvas px-4 py-2 text-meta font-semibold text-muted [&:not(:first-child)]:border-t">
      {children}
    </p>
  );
}

/**
 * One line of the worked payslip.
 *
 * A line you can change has an Edit button at its end; a line you cannot has
 * nothing there, and that is the whole visible difference between the two. The
 * space is reserved either way, so the figures stay in one column down the
 * list.
 */
function Line({
  label,
  note,
  value,
  marked = false,
  indent = false,
  editColumn,
  edit,
}: {
  label: string;
  note?: string;
  value: string;
  /** A person typed this figure. */
  marked?: boolean;
  indent?: boolean;
  /** Reserve the column the Edit buttons sit in, so every figure lines up. */
  editColumn: boolean;
  edit?:
    | {
        label: string;
        disabled: boolean;
        onClick: () => void;
      }
    | undefined;
}) {
  return (
    <div
      className={cn(
        "grid items-center gap-x-3 border-b border-line px-4 py-3 last:border-b-0",
        editColumn
          ? "grid-cols-[minmax(0,1fr)_auto_3.5rem]"
          : "grid-cols-[minmax(0,1fr)_auto]",
        indent && "pl-8",
      )}
    >
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-ink">
          {label}
          {marked && (
            <span className="inline-flex items-center gap-1 text-meta leading-none text-muted">
              <Pencil aria-hidden="true" className="size-2.5" />
              entered by hand
            </span>
          )}
        </p>
        {note && (
          <p className="mt-0.5 text-meta leading-snug text-muted">{note}</p>
        )}
      </div>
      <p className="tabular text-right text-body-sm text-ink">{value}</p>
      {editColumn &&
        (edit !== undefined ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            aria-label={edit.label}
            disabled={edit.disabled}
            className={`w-14 ${TOUCH}`}
            onClick={edit.onClick}
          >
            Edit
          </Button>
        ) : (
          <span aria-hidden="true" />
        ))}
    </div>
  );
}
