"use client";

import { useState } from "react";
import { RotateCcw, Save } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Disclosure,
  Field,
  FieldSet,
  Input,
  Money,
  Select,
  Skeleton,
  Switch,
  useToast,
} from "@/components/ui";
import { naira } from "@/lib/api/payroll";
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

/** The five sub-forms, each its own disclosure. */
type Section = "working" | "split" | "pension" | "nhf" | "checks";

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
 * ## The five sub-forms are closed — `PARITY.md` Rule 5
 *
 * Working month, salary structure, pension, NHF and the pre-run checks each
 * answer a different question, and all five used to be open at once: five
 * expanded forms to scroll past to change one rate. Closed, each summary states
 * the setting it holds — "8% employee, 10% employer", "2.5% of basic salary",
 * "3 checks stop a run" — so the whole policy reads in five lines and the one
 * you came to change is one click away.
 *
 * What must not be collapsed is the problem list. `validateSettings` renders
 * above all five, outside every reveal, and Save stays disabled while it has
 * anything in it. A section that will not validate also opens itself.
 */
export function PayrollSettingsForm() {
  const { settings, save, reset } = usePayrollSettings();
  const [draft, setDraft] = useState<PayrollSettings>(settings);
  const [saved, setSaved] = useState(true);
  const toast = useToast();

  const issues = validateSettings(draft);
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
              {draft.pension.enabled
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
          <Switch
            label="Deduct pension"
            description="Turn off only if every employee is exempt."
            checked={draft.pension.enabled}
            onChange={(e) =>
              update((s) => ({
                ...s,
                pension: { ...s.pension, enabled: e.target.checked },
              }))
            }
          />

          {draft.pension.enabled && (
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
              {draft.nhf.enabled
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
          <Switch
            label="Deduct NHF"
            checked={draft.nhf.enabled}
            onChange={(e) =>
              update((s) => ({
                ...s,
                nhf: { ...s.nhf, enabled: e.target.checked },
              }))
            }
          />
          {draft.nhf.enabled && (
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
            disabled={issues.length > 0 || saved}
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
        <Preview draft={draft} blocked={issues.length > 0} />
      </aside>
    </div>
  );
}

/** ₦1,000,000 a month, in kobo. A round figure makes the rates readable. */
const PREVIEW_GROSS_KOBO = 1_000_000_00;

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
            <PreviewRow label="Pension" value={-naira(slip.pensionEmployeeKobo)} />
            <PreviewRow label="NHF" value={-naira(slip.nhfKobo)} />
            <PreviewRow label="PAYE" value={-naira(slip.payeKobo)} />
            <div className="h-px bg-line" />
            <PreviewRow label="Net pay" value={naira(slip.netKobo)} strong />
            <div className="mt-1 flex flex-col gap-2 rounded-md bg-canvas p-2.5">
              <p className="text-meta leading-relaxed text-muted">
                Employer pension of{" "}
                <Money amount={naira(slip.pensionEmployerKobo)} /> sits on top of
                gross and is not deducted.
              </p>
              {/* Named rather than implied. The bands are statute and not a
                  setting on this screen, so the reader should be able to see
                  which statute answered. */}
              <p className="text-meta leading-relaxed text-muted">
                PAYE on {quote?.taxSchedule.citation.split("(")[0]?.trim()}
                {quote?.taxSchedule.stale
                  ? " — nobody has confirmed these bands cover this period."
                  : "."}
              </p>
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
