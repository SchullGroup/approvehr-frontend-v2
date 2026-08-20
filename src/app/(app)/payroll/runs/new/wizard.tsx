"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Info,
  Search,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  DonutChart,
  Field,
  Input,
  Money,
  Select,
  StepIndicator,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  useStepper,
  useToast,
} from "@/components/ui";
import {
  NO_VARIATION,
  calculatePayslip,
  findExceptions,
  totalsFor,
  type Payslip,
  type Variation,
} from "@/lib/payroll/engine";
import {
  PREVIOUS_NET,
  SCHEDULED_DEDUCTIONS,
  runPeopleFrom,
} from "@/lib/mock/payroll";
import { usePayrollSettings } from "@/lib/payroll/use-settings";
import { useEmployeeStore } from "@/lib/store/employees";

/*
 * A payroll run is the highest-consequence thing anyone does in this product,
 * so the wizard is built around one idea: nothing surprising should be
 * possible at the point of approval.
 *
 *   1 Period    what is being paid, and when it lands
 *   2 People    who is in, with joiners and leavers called out
 *   3 Inputs    bonuses, unpaid leave, and the deductions already scheduled
 *   4 Review    every figure, with exceptions ranked above the table
 *   5 Approve   totals, routing, and a final confirmation
 *
 * Blocking exceptions cannot be stepped past. Warnings can, but only after
 * they have been displayed — never silently.
 */

const STEPS = [
  { id: "period", label: "Period", hint: "Month and pay date" },
  { id: "people", label: "People", hint: "Who is included" },
  { id: "inputs", label: "Inputs", hint: "Bonuses and deductions" },
  { id: "review", label: "Review", hint: "Every figure" },
  { id: "approve", label: "Approve", hint: "Send for sign-off" },
];

export function PayrollRunWizard() {
  const router = useRouter();
  const toast = useToast();
  const stepper = useStepper(STEPS);
  /* Company settings, not constants — a shift company's working month and a
     stricter swing threshold both change what this run produces. */
  const { settings } = usePayrollSettings();
  /* Derived from the live directory, so a record corrected on the employee
     page clears its blocker here without a reload. */
  const { directory } = useEmployeeStore();
  const runPeople = useMemo(() => runPeopleFrom(directory), [directory]);

  const [period, setPeriod] = useState("2026-08");
  const [payDate, setPayDate] = useState("2026-08-28");
  const [entity, setEntity] = useState("schull-ng");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [variations, setVariations] = useState<Record<string, Variation>>({});
  const [query, setQuery] = useState("");
  const [ackWarnings, setAckWarnings] = useState(false);
  const [busy, setBusy] = useState(false);

  const included = useMemo(
    () => runPeople.filter((p) => !excluded.has(p.id)),
    [excluded, runPeople],
  );

  /* Scheduled loan repayments are folded in automatically — a recruiter should
     not have to remember them, and forgetting is how people get overpaid. */
  const effectiveVariation = (id: string): Variation => {
    const manual = variations[id] ?? NO_VARIATION;
    const scheduled = SCHEDULED_DEDUCTIONS.get(id);
    return {
      ...manual,
      postTaxDeductions: manual.postTaxDeductions + (scheduled?.amount ?? 0),
    };
  };

  const slips = useMemo(() => {
    const map = new Map<string, Payslip>();
    for (const p of included) {
      map.set(
        p.id,
        calculatePayslip(p.id, p.grossMonthly, effectiveVariation(p.id), settings),
      );
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [included, variations, settings]);

  const exceptions = useMemo(
    () => findExceptions(included, slips, PREVIOUS_NET, settings),
    [included, slips, settings],
  );
  const blocking = exceptions.filter((e) => e.severity === "blocking");
  const warnings = exceptions.filter((e) => e.severity === "warning");

  const totals = useMemo(
    () => totalsFor([...slips.values()]),
    [slips],
  );

  const canContinue = [
    Boolean(period && payDate && entity),
    included.length > 0,
    true,
    blocking.length === 0,
    blocking.length === 0 && (warnings.length === 0 || ackWarnings),
  ][stepper.index];

  const doneFlags = [
    Boolean(period && payDate),
    included.length > 0,
    true,
    blocking.length === 0,
    false,
  ];
  const displaySteps = stepper.steps.map((s, i) => ({
    ...s,
    isComplete: i <= stepper.furthest && doneFlags[i],
  }));

  function submit() {
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      toast.push({
        title: "Run sent for approval",
        tone: "success",
        detail: `${totals.headcount} employees · ₦${Math.round(totals.net).toLocaleString("en-NG")} net · pays ${payDate}`,
      });
      router.push("/payroll");
    }, 900);
  }

  const filtered = included.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-6">
      <StepIndicator
        steps={displaySteps}
        index={stepper.index}
        furthest={stepper.furthest}
        onStepSelect={stepper.goTo}
      />

      {/* ------------------------------------------------------- 1 Period */}
      {stepper.index === 0 && (
        <Card>
          <CardHeader
            title="What are you paying?"
            description="The period sets which contracts, joiners and leavers are picked up."
          />
          <CardBody className="grid max-w-2xl gap-5 sm:grid-cols-2">
            <Field label="Pay period" required>
              <Select
                value={period}
                onChange={(e) => setPeriod(e.currentTarget.value)}
              >
                <option value="2026-08">August 2026</option>
                <option value="2026-09">September 2026</option>
              </Select>
            </Field>
            <Field
              label="Payment date"
              required
              help="Bank cut-off is two working days before."
            >
              <Input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.currentTarget.value)}
              />
            </Field>
            <Field label="Entity" required className="sm:col-span-2">
              <Select
                value={entity}
                onChange={(e) => setEntity(e.currentTarget.value)}
              >
                <option value="schull-ng">Schull Technologies Ltd — RC 1482930</option>
                <option value="schull-svc">Schull Services Ltd — RC 1729044</option>
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Callout tone="info" icon={<Info aria-hidden="true" />}>
                PAYE will be split across{" "}
                {new Set(runPeople.map((p) => p.taxState)).size} state revenue
                services, and pension across each employee&apos;s PFA. You do
                not choose these — they come from the records.
              </Callout>
            </div>
          </CardBody>
        </Card>
      )}

      {/* ------------------------------------------------------- 2 People */}
      {stepper.index === 1 && (
        <Card>
          <CardHeader
            title={`${included.length} people in this run`}
            description="Uncheck anyone who should not be paid this period."
            action={
              <Input
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
                placeholder="Search"
                className="w-48"
              />
            }
          />
          <TableWrap className="rounded-none border-0">
            <THead>
              <TH>Include</TH>
              <TH>Employee</TH>
              <TH>Department</TH>
              <TH>Tax state</TH>
              <TH align="right">Contract gross</TH>
              <TH>Note</TH>
            </THead>
            <TBody>
              {filtered.map((p) => (
                <TR key={p.id}>
                  <TD>
                    <Checkbox
                      checked={!excluded.has(p.id)}
                      onChange={(e) => {
                        const next = new Set(excluded);
                        if (e.currentTarget.checked) next.delete(p.id);
                        else next.add(p.id);
                        setExcluded(next);
                      }}
                      label=""
                    />
                  </TD>
                  <TDPrimary title={p.name} subtitle={p.jobTitle} />
                  <TD>{p.department}</TD>
                  <TD>{p.taxState}</TD>
                  <TD align="right" className="tabular font-medium text-ink">
                    <Money amount={p.grossMonthly} />
                  </TD>
                  <TD>
                    {p.joinedThisPeriod && (
                      <Badge tone="info" size="sm">
                        Joined
                      </Badge>
                    )}
                    {p.leftThisPeriod && (
                      <Badge tone="warning" size="sm">
                        Leaving
                      </Badge>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
          {excluded.size > 0 && (
            <CardBody className="border-t border-line">
              <Callout tone="warning">
                {excluded.size} {excluded.size === 1 ? "person is" : "people are"}{" "}
                excluded and will not be paid this period.
              </Callout>
            </CardBody>
          )}
        </Card>
      )}

      {/* ------------------------------------------------------- 3 Inputs */}
      {stepper.index === 2 && (
        <div className="flex flex-col gap-5">
          <Callout tone="info" title="Scheduled deductions are already applied">
            Loan and advance repayments come from the employee record and are
            included below. You are adding one-off items on top.
          </Callout>

          <Card>
            <CardHeader
              title="One-off inputs"
              description={`Additions are taxable. Deductions come off after tax. Unpaid leave prorates against a ${settings.workingDaysPerMonth}-day month.`}
              action={
                <ButtonLink href="/settings/payroll" variant="ghost" size="sm">
                  Payroll settings
                </ButtonLink>
              }
            />
            <TableWrap className="rounded-none border-0">
              <THead>
                <TH>Employee</TH>
                <TH align="right">Bonus / overtime</TH>
                <TH align="right">Unpaid days</TH>
                <TH align="right">Other deduction</TH>
                <TH align="right">Scheduled</TH>
              </THead>
              <TBody>
                {included.map((p) => {
                  const v = variations[p.id] ?? NO_VARIATION;
                  const scheduled = SCHEDULED_DEDUCTIONS.get(p.id);
                  const update = (patch: Partial<Variation>) =>
                    setVariations((prev) => ({
                      ...prev,
                      [p.id]: { ...NO_VARIATION, ...prev[p.id], ...patch },
                    }));

                  return (
                    <TR key={p.id}>
                      <TDPrimary title={p.name} subtitle={p.department} />
                      <TD align="right">
                        <Input
                          type="number"
                          min={0}
                          value={v.additions || ""}
                          placeholder="0"
                          onChange={(e) =>
                            update({ additions: Number(e.currentTarget.value) || 0 })
                          }
                          className="ml-auto w-32 text-right"
                        />
                      </TD>
                      <TD align="right">
                        <Input
                          type="number"
                          min={0}
                          max={settings.workingDaysPerMonth}
                          value={v.unpaidDays || ""}
                          placeholder="0"
                          onChange={(e) =>
                            update({
                              unpaidDays: Math.min(
                                settings.workingDaysPerMonth,
                                Math.max(0, Number(e.currentTarget.value) || 0),
                              ),
                            })
                          }
                          className="ml-auto w-20 text-right"
                        />
                      </TD>
                      <TD align="right">
                        <Input
                          type="number"
                          min={0}
                          value={v.postTaxDeductions || ""}
                          placeholder="0"
                          onChange={(e) =>
                            update({
                              postTaxDeductions: Number(e.currentTarget.value) || 0,
                            })
                          }
                          className="ml-auto w-32 text-right"
                        />
                      </TD>
                      <TD align="right" className="tabular text-muted">
                        {scheduled ? (
                          <span title={scheduled.label}>
                            <Money amount={scheduled.amount} />
                          </span>
                        ) : (
                          "—"
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </TableWrap>
          </Card>
        </div>
      )}

      {/* ------------------------------------------------------- 4 Review */}
      {stepper.index === 3 && (
        <div className="flex flex-col gap-5">
          <ExceptionPanel blocking={blocking} warnings={warnings} />

          <Card>
            <CardHeader
              title="Calculated payroll"
              description="PAYE is computed on annualised income against the current bands, after pension and NHF relief."
            />
            <TableWrap className="rounded-none border-0">
              <THead>
                <TH>Employee</TH>
                <TH align="right">Gross</TH>
                <TH align="right">Pension</TH>
                <TH align="right">NHF</TH>
                <TH align="right">PAYE</TH>
                <TH align="right">Deductions</TH>
                <TH align="right">Net</TH>
              </THead>
              <TBody>
                {included.map((p) => {
                  const s = slips.get(p.id)!;
                  const bad = blocking.some((e) => e.employeeId === p.id);
                  return (
                    <TR key={p.id} className={bad ? "bg-danger-soft" : undefined}>
                      <TDPrimary title={p.name} subtitle={p.taxState} />
                      <TD align="right" className="tabular">
                        <Money amount={Math.round(s.grossMonthly)} />
                      </TD>
                      <TD align="right" className="tabular text-muted">
                        <Money amount={Math.round(s.pensionEmployee)} />
                      </TD>
                      <TD align="right" className="tabular text-muted">
                        <Money amount={Math.round(s.nhf)} />
                      </TD>
                      <TD align="right" className="tabular text-muted">
                        <Money amount={Math.round(s.payeMonthly)} />
                      </TD>
                      <TD align="right" className="tabular text-muted">
                        {s.postTaxDeductions > 0 ? (
                          <Money amount={Math.round(s.postTaxDeductions)} />
                        ) : (
                          "—"
                        )}
                      </TD>
                      <TD align="right" className="tabular font-medium text-ink">
                        <Money amount={Math.round(s.netPay)} />
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </TableWrap>
          </Card>
        </div>
      )}

      {/* ------------------------------------------------------ 5 Approve */}
      {stepper.index === 4 && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex flex-col gap-5">
            <Card>
              <CardHeader
                title="What leaves the account"
                description="Net pay reaches employees. Everything else is remitted on their behalf."
              />
              <CardBody className="flex flex-col gap-3">
                <TotalRow label="Net to employees" value={totals.net} strong />
                <TotalRow label="PAYE to state revenue services" value={totals.paye} />
                <TotalRow
                  label="Pension — employee 8%"
                  value={totals.pensionEmployee}
                />
                <TotalRow
                  label="Pension — employer 10%"
                  value={totals.pensionEmployer}
                  note="Employer cost, on top of gross"
                />
                <TotalRow label="NHF" value={totals.nhf} />
                <div className="mt-2 border-t border-line pt-3">
                  <TotalRow
                    label="Total employer cost"
                    value={totals.totalCost}
                    strong
                  />
                </div>
              </CardBody>
            </Card>

            {warnings.length > 0 && (
              <Card>
                <CardBody>
                  <Checkbox
                    checked={ackWarnings}
                    onChange={(e) => setAckWarnings(e.currentTarget.checked)}
                    label={`I have reviewed ${warnings.length} warning${warnings.length > 1 ? "s" : ""}`}
                    description="Warnings do not block the run, but must be acknowledged before it is sent."
                  />
                </CardBody>
              </Card>
            )}

            <Card>
              <CardHeader title="Approval routing" />
              <CardBody className="flex flex-col gap-3">
                {[
                  { name: "Amara Nwachukwu", role: "Prepared this run", done: true },
                  { name: "Fatima Bello", role: "Reviews", done: false },
                  { name: "Tunde Bakare", role: "Approves and releases", done: false },
                ].map((s, i) => (
                  <div key={s.name} className="flex items-center gap-3">
                    <Avatar name={s.name} size="sm" tone={i === 0 ? "accent" : "neutral"} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.875rem] font-medium text-ink">
                        {s.name}
                      </p>
                      <p className="text-[0.75rem] text-muted">{s.role}</p>
                    </div>
                    <Badge tone={s.done ? "success" : "neutral"} size="sm" dot>
                      {s.done ? "Done" : "Waiting"}
                    </Badge>
                  </div>
                ))}
                <Callout tone="accent" className="mt-1">
                  The payment file is only generated after the final approval.
                </Callout>
              </CardBody>
            </Card>
          </div>

          <aside className="lg:sticky lg:top-20 lg:h-fit">
            <Card>
              <CardHeader title="Summary" />
              <CardBody className="flex flex-col gap-4">
                <DonutChart
                  caption="Where the total employer cost goes"
                  centreLabel={`Total ₦${(totals.totalCost / 1_000_000).toFixed(1)}m`}
                  format={(n) => `₦${(n / 1_000_000).toFixed(2)}m`}
                  points={[
                    { label: "Net pay", value: Math.round(totals.net) },
                    { label: "PAYE", value: Math.round(totals.paye) },
                    {
                      label: "Pension",
                      value: Math.round(
                        totals.pensionEmployee + totals.pensionEmployer,
                      ),
                    },
                    { label: "NHF", value: Math.round(totals.nhf) },
                  ]}
                />
                <dl className="flex flex-col gap-2 border-t border-line pt-3 text-[0.875rem]">
                  <div className="flex justify-between">
                    <dt className="text-muted">Employees</dt>
                    <dd className="tabular font-medium text-ink">
                      {totals.headcount}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Pays on</dt>
                    <dd className="font-medium text-ink">{payDate}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Blocking issues</dt>
                    <dd
                      className={cn(
                        "tabular font-medium",
                        blocking.length ? "text-danger-text" : "text-success-text",
                      )}
                    >
                      {blocking.length}
                    </dd>
                  </div>
                </dl>
              </CardBody>
            </Card>
          </aside>
        </div>
      )}

      {/* Footer */}
      <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-line bg-surface px-1 py-3">
        <Button variant="ghost" onClick={() => router.push("/payroll")}>
          Save &amp; exit
        </Button>
        <div className="flex items-center gap-2">
          {!stepper.isFirst && (
            <Button variant="secondary" onClick={stepper.back}>
              <ArrowLeft aria-hidden="true" className="size-4" />
              Back
            </Button>
          )}
          {stepper.isLast ? (
            <Button
              variant="approve"
              onClick={submit}
              loading={busy}
              disabled={!canContinue}
            >
              {!busy && <Check aria-hidden="true" className="size-4" />}
              Send for approval
            </Button>
          ) : (
            <Button
              variant="accent"
              onClick={stepper.next}
              disabled={!canContinue}
            >
              Continue
              <ArrowRight aria-hidden="true" className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ExceptionPanel({
  blocking,
  warnings,
}: {
  blocking: ReturnType<typeof findExceptions>;
  warnings: ReturnType<typeof findExceptions>;
}) {
  if (blocking.length === 0 && warnings.length === 0) {
    return (
      <Callout tone="success" title="Nothing to fix">
        Every record passes the checks configured for this company, and no net
        pay moved by more than the threshold you set.
      </Callout>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Before this can be approved"
        description={
          blocking.length > 0
            ? `${blocking.length} blocking, ${warnings.length} to review`
            : `${warnings.length} to review`
        }
        action={
          blocking.length > 0 ? (
            <Badge tone="danger" dot>
              Blocked
            </Badge>
          ) : (
            <Badge tone="warning" dot>
              Review
            </Badge>
          )
        }
      />
      <CardBody className="flex flex-col gap-2.5">
        {[...blocking, ...warnings].map((e, i) => (
          <div
            key={`${e.employeeId}-${e.code}-${i}`}
            className={cn(
              "flex items-start gap-3 rounded-md border p-3",
              e.severity === "blocking"
                ? "border-danger-line bg-danger-soft"
                : "border-warning-line bg-warning-soft",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "mt-0.5 shrink-0 [&>svg]:size-4",
                e.severity === "blocking" ? "text-danger-text" : "text-warning-text",
              )}
            >
              {e.severity === "blocking" ? <ShieldAlert /> : <AlertTriangle />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[0.875rem] font-medium text-ink">
                {e.employeeName} — {e.message}
              </p>
              <p className="mt-0.5 text-[0.75rem] leading-relaxed text-body">
                {e.fix}
              </p>
            </div>
            <Button size="sm" variant="secondary">
              Open record
            </Button>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

function TotalRow({
  label,
  value,
  note,
  strong = false,
}: {
  label: string;
  value: number;
  note?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <div className="min-w-0">
        <p
          className={cn(
            "text-[0.875rem]",
            strong ? "font-medium text-ink" : "text-body",
          )}
        >
          {label}
        </p>
        {note && <p className="text-[0.75rem] text-muted">{note}</p>}
      </div>
      <p
        className={cn(
          "tabular shrink-0",
          strong ? "text-h4 text-ink" : "text-[0.9375rem] text-body",
        )}
      >
        <Money amount={Math.round(value)} />
      </p>
    </div>
  );
}

export { Search };
