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
  Field,
  FieldSet,
  Input,
  Money,
  Select,
  Switch,
  useToast,
} from "@/components/ui";
import { calculatePayslip } from "@/lib/payroll/engine";
import {
  STATUTORY,
  validateSettings,
  type PayrollSettings,
  type PensionComponent,
} from "@/lib/payroll/settings";
import { usePayrollSettings } from "@/lib/payroll/use-settings";

/**
 * Company payroll settings.
 *
 * Two rules this screen enforces that the engine deliberately does not:
 * statutory minimums cannot be undercut, and the salary split must total 100%.
 * The live preview beside the form exists because none of these numbers mean
 * anything in the abstract — you change a rate to see what it does to a
 * payslip, so the payslip is on screen while you change it.
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

  const preview = calculatePayslip("preview", 1_000_000, undefined, draft);
  const splitTotal =
    draft.salarySplit.basic +
    draft.salarySplit.housing +
    draft.salarySplit.transport;

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

        {/* Working month */}
        <Card>
          <CardHeader
            title="Working month"
            description="Used to prorate unpaid leave. An office month is 22 days; shift patterns differ."
          />
          <CardBody className="max-w-xs">
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
          </CardBody>
        </Card>

        {/* Salary split */}
        <Card>
          <CardHeader
            title="Salary structure"
            description="How gross pay divides into components. Pension and NHF are charged on these."
            action={
              <Badge
                tone={Math.abs(splitTotal - 1) < 0.0001 ? "success" : "danger"}
                dot
              >
                {(splitTotal * 100).toFixed(1)}%
              </Badge>
            }
          />
          <CardBody className="grid gap-5 sm:grid-cols-3">
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
          </CardBody>
        </Card>

        {/* Pension */}
        <Card>
          <CardHeader
            title="Pension"
            description="Pension Reform Act 2014. You may pay above the statutory rates, not below."
          />
          <CardBody className="flex flex-col gap-5">
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
          </CardBody>
        </Card>

        {/* NHF */}
        <Card>
          <CardHeader
            title="National Housing Fund"
            description="NHF Act charges 2.5% of basic. Some contracts define it on gross."
          />
          <CardBody className="flex flex-col gap-5">
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
          </CardBody>
        </Card>

        {/* Exception rules */}
        <Card>
          <CardHeader
            title="Run checks"
            description="What stops a payroll run, and what only warns."
          />
          <CardBody className="flex flex-col gap-5">
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

            <FieldSet legend="Block the run when">
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
          </CardBody>
        </Card>

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
                detail: "The next run will use these.",
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
        <Card>
          <CardHeader
            title="Preview"
            description="A ₦1,000,000 monthly salary under these settings."
          />
          <CardBody className="flex flex-col gap-2.5">
            <PreviewRow label="Gross" value={preview.grossMonthly} strong />
            <div className="h-px bg-line" />
            <PreviewRow label="Basic" value={preview.basic} muted />
            <PreviewRow label="Housing" value={preview.housing} muted />
            <PreviewRow label="Transport" value={preview.transport} muted />
            <div className="h-px bg-line" />
            <PreviewRow label="Pension" value={-preview.pensionEmployee} />
            <PreviewRow label="NHF" value={-preview.nhf} />
            <PreviewRow label="PAYE" value={-preview.payeMonthly} />
            <div className="h-px bg-line" />
            <PreviewRow label="Net pay" value={preview.netPay} strong />
            <div className="mt-1 rounded-md bg-canvas p-2.5">
              <p className="text-[0.75rem] leading-relaxed text-muted">
                Employer pension of{" "}
                <Money amount={Math.round(preview.pensionEmployer)} /> sits on
                top of gross and is not deducted.
              </p>
            </div>
          </CardBody>
        </Card>
      </aside>
    </div>
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
            ? "text-[0.875rem] font-medium text-ink"
            : muted
              ? "text-[0.75rem] text-faint"
              : "text-[0.875rem] text-body"
        }
      >
        {label}
      </span>
      <span
        className={
          strong
            ? "tabular text-[0.9375rem] font-semibold text-ink"
            : "tabular text-[0.875rem] text-body"
        }
      >
        <Money amount={Math.round(value)} />
      </span>
    </div>
  );
}
