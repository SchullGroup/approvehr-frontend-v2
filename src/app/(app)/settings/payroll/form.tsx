"use client";

import { useMemo, useState } from "react";
import { Lock, RotateCcw, Save } from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Disclosure,
  EmptyState,
  Field,
  FieldSet,
  Input,
  Money,
  Select,
  Skeleton,
  Switch,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { naira, wasDeducted, type StatutoryOperation } from "@/lib/api/payroll";
import { usePermissions } from "@/lib/permissions";
import {
  quoteSettingsFrom,
  usePayslipQuote,
} from "@/lib/store/payslip-quote";
import {
  STATUTORY,
  validateSettings,
  type PayrollSettings,
  type PensionComponent,
} from "@/lib/payroll/settings";
import { usePayrollSettings } from "@/lib/payroll/use-settings";
import {
  DEMO_REFUSAL,
  useDeductionSwitches,
} from "@/lib/store/payroll-deductions";

/** The six sub-forms, each its own disclosure. */
type Section = "deductions" | "working" | "split" | "pension" | "nhf" | "checks";

/**
 * The three statutory deductions, as questions.
 *
 * Phrased as questions with the answer stated, never as bare toggles: "Do you
 * deduct PAYE for your staff?" is answerable by a shop owner from memory, and
 * "PAYE" beside a switch is a setting they have to go and read about. `off` says
 * what the answer means for the payslip; the legal consequence comes from the
 * API's own `statutoryNotices` and is never written here — two wordings for one
 * legal fact is how the two stop agreeing.
 *
 * `path` is where the switch lives on the local draft, so the preview and the
 * badges read one shape whichever mode the screen is in.
 */
const DEDUCTION_COPY = {
  payeEnabled: {
    noun: "PAYE",
    path: "paye",
    question: "Do you deduct PAYE for your staff?",
    on: "Income tax comes off every salary and is remitted to the state tax office each month.",
    off: "Nobody's pay has tax taken off it, and payslips show no PAYE line at all.",
  },
  pensionEnabled: {
    noun: "Pension",
    path: "pension",
    question: "Do you run a pension scheme?",
    on: "Contributions come off pay and your own contribution is added on top.",
    off: "Nothing is deducted, nothing is added on top, and there is no schedule for a fund administrator.",
  },
  nhfEnabled: {
    noun: "National Housing Fund",
    path: "nhf",
    question: "Do you deduct the National Housing Fund contribution?",
    on: "2.5% of basic salary comes off and is remitted to the Federal Mortgage Bank.",
    off: "Nothing is deducted, and staff cannot draw on the fund for a mortgage.",
  },
} as const satisfies Record<
  string,
  { noun: string; path: "paye" | "pension" | "nhf"; question: string; on: string; off: string }
>;

type DeductionKey = keyof typeof DEDUCTION_COPY;

const DEDUCTION_KEYS = [
  "payeEnabled",
  "pensionEnabled",
  "nhfEnabled",
] as const satisfies readonly DeductionKey[];

/**
 * Company payroll settings.
 *
 * Two rules this screen enforces that the engine deliberately does not:
 * statutory minimums cannot be undercut, and the salary split must total 100%.
 * The live preview beside the form exists because none of these numbers mean
 * anything in the abstract — you change a rate to see what it does to a
 * payslip, so the payslip is on screen while you change it.
 *
 * That preview is computed by the API, on the **draft** settings, through
 * `POST /payroll/quote`. It used to be computed here, by a second copy of the
 * payroll engine that lived in the browser and spent a while on the 2011 PAYE
 * bands after the Nigeria Tax Act 2025 went into the API — so this panel quoted
 * ₦63,266.67 where the answer was ₦63,950. With no API there is no preview and
 * the panel says so, because the only other option is that copy coming back.
 *
 * ## The sub-forms are closed — `PARITY.md` Rule 5
 *
 * What you deduct, the working month, the salary structure, pension, NHF and the
 * pre-run checks each answer a different question, and they used to be open at
 * once: six expanded forms to scroll past to change one rate. Closed, each
 * summary states the setting it holds — "PAYE, pension and NHF", "8% employee,
 * 10% employer", "2.5% of basic salary", "3 checks stop a run" — so the whole
 * policy reads in six lines and the one you came to change is one click away.
 *
 * What must not be collapsed is anything that costs money. `validateSettings`
 * renders above all six, outside every reveal, and Save stays disabled while it
 * has anything in it. **So do the statutory notices**: a company that deducts no
 * PAYE has taken on something a reader must not have to open a section to find
 * out about. A section that will not validate also opens itself.
 *
 * ## Only three of these settings actually reach the engine today
 *
 * "What you deduct" is API-backed, through `useDeductionSwitches`, and saves on
 * the switch. Everything else on this screen is `usePayrollSettings`, which is
 * **localStorage** — see its header. That split is deliberate rather than
 * half-finished: whether a company deducts PAYE has to reach `PayrollSettings`
 * on the server or the switch is decoration, and a switch that looks saved and
 * moves no payslip is the same failure as a green "Paid" against money nobody
 * transferred. A working month kept in one browser is merely local.
 *
 * The consequence, and it is on screen: the three switches take effect on the
 * next payroll run; the rates below them move this preview and nothing else
 * until the local store is converted.
 *
 * ## Gated on `VIEW_SALARIES`, like the endpoint it reads
 *
 * `GET /payroll/settings` needs `VIEW_SALARIES` — "the pension rate and the
 * salary split *are* information about what people earn" — and until this
 * change nothing on this screen agreed. Every sibling settings screen refuses
 * with a `Lock` empty state; this one rendered the whole interactive form,
 * Save button included, to anybody who could reach the URL, and only the API
 * call inside "What you deduct" ever refused. Nothing sensitive actually
 * leaked — the six-way rate form is local-only and the real switches 403
 * correctly — but the picture on screen was a company's payroll policy, fully
 * interactive, in front of somebody who cannot even read it.
 *
 * `MANAGE_PAY_STRUCTURE` is the separate write permission the PATCH route
 * needs, and it is not implied by `VIEW_SALARIES` — a payroll analyst can
 * hold one and not the other. So reading this form needs the first and every
 * control on it needs the second, the same split `overtime/form.tsx` makes
 * for the same reason.
 */
export function PayrollSettingsForm() {
  const { can, loading: permissionsLoading } = usePermissions();
  const { settings, save, reset } = usePayrollSettings();
  const [draft, setDraft] = useState<PayrollSettings>(settings);
  const [saved, setSaved] = useState(true);
  const toast = useToast();

  const deductions = useDeductionSwitches();
  const canManagePay = can("MANAGE_PAY_STRUCTURE");
  const stored = deductions.settings?.settings ?? null;
  /** The switch currently being saved, so only that row goes quiet. */
  const [switching, setSwitching] = useState<DeductionKey | null>(null);

  /**
   * The draft, with the three switches taken from the API rather than from local
   * storage.
   *
   * **Derived every render, never copied into state.** Synchronising the server's
   * answer into `draft` would need a `setState` inside an effect — a cascading
   * render, and the thing `react-hooks/set-state-in-effect` exists to stop. It
   * also matters for correctness: the preview has to quote what a real run will
   * do, and a real run reads these three from the API.
   *
   * Falls back to the local draft only while the read is in flight, so nothing
   * here claims a company deducts something the server has not confirmed.
   */
  const effective: PayrollSettings = useMemo(
    () => ({
      ...draft,
      paye: { enabled: stored?.payeEnabled ?? draft.paye.enabled },
      pension: {
        ...draft.pension,
        enabled: stored?.pensionEnabled ?? draft.pension.enabled,
      },
      nhf: { ...draft.nhf, enabled: stored?.nhfEnabled ?? draft.nhf.enabled },
    }),
    [draft, stored],
  );

  const issues = validateSettings(effective);
  const issueFor = (field: string) =>
    issues.find((i) => i.field === field)?.message;

  function update(patch: (s: PayrollSettings) => PayrollSettings) {
    setDraft((d) => patch(structuredClone(d)));
    setSaved(false);
  }

  const splitTotal =
    draft.salarySplit.basic +
    draft.salarySplit.housing +
    draft.salarySplit.transport;

  /**
   * Turns one deduction on or off, on the server, at once.
   *
   * Not part of the Save button below. Save writes the local rate settings; this
   * writes the company's actual policy, and burying a statutory decision inside
   * a form-wide save would let somebody press Reset to defaults and quietly put
   * PAYE back on for a company that does not deduct it.
   */
  const setDeduction = async (key: DeductionKey, on: boolean) => {
    setSwitching(key);
    try {
      await deductions.save({ [key]: on });
      toast.push({
        title: `${DEDUCTION_COPY[key].noun} ${on ? "will be deducted" : "is not deducted"}`,
        tone: on ? "success" : "info",
        detail: on
          ? "It applies from the next payroll you prepare."
          : "Payslips will show no line for it at all, and approved payrolls are unchanged.",
      });
    } catch (error) {
      toast.push({
        title: "That did not save",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Something went wrong. Try again.",
      });
    } finally {
      setSwitching(null);
    }
  };

  /** Which of the three are deducted, for the closed summary. */
  const deducted = DEDUCTION_KEYS.filter((key) => effective[DEDUCTION_COPY[key].path].enabled);

  /** How many of the three hard stops are armed. The closed summary's count. */
  const stops = [
    draft.exceptions.requireBankAccount,
    draft.exceptions.requirePensionPin,
    draft.exceptions.blockNegativeNet,
  ].filter(Boolean).length;

  /*
   * Which section a problem belongs to.
   *
   * `validateSettings` names its issues by field path, and the paths are already
   * section-prefixed, so a section knows whether it is the one holding a problem
   * without anybody maintaining a second list.
   */
  const sectionOf = (field: string): Section =>
    field.startsWith("salarySplit")
      ? "split"
      : field.startsWith("pension.")
        ? "pension"
        : field.startsWith("nhf.")
          ? "nhf"
          : field.startsWith("exceptions.")
            ? "checks"
            : "working";

  const broken = new Set(issues.map((issue) => sectionOf(issue.field)));

  /*
   * Closed by default — `PARITY.md` Rule 5 — except where a section will not
   * validate.
   *
   * `undefined` means "follow the problem", so a section that develops one opens
   * itself and a section that had one and was fixed closes again. An explicit
   * entry is somebody's own click and wins, which is why this is not a forced
   * `|| broken.has(id)`: a summary button that does nothing when pressed is a
   * broken control. Closing a section never hides the problem — the callout above
   * lists every issue by name and Save stays disabled until they are gone, which
   * is the only reason any of this may be collapsed at all.
   */
  const [manual, setManual] = useState<Partial<Record<Section, boolean>>>({});
  const isOpen = (id: Section): boolean => manual[id] ?? broken.has(id);
  const toggle = (id: Section) =>
    setManual((current) => ({ ...current, [id]: !isOpen(id) }));

  if (permissionsLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (!can("VIEW_SALARIES")) {
    return (
      <Card>
        <EmptyState
          icon={<Lock aria-hidden="true" />}
          title="Payroll settings are not part of your access"
          description="The pension rate and the salary split are information about what people earn, so this is kept to whoever can see salaries. Ask whoever manages access to add that permission to your role."
          action={<ButtonLink href="/settings">Back to settings</ButtonLink>}
        />
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="flex flex-col gap-5">
        {issues.length > 0 && (
          <Callout tone="danger" title={`${issues.length} problem${issues.length > 1 ? "s" : ""} to fix`}>
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-4">
              {issues.map((i) => (
                <li key={i.field}>{i.message}</li>
              ))}
            </ul>
          </Callout>
        )}

        {!canManagePay && (
          <Callout tone="info" title="You can see this, not change it">
            Changing payroll settings needs pay-structure permission. Ask
            whoever manages access if you need it.
          </Callout>
        )}

        {/*
          Outside the reveal, deliberately — `PARITY.md` Rule 5. A company that
          deducts no PAYE has taken on an employer obligation, and somebody who
          never opens a section must not be able to be surprised by it. The
          switches themselves are inside; what they commit you to is out here.

          The wording is the API's, from `statutoryNotices` in the payroll
          engine, rendered verbatim. It names an Act, and a locally reworded
          version of a legal consequence is how the two stop agreeing.
        */}
        {deductions.notices.map((notice) => (
          <Callout
            key={notice.code}
            tone="warning"
            title={`${DEDUCTION_COPY[notice.field].noun} is not deducted on this payroll`}
          >
            {notice.message}
          </Callout>
        ))}

        <Disclosure
          className="bg-surface"
          title="What you deduct"
          meta={
            deductions.loading ? (
              <Badge tone="neutral" size="sm">
                Reading
              </Badge>
            ) : (
              <>
                <Badge tone="neutral" size="sm">
                  {deducted.length === 0
                    ? "Nothing is deducted"
                    : deducted
                        .map((key) => DEDUCTION_COPY[key].noun)
                        .join(", ")
                        .replace(/, ([^,]*)$/, " and $1")}
                </Badge>
                {deducted.length < DEDUCTION_KEYS.length && (
                  <Badge tone="warning" size="sm" dot>
                    {DEDUCTION_KEYS.length - deducted.length} switched off
                  </Badge>
                )}
              </>
            )
          }
          hint="Three questions. Each answer changes what the payroll engine works out, from the next run onwards."
          open={isOpen("deductions")}
          onToggle={() => toggle("deductions")}
          panelClassName="flex flex-col gap-5 p-5"
        >
          {deductions.error ? (
            <Callout tone="danger" title="Could not read what you deduct">
              {deductions.error}
            </Callout>
          ) : (
            <>
              {!deductions.available && (
                <Callout tone="info" title="Reading only, in this demo">
                  {DEMO_REFUSAL}
                </Callout>
              )}
              {deductions.available && deductions.defaults && (
                <Callout tone="info" title="Nothing has been chosen yet">
                  These are the standard Nigerian settings. Answering a question
                  below saves your own.
                </Callout>
              )}
              {DEDUCTION_KEYS.map((key) => {
                const copy = DEDUCTION_COPY[key];
                const on = effective[copy.path].enabled;
                return (
                  <Switch
                    key={key}
                    label={copy.question}
                    description={on ? copy.on : copy.off}
                    checked={on}
                    disabled={
                      !deductions.available ||
                      deductions.loading ||
                      switching !== null ||
                      !canManagePay
                    }
                    onChange={(e) => void setDeduction(key, e.target.checked)}
                  />
                );
              })}
              <p className="text-meta leading-relaxed text-muted">
                These three save as you answer them and apply to the next payroll
                you prepare. A payroll already approved keeps the settings it was
                computed with, so switching one back on cannot change a payslip
                anybody has been given.
              </p>
            </>
          )}
        </Disclosure>

        <Disclosure
          className="bg-surface"
          title="Working month"
          meta={
            <Badge tone="neutral" size="sm">
              {draft.workingDaysPerMonth} days a month
            </Badge>
          }
          hint="Used to prorate unpaid leave. An office month is 22 days; shift patterns differ."
          open={isOpen("working")}
          onToggle={() => toggle("working")}
          panelClassName="max-w-xs p-5"
        >
          <Field
            label="Working days per month"
            required
            error={issueFor("workingDaysPerMonth")}
            help="One unpaid day removes this fraction of gross."
          >
            <Input
              type="number"
              min={1}
              max={31}
              value={draft.workingDaysPerMonth}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  workingDaysPerMonth: Number(e.target.value) || 0,
                }))
              }
            />
          </Field>
        </Disclosure>


        <Disclosure
          className="bg-surface"
          title="Salary structure"
          meta={
            <>
              <Badge tone="neutral" size="sm">
                {Math.round(draft.salarySplit.basic * 100)} /{" "}
                {Math.round(draft.salarySplit.housing * 100)} /{" "}
                {Math.round(draft.salarySplit.transport * 100)} basic, housing,
                transport
              </Badge>
              <Badge
                tone={Math.abs(splitTotal - 1) < 0.0001 ? "success" : "danger"}
                size="sm"
                dot
              >
                {(splitTotal * 100).toFixed(1)}%
              </Badge>
            </>
          }
          hint="How gross pay divides into components. Pension and NHF are charged on these."
          open={isOpen("split")}
          onToggle={() => toggle("split")}
          panelClassName="grid gap-5 p-5 sm:grid-cols-3"
        >
          {(["basic", "housing", "transport"] as PensionComponent[]).map(
            (key) => (
              <Field
                key={key}
                label={key[0].toUpperCase() + key.slice(1)}
                required
              >
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(draft.salarySplit[key] * 100)}
                  onChange={(e) =>
                    update((s) => ({
                      ...s,
                      salarySplit: {
                        ...s.salarySplit,
                        [key]: (Number(e.target.value) || 0) / 100,
                      },
                    }))
                  }
                  suffix="%"
                />
              </Field>
            ),
          )}
        </Disclosure>


        <Disclosure
          className="bg-surface"
          title="Pension"
          meta={
            <Badge tone="neutral" size="sm">
              {effective.pension.enabled
                ? `${+(draft.pension.employeeRate * 100).toFixed(2)}% employee, ${+(
                    draft.pension.employerRate * 100
                  ).toFixed(2)}% employer`
                : "Not deducted"}
            </Badge>
          }
          hint="Pension Reform Act 2014. You may pay above the statutory rates, not below."
          open={isOpen("pension")}
          onToggle={() => toggle("pension")}
          panelClassName="flex flex-col gap-5 p-5"
        >
          {/* Whether pension is deducted at all is answered once, above, in
              "What you deduct" — that switch reaches the payroll engine and
              this section is the rates. Two switches for one decision is how a
              screen ends up disagreeing with itself about what a company does. */}
          {!effective.pension.enabled && (
            <p className="text-body-sm leading-relaxed text-body">
              This payroll operates no pension scheme, so none of these rates are
              used. Turn it on under <strong>What you deduct</strong> above.
            </p>
          )}

          {effective.pension.enabled && (
            <>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  label="Employee rate"
                  required
                  error={issueFor("pension.employeeRate")}
                  help={`Statutory minimum ${STATUTORY.pensionEmployeeMin * 100}%`}
                >
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    value={+(draft.pension.employeeRate * 100).toFixed(2)}
                    onChange={(e) =>
                      update((s) => ({
                        ...s,
                        pension: {
                          ...s.pension,
                          employeeRate:
                            (Number(e.target.value) || 0) / 100,
                        },
                      }))
                    }
                    suffix="%"
                  />
                </Field>
                <Field
                  label="Employer rate"
                  required
                  error={issueFor("pension.employerRate")}
                  help={`Statutory minimum ${STATUTORY.pensionEmployerMin * 100}%`}
                >
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    value={+(draft.pension.employerRate * 100).toFixed(2)}
                    onChange={(e) =>
                      update((s) => ({
                        ...s,
                        pension: {
                          ...s.pension,
                          employerRate:
                            (Number(e.target.value) || 0) / 100,
                        },
                      }))
                    }
                    suffix="%"
                  />
                </Field>
              </div>

              <FieldSet
                legend="Charged on"
                help="What your employment contracts define as pensionable."
                error={issueFor("pension.basis")}
              >
                <div className="flex flex-wrap gap-4">
                  {(["basic", "housing", "transport"] as PensionComponent[]).map(
                    (key) => (
                      <Checkbox
                        key={key}
                        label={key[0].toUpperCase() + key.slice(1)}
                        checked={draft.pension.basis.includes(key)}
                        onChange={(e) =>
                          update((s) => ({
                            ...s,
                            pension: {
                              ...s.pension,
                              basis: e.target.checked
                                ? [...s.pension.basis, key]
                                : s.pension.basis.filter((b) => b !== key),
                            },
                          }))
                        }
                      />
                    ),
                  )}
                </div>
              </FieldSet>
            </>
          )}
        </Disclosure>


        <Disclosure
          className="bg-surface"
          title="National Housing Fund"
          meta={
            <Badge tone="neutral" size="sm">
              {effective.nhf.enabled
                ? `${+(draft.nhf.rate * 100).toFixed(2)}% of ${
                    draft.nhf.basis === "basic" ? "basic salary" : "gross pay"
                  }`
                : "Not deducted"}
            </Badge>
          }
          hint="NHF Act charges 2.5% of basic. Some contracts define it on gross."
          open={isOpen("nhf")}
          onToggle={() => toggle("nhf")}
          panelClassName="flex flex-col gap-5 p-5"
        >
          {!effective.nhf.enabled && (
            <p className="text-body-sm leading-relaxed text-body">
              This payroll deducts no housing fund contribution, so neither of
              these is used. Turn it on under <strong>What you deduct</strong>{" "}
              above.
            </p>
          )}
          {effective.nhf.enabled && (
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Rate" required error={issueFor("nhf.rate")}>
                <Input
                  type="number"
                  min={0}
                  step={0.1}
                  value={+(draft.nhf.rate * 100).toFixed(2)}
                  onChange={(e) =>
                    update((s) => ({
                      ...s,
                      nhf: {
                        ...s.nhf,
                        rate: (Number(e.target.value) || 0) / 100,
                      },
                    }))
                  }
                  suffix="%"
                />
              </Field>
              <Field label="Charged on" required>
                <Select
                  value={draft.nhf.basis}
                  onChange={(e) =>
                    update((s) => ({
                      ...s,
                      nhf: {
                        ...s.nhf,
                        basis: e.target.value as "basic" | "gross",
                      },
                    }))
                  }
                >
                  <option value="basic">Basic salary</option>
                  <option value="gross">Gross pay</option>
                </Select>
              </Field>
            </div>
          )}
        </Disclosure>


        <Disclosure
          className="bg-surface"
          title="Checks before paying"
          meta={
            <>
              <Badge tone="neutral" size="sm">
                {stops === 1 ? "1 check stops a run" : `${stops} checks stop a run`}
              </Badge>
              <Badge tone="neutral" size="sm">
                flags net swings over{" "}
                {Math.round(draft.exceptions.netSwingThreshold * 100)}%
              </Badge>
            </>
          }
          hint="What stops a payroll, and what only warns."
          open={isOpen("checks")}
          onToggle={() => toggle("checks")}
          panelClassName="flex flex-col gap-5 p-5"
        >
          <Field
            label="Flag net pay changes above"
            error={issueFor("exceptions.netSwingThreshold")}
            help="Month-on-month movement that raises a warning on the review step."
            className="max-w-xs"
          >
            <Input
              type="number"
              min={1}
              max={500}
              value={Math.round(draft.exceptions.netSwingThreshold * 100)}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  exceptions: {
                    ...s.exceptions,
                    netSwingThreshold:
                      (Number(e.target.value) || 0) / 100,
                  },
                }))
              }
              suffix="%"
            />
          </Field>

          <FieldSet legend="Stop payroll when">
            <div className="flex flex-col gap-3">
              <Checkbox
                label="An employee has no bank account"
                description="They cannot be paid, so the file would be wrong."
                checked={draft.exceptions.requireBankAccount}
                onChange={(e) =>
                  update((s) => ({
                    ...s,
                    exceptions: {
                      ...s.exceptions,
                      requireBankAccount: e.target.checked,
                    },
                  }))
                }
              />
              <Checkbox
                label="An employee has no pension PIN"
                description="Pension cannot be remitted without one."
                checked={draft.exceptions.requirePensionPin}
                onChange={(e) =>
                  update((s) => ({
                    ...s,
                    exceptions: {
                      ...s.exceptions,
                      requirePensionPin: e.target.checked,
                    },
                  }))
                }
              />
              <Checkbox
                label="Net pay is zero or negative"
                description="Deductions exceed pay."
                checked={draft.exceptions.blockNegativeNet}
                onChange={(e) =>
                  update((s) => ({
                    ...s,
                    exceptions: {
                      ...s.exceptions,
                      blockNegativeNet: e.target.checked,
                    },
                  }))
                }
              />
            </div>
          </FieldSet>
        </Disclosure>

        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-line bg-surface px-1 py-3">
          <Button
            variant="ghost"
            disabled={!canManagePay}
            onClick={() => {
              reset();
              setDraft(structuredClone(settings));
              setSaved(true);
              toast.push({ title: "Reset to defaults", tone: "info" });
            }}
          >
            <RotateCcw aria-hidden="true" className="size-4" />
            Reset to defaults
          </Button>
          <Button
            variant="approve"
            disabled={issues.length > 0 || saved || !canManagePay}
            onClick={() => {
              save(draft);
              setSaved(true);
              toast.push({
                title: "Payroll settings saved",
                tone: "success",
                detail: "The next payroll will use these.",
              });
            }}
          >
            <Save aria-hidden="true" className="size-4" />
            {saved ? "Saved" : "Save settings"}
          </Button>
        </div>
      </div>

      {/* Live preview */}
      <aside className="lg:sticky lg:top-20">
        <Preview draft={effective} blocked={issues.length > 0} />
      </aside>
    </div>
  );
}

/** ₦1,000,000 a month, in kobo. A round figure makes the rates readable. */
const PREVIEW_GROSS_KOBO = 1_000_000_00;

/**
 * The deductions this employer does not operate, named.
 *
 * Absent from the column *and stated* — omitting them silently would leave a
 * reader working out why a ₦1,000,000 salary takes home ₦1,000,000, and rule 3
 * is that an absence renders as an absence, not that it disappears.
 */
function notDeducted(operates: StatutoryOperation | undefined): string[] {
  return (
    [
      ["pension", "pension"],
      ["nhf", "housing fund"],
      ["paye", "PAYE"],
    ] as const
  )
    .filter(([key]) => !wasDeducted(operates, key))
    .map(([, label]) => label);
}

/**
 * What these settings pay, on one salary.
 *
 * Four states, and three of them show no figures. That is the point: the only
 * arithmetic that can answer this lives on the server, so when it cannot be
 * reached the honest output is a sentence. The panel that used to be here always
 * had a number, and for a while the number was last year's.
 */
function Preview({
  draft,
  /** Settings that are invalid. Nothing is asked until they are fixed. */
  blocked,
}: {
  draft: PayrollSettings;
  blocked: boolean;
}) {
  const { quote, loading, error, available } = usePayslipQuote(
    blocked
      ? null
      : {
          grossMonthlyKobo: PREVIEW_GROSS_KOBO,
          settings: quoteSettingsFrom(draft),
        },
  );
  const slip = quote?.slip ?? null;

  return (
    <Card>
      <CardHeader
        title="Preview"
        description="A ₦1,000,000 monthly salary under these settings."
      />
      <CardBody className="flex flex-col gap-2.5">
        {!available ? (
          <p className="text-body-sm leading-relaxed text-muted">
            A payslip is worked out by the payroll engine on the server, and
            there is no second copy of it in this browser — there was once, and
            it spent a while quoting the wrong year&rsquo;s tax. Start the API to
            see what these settings pay.
          </p>
        ) : blocked ? (
          <p className="text-body-sm leading-relaxed text-muted">
            Fix the problems above and the preview comes back. Settings that
            cannot produce a lawful payslip are not previewed.
          </p>
        ) : loading || !slip ? (
          <>
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-2/3" />
            <span className="sr-only">Working out the payslip</span>
            {error && (
              <p className="text-body-sm leading-relaxed text-danger-text">
                {error.message}
              </p>
            )}
          </>
        ) : (
          <>
            <PreviewRow label="Gross" value={naira(slip.grossKobo)} strong />
            <div className="h-px bg-line" />
            <PreviewRow label="Basic" value={naira(slip.basicKobo)} muted />
            <PreviewRow label="Housing" value={naira(slip.housingKobo)} muted />
            <PreviewRow
              label="Transport"
              value={naira(slip.transportKobo)}
              muted
            />
            <div className="h-px bg-line" />
            {/*
              A deduction this employer does not operate is ABSENT, not ₦0.00.
              `slip.operates` is the API's own statement of which of the three
              ran, and the two claims are genuinely different: ₦0.00 says tax was
              computed and came to nothing — true for anybody under the ₦800,000
              annual exemption — while absent says this employer does not deduct
              it. This repo has already shipped that confusion twice.
            */}
            {wasDeducted(slip.operates, "pension") && (
              <PreviewRow label="Pension" value={-naira(slip.pensionEmployeeKobo)} />
            )}
            {wasDeducted(slip.operates, "nhf") && (
              <PreviewRow label="NHF" value={-naira(slip.nhfKobo)} />
            )}
            {wasDeducted(slip.operates, "paye") && (
              <PreviewRow label="PAYE" value={-naira(slip.payeKobo)} />
            )}
            {notDeducted(slip.operates).length > 0 && (
              <p className="text-meta leading-relaxed text-muted">
                Not deducted: {notDeducted(slip.operates).join(", ")}. Nothing for
                {notDeducted(slip.operates).length === 1 ? " it" : " them"} appears
                on a payslip.
              </p>
            )}
            <div className="h-px bg-line" />
            <PreviewRow label="Net pay" value={naira(slip.netKobo)} strong />
            <div className="mt-1 flex flex-col gap-2 rounded-md bg-canvas p-2.5">
              {wasDeducted(slip.operates, "pension") && (
                <p className="text-meta leading-relaxed text-muted">
                  Employer pension of{" "}
                  <Money amount={naira(slip.pensionEmployerKobo)} /> sits on top
                  of gross and is not deducted.
                </p>
              )}
              {/* Named rather than implied. The bands are statute and not a
                  setting on this screen, so the reader should be able to see
                  which statute answered — and there is nothing to name when no
                  tax was worked out. */}
              {wasDeducted(slip.operates, "paye") && (
                <p className="text-meta leading-relaxed text-muted">
                  PAYE on {quote?.taxSchedule.citation.split("(")[0]?.trim()}
                  {quote?.taxSchedule.stale
                    ? " — nobody has confirmed these bands cover this period."
                    : "."}
                </p>
              )}
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function PreviewRow({
  label,
  value,
  strong = false,
  muted = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span
        className={
          strong
            ? "text-body-sm font-medium text-ink"
            : muted
              ? "text-meta text-faint"
              : "text-body-sm text-body"
        }
      >
        {label}
      </span>
      <span
        className={
          strong
            ? "tabular text-body font-semibold text-ink"
            : "tabular text-body-sm text-body"
        }
      >
        <Money amount={Math.round(value)} />
      </span>
    </div>
  );
}
