"use client";

import { useState } from "react";
import { HeartPulse, Info, Plus, TriangleAlert } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Modal,
  Money,
  SegmentedControl,
  Select,
  Spinner,
  Stat,
  TBody,
  TD,
  TH,
  THead,
  TR,
  TableWrap,
  Textarea,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { ApiError } from "@/lib/api/client";
import type { ApiBenefitKind, ApiBenefitPlan } from "@/lib/api/benefits";
import {
  useBenefitCost,
  useBenefitEnrolments,
  useBenefitMutations,
  useBenefitNotices,
  useBenefitPlans,
} from "@/lib/store/benefits";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import { useCan } from "@/lib/permissions";
import { fullName } from "@/lib/types";

/**
 * Benefits: the plans, who is on them, and what they cost.
 *
 * ## The employer's share is never shown as a deduction
 *
 * Two columns, labelled apart, everywhere. `employeeMonthlyKobo` comes off
 * somebody's pay; `employerMonthlyKobo` is a company cost, the same shape as
 * employer pension — which this codebase already renders as "a company cost on
 * top of gross. It does not reduce anyone's pay." Merging them into one "cost"
 * would claim the premium came out of somebody's salary.
 *
 * ## `PRE_TAX_NOTICE` is rendered in full beside the switch
 *
 * Not a tooltip and not shortened. Only a narrow set of schemes comes off
 * before PAYE, and marking a plan pre-tax when it does not qualify understates
 * PAYE — with the shortfall landing on the **employer**, not the employee. The
 * person ticking that box is the person who needs the sentence.
 */

const KINDS: ApiBenefitKind[] = [
  "HEALTH",
  "LIFE_ASSURANCE",
  "PENSION_TOP_UP",
  "TRANSPORT",
  "HOUSING",
  "WELLNESS",
  "OTHER",
];

const thisMonth = (): string => {
  const now = new Date();
  return `${String(now.getUTCFullYear())}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
};

/**
 * Benefits, as a panel inside Pay setup rather than a route of its own.
 *
 * ## Why it lives here
 *
 * A benefit plan is a definition of what the company gives and what each side
 * pays for it — which is the same kind of thing as an allowance, a deduction
 * and a grade, and Pay setup is the screen that already answers *what pay is
 * made of, other than salary*. It had its own sidebar item and its own route,
 * which put one quarter of that answer somewhere else.
 *
 * This follows the division `pay-setup-screen.tsx` sets out and asks a fourth
 * tab to keep: **the shell owns the heading and the route, every panel owns
 * its own body.** So the page header, the breadcrumb and the standalone route
 * are gone, and what was in the header moved into the panel — the "Add a
 * benefit" button sits above the content it adds to, and Plans / Who is on
 * what stays a `SegmentedControl` because it is a different axis from the tab
 * strip above it: the tabs choose *which kind of pay thing*, this chooses
 * *definitions or assignments*.
 *
 * ## The permission is why Pay setup now gates per tab
 *
 * Pay setup's floor was `VIEW_SALARIES` for the whole page. Benefits was
 * reachable with `EDIT_RECORDS`, and deliberately so: it gates only its
 * **cost figures** on `VIEW_SALARIES`, so somebody who enrols people without
 * seeing what anyone earns can still work here. Folding it behind the old
 * whole-page floor would have taken the feature away from exactly the person
 * it was shaped for, so the shell asks per tab instead. See the note there.
 */
export function BenefitsPanel() {
  const canPrice = useCan("MANAGE_PAY_STRUCTURE");
  const canEnrol = useCan("EDIT_RECORDS");
  const canSeeMoney = useCan("VIEW_SALARIES");

  const [tab, setTab] = useState<"plans" | "people">("plans");
  const [creating, setCreating] = useState(false);
  const [enrolTo, setEnrolTo] = useState<ApiBenefitPlan | null>(null);

  const plans = useBenefitPlans(true);
  const enrolments = useBenefitEnrolments({ includeEnded: true });
  const notices = useBenefitNotices();
  const cost = useBenefitCost(thisMonth(), canSeeMoney);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label="What to show"
          value={tab}
          onChange={(value) => setTab(value as "plans" | "people")}
          options={[
            { value: "plans", label: "Plans" },
            { value: "people", label: "Who is on what" },
          ]}
        />
        {canPrice && plans.available && (
          <Button size="sm" variant="accent" onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" className="size-4" />
            Add a benefit
          </Button>
        )}
      </div>

      {/* The sentence that was the page header's `meta`. It is the whole reason
          two figures are shown separately below, so it stays with them. */}
      <p className="mb-5 text-body-sm text-muted">
        What the company gives beyond salary. The company&rsquo;s share and the
        employee&rsquo;s are two different figures.
      </p>

      <div>
        {!plans.available ? (
          <Callout tone="info" title="This needs the API">
            {plans.refusal}
          </Callout>
        ) : plans.error ? (
          <LoadFailure
            subject="the benefits"
            error={plans.error}
            onRetry={plans.reload}
          />
        ) : plans.loading || !plans.data ? (
          <Spinner label="Loading" />
        ) : (
          <div className="flex flex-col gap-6">
            {canSeeMoney && cost.data && (
              <div className="grid gap-3 sm:grid-cols-3">
                {/* Two figures, two cards, labelled apart. Never one "cost". */}
                <Stat
                  label="Company pays a month"
                  value={<Money amount={cost.data.employerKobo / 100} decimals />}
                  hint="On top of salary. It does not reduce anyone's pay."
                />
                <Stat
                  label="Staff pay a month"
                  value={<Money amount={cost.data.employeeKobo / 100} decimals />}
                  hint="Deducted on their payslips"
                />
                <Stat
                  label="People covered"
                  value={String(cost.data.people)}
                  hint={`across ${String(cost.data.plans)} ${cost.data.plans === 1 ? "plan" : "plans"}`}
                />
              </div>
            )}

            {tab === "plans" ? (
              <Plans
                plans={plans.data}
                canPrice={canPrice}
                canEnrol={canEnrol}
                preTaxNotice={notices.data?.preTax ?? null}
                onEnrol={setEnrolTo}
                onChanged={() => {
                  plans.reload();
                  enrolments.reload();
                }}
              />
            ) : (
              <People
                read={enrolments}
                canEnrol={canEnrol}
                wholeMonthNotice={notices.data?.wholeMonth ?? null}
              />
            )}
          </div>
        )}
      </div>
      {creating && (
        <PlanDialog
          preTaxNotice={notices.data?.preTax ?? null}
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            plans.reload();
          }}
        />
      )}
      {enrolTo && (
        <EnrolDialog
          plan={enrolTo}
          wholeMonthNotice={notices.data?.wholeMonth ?? null}
          onClose={() => setEnrolTo(null)}
          onDone={() => {
            setEnrolTo(null);
            plans.reload();
            enrolments.reload();
          }}
        />
      )}
    </>
  );
}

function Plans({
  plans,
  canPrice,
  canEnrol,
  preTaxNotice,
  onEnrol,
  onChanged,
}: {
  plans: ApiBenefitPlan[];
  canPrice: boolean;
  canEnrol: boolean;
  preTaxNotice: string | null;
  onEnrol: (plan: ApiBenefitPlan) => void;
  onChanged: () => void;
}) {
  const mutations = useBenefitMutations();
  const toast = useToast();

  if (plans.length === 0) {
    return (
      <EmptyState
        icon={<HeartPulse aria-hidden="true" />}
        title="No benefits set up yet"
        description="An HMO, life cover, a transport scheme — anything the company gives staff beyond salary, with what it costs and what comes off their pay."
      />
    );
  }

  const anyPreTax = plans.some((plan) => plan.preTax);

  return (
    <div className="flex flex-col gap-4">
      {anyPreTax && preTaxNotice && (
        <Callout
          tone="warning"
          title="Some of these come off before PAYE"
          icon={<TriangleAlert aria-hidden="true" />}
        >
          {preTaxNotice}
        </Callout>
      )}
      <TableWrap caption="Benefit plans, with what each costs the company and the employee">
        <THead>
          <TR>
            <TH>Benefit</TH>
            <TH>Provider</TH>
            <TH align="right">Company pays</TH>
            <TH align="right">Employee pays</TH>
            <TH align="right">On it</TH>
            <TH>Tax</TH>
            <TH align="right">
              <span className="sr-only">Actions</span>
            </TH>
          </TR>
        </THead>
        <TBody>
          {plans.map((plan) => (
            <TR key={plan.id}>
              <TD>
                <span className="font-medium text-body">{plan.name}</span>
                <span className="block text-meta text-faint">
                  {plan.kindLabel}
                  {plan.archived ? " · switched off" : ""}
                </span>
              </TD>
              <TD>{plan.provider ?? <span className="text-faint">—</span>}</TD>
              <TD align="right">
                <Money amount={plan.employerMonthlyKobo / 100} decimals />
              </TD>
              <TD align="right">
                <Money amount={plan.employeeMonthlyKobo / 100} decimals />
              </TD>
              <TD align="right">{plan.enrolled}</TD>
              <TD>
                {/* The distinction that decides whether PAYE is right. */}
                <Badge tone={plan.preTax ? "warning" : "neutral"} size="sm">
                  {plan.preTax ? "Before PAYE" : "After PAYE"}
                </Badge>
              </TD>
              <TD align="right">
                <div className="flex flex-wrap justify-end gap-2">
                  {canEnrol && !plan.archived && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onEnrol(plan)}
                    >
                      Put somebody on
                    </Button>
                  )}
                  {canPrice && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        void (async () => {
                          try {
                            await mutations.updatePlan(plan.id, {
                              archived: !plan.archived,
                            });
                            toast.push({
                              tone: "success",
                              title: plan.archived
                                ? "Switched back on"
                                : "Switched off",
                            });
                            onChanged();
                          } catch (error) {
                            toast.push({
                              tone: "danger",
                              title:
                                error instanceof ApiError
                                  ? error.message
                                  : "Could not change it.",
                            });
                          }
                        })();
                      }}
                    >
                      {plan.archived ? "Switch on" : "Switch off"}
                    </Button>
                  )}
                </div>
              </TD>
            </TR>
          ))}
        </TBody>
      </TableWrap>
    </div>
  );
}

function People({
  read,
  canEnrol,
  wholeMonthNotice,
}: {
  read: ReturnType<typeof useBenefitEnrolments>;
  canEnrol: boolean;
  wholeMonthNotice: string | null;
}) {
  const mutations = useBenefitMutations();
  const toast = useToast();

  if (read.error) {
    return (
      <LoadFailure subject="who is on what" error={read.error} onRetry={read.reload} />
    );
  }
  if (read.loading || !read.data) return <Spinner label="Loading" />;
  if (read.data.length === 0) {
    return (
      <EmptyState
        title="Nobody is on a benefit yet"
        description="Put somebody on a plan and it appears here, and on their payslip from that month."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {wholeMonthNotice && (
        <Callout tone="info" title="Whole months" icon={<Info aria-hidden="true" />}>
          {wholeMonthNotice}
        </Callout>
      )}
      <TableWrap caption="Who is on which benefit, and what each of them costs">
        <THead>
          <TR>
            <TH>Person</TH>
            <TH>Benefit</TH>
            <TH align="right">Dependants</TH>
            <TH align="right">Company pays</TH>
            <TH align="right">They pay</TH>
            <TH>Cover</TH>
            <TH align="right">
              <span className="sr-only">Actions</span>
            </TH>
          </TR>
        </THead>
        <TBody>
          {read.data.map((row) => (
            <TR key={row.id}>
              <TD>{row.employeeName}</TD>
              <TD>
                {row.planName}
                {/* Says the figure came from this enrolment rather than the
                    plan, so somebody comparing two rows knows why they differ. */}
                {row.priced && (
                  <Badge tone="neutral" size="sm" className="ml-2">
                    Priced for them
                  </Badge>
                )}
              </TD>
              <TD align="right">{row.dependants}</TD>
              <TD align="right">
                <Money amount={row.employerMonthlyKobo / 100} decimals />
              </TD>
              <TD align="right">
                <Money amount={row.employeeMonthlyKobo / 100} decimals />
              </TD>
              <TD>
                {row.active ? (
                  <Badge tone="success" size="sm" dot>
                    From {row.startedOn}
                  </Badge>
                ) : (
                  <Badge tone="neutral" size="sm">
                    Ended {row.endedOn}
                  </Badge>
                )}
              </TD>
              <TD align="right">
                {canEnrol && row.active && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      void (async () => {
                        try {
                          await mutations.endEnrolment(
                            row.id,
                            new Date().toISOString().slice(0, 10),
                          );
                          toast.push({ tone: "success", title: "Cover ended" });
                          read.reload();
                        } catch (error) {
                          toast.push({
                            tone: "danger",
                            title:
                              error instanceof ApiError
                                ? error.message
                                : "Could not end it.",
                          });
                        }
                      })();
                    }}
                  >
                    End cover
                  </Button>
                )}
              </TD>
            </TR>
          ))}
        </TBody>
      </TableWrap>
    </div>
  );
}

/** Money in naira from a text field, as integer kobo. Empty is zero. */
const koboFrom = (value: string): number =>
  Math.round((Number(value.replace(/,/g, "")) || 0) * 100);

function PlanDialog({
  preTaxNotice,
  onClose,
  onDone,
}: {
  preTaxNotice: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const mutations = useBenefitMutations();
  const toast = useToast();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ApiBenefitKind>("HEALTH");
  const [provider, setProvider] = useState("");
  const [description, setDescription] = useState("");
  const [employer, setEmployer] = useState("");
  const [employee, setEmployee] = useState("");
  const [preTax, setPreTax] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  return (
    <Modal
      open
      onClose={onClose}
      title="Add a benefit"
      description="What it costs the company, and what comes off the employee's pay."
      footer={
        <div className="flex items-center gap-2">
          <Button
            variant="accent"
            loading={busy}
            disabled={name.trim() === ""}
            onClick={() => {
              void (async () => {
                setBusy(true);
                setFailure(null);
                try {
                  await mutations.createPlan({
                    name,
                    kind,
                    ...(provider ? { provider } : {}),
                    ...(description ? { description } : {}),
                    employerMonthlyKobo: koboFrom(employer),
                    employeeMonthlyKobo: koboFrom(employee),
                    preTax,
                  });
                  toast.push({ tone: "success", title: "Added" });
                  onDone();
                } catch (error) {
                  setFailure(
                    error instanceof ApiError
                      ? error.message
                      : "Something went wrong. Try again.",
                  );
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            Add it
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Company HMO"
          />
        </Field>
        <Field label="Kind">
          <Select
            value={kind}
            onChange={(event) => setKind(event.target.value as ApiBenefitKind)}
          >
            {KINDS.map((each) => (
              <option key={each} value={each}>
                {each.replace(/_/g, " ").toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Provider" help="The HMO or insurer. Optional.">
          <Input
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Company pays a month"
            help="On top of salary. It does not reduce anyone's pay."
          >
            <Input
              inputMode="decimal"
              value={employer}
              onChange={(event) => setEmployer(event.target.value)}
              placeholder="20,000"
            />
          </Field>
          <Field
            label="Employee pays a month"
            help="Deducted on their payslip."
          >
            <Input
              inputMode="decimal"
              value={employee}
              onChange={(event) => setEmployee(event.target.value)}
              placeholder="5,000"
            />
          </Field>
        </div>
        <Field label="What it covers" help="Optional.">
          <Textarea
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>

        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <Checkbox
            label="This comes off before PAYE"
            checked={preTax}
            onChange={(event) => setPreTax(event.target.checked)}
          />
          {/* In full, beside the switch. The person ticking this is the person
              who needs the sentence — see the screen's header. */}
          {preTaxNotice && (
            <Callout
              tone={preTax ? "warning" : "info"}
              title="Only a narrow set qualifies"
            >
              {preTaxNotice}
            </Callout>
          )}
        </div>

        {failure && (
          <Callout tone="danger" title="That was refused">
            {failure}
          </Callout>
        )}
      </div>
    </Modal>
  );
}

function EnrolDialog({
  plan,
  wholeMonthNotice,
  onClose,
  onDone,
}: {
  plan: ApiBenefitPlan;
  wholeMonthNotice: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const mutations = useBenefitMutations();
  const directory = useEmployeeDirectory({ pageSize: 200 });
  const toast = useToast();
  const [employeeId, setEmployeeId] = useState("");
  const [startedOn, setStartedOn] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [dependants, setDependants] = useState("0");
  const [priceThem, setPriceThem] = useState(false);
  const [employer, setEmployer] = useState("");
  const [employee, setEmployee] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Put somebody on ${plan.name}`}
      footer={
        <div className="flex items-center gap-2">
          <Button
            variant="accent"
            loading={busy}
            disabled={employeeId === "" || startedOn === ""}
            onClick={() => {
              void (async () => {
                setBusy(true);
                setFailure(null);
                try {
                  await mutations.enrol(plan.id, {
                    employeeId,
                    startedOn,
                    dependants: Number(dependants) || 0,
                    /* Omitted entirely unless somebody priced them. Sending 0
                       would mean "this person's cover is free", which is a
                       different claim from "the plan's price applies". */
                    ...(priceThem
                      ? {
                          employerMonthlyKobo: koboFrom(employer),
                          employeeMonthlyKobo: koboFrom(employee),
                        }
                      : {}),
                  });
                  toast.push({ tone: "success", title: "On the plan" });
                  onDone();
                } catch (error) {
                  setFailure(
                    error instanceof ApiError
                      ? error.message
                      : "Something went wrong. Try again.",
                  );
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            Put them on
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Who">
          <Select
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
          >
            <option value="">Choose somebody</option>
            {directory.employees.map((person) => (
              <option key={person.id} value={person.id}>
                {fullName(person)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Cover starts" help={wholeMonthNotice ?? undefined}>
          <Input
            type="date"
            value={startedOn}
            onChange={(event) => setStartedOn(event.target.value)}
          />
        </Field>
        <Field label="Dependants" help="Spouse and children on the cover.">
          <Input
            type="number"
            min={0}
            value={dependants}
            onChange={(event) => setDependants(event.target.value)}
          />
        </Field>

        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <Checkbox
            label="Price this person differently"
            checked={priceThem}
            onChange={(event) => setPriceThem(event.target.checked)}
          />
          <p className="text-meta text-faint">
            Leave it off and the plan&rsquo;s own price applies:{" "}
            <Money amount={plan.employerMonthlyKobo / 100} decimals /> from the
            company and <Money amount={plan.employeeMonthlyKobo / 100} decimals />{" "}
            from them.
          </p>
          {priceThem && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Company pays a month">
                <Input
                  inputMode="decimal"
                  value={employer}
                  onChange={(event) => setEmployer(event.target.value)}
                />
              </Field>
              <Field label="They pay a month">
                <Input
                  inputMode="decimal"
                  value={employee}
                  onChange={(event) => setEmployee(event.target.value)}
                />
              </Field>
            </div>
          )}
        </div>

        {failure && (
          <Callout tone="danger" title="That was refused">
            {failure}
          </Callout>
        )}
      </div>
    </Modal>
  );
}
