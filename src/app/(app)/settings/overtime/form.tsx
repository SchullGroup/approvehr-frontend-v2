"use client";

import { sourceNote } from "@/lib/demo";
import { useState } from "react";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  Disclosure,
  Field,
  Money,
  formatMoney,
  Select,
  Spinner,
  Switch,
  useToast,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import {
  KIND_LABEL,
  multiplierWords,
  naira,
  spokenHours,
} from "@/lib/api/overtime";
import {
  POLICY_LIMITS,
  amountKoboFor,
  hourlyRateKobo,
  type OvertimePolicy,
} from "@/lib/overtime/derive";
import { usePayrollSettings } from "@/lib/payroll/use-settings";
import { useOvertimePolicy } from "@/lib/store/overtime";

/**
 * Overtime policy.
 *
 * ## Every setting states its consequence, in money or in hours
 *
 * Nobody running a business reads "weekdayRate: 1.5" and pictures what it does
 * to a wage bill. Each field says what it means in one line, and the worked
 * example at the bottom moves as the figures change — the same argument as the
 * live preview on `/settings/leave`, which exists so somebody sees the effect
 * before they wonder what they just did.
 *
 * ## Why these are all choices, not typed numbers
 *
 * The API accepts any rate between 1 and 5 and any grace up to eight hours. The
 * lists here hold what contracts actually use. Two reasons: a picker cannot
 * produce a value the API refuses, and "6 hours" is a phrase a business owner
 * reads while "360" is a number they have to convert. A value already stored
 * that is not in a list is added to it rather than silently dropped.
 *
 * ## Saving does not rewrite history
 *
 * A record already worked out keeps the rate and hourly figure it was valued at
 * — the API copies both onto the row deliberately, so a policy change cannot
 * quietly restate last month. The toast says so, because the alternative is
 * somebody changing a multiplier and wondering why nothing moved.
 */

/** ₦1,000,000. Round, obviously an example, and easy to scale by eye. */
const EXAMPLE_MONTHLY_KOBO = 100_000_000;

const GRACE_CHOICES = [0, 5, 10, 15, 20, 30, 45, 60, 90];
const CAP_CHOICES = [120, 180, 240, 300, 360, 480, 600, 720, 960];
const RATE_CHOICES = [1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const HOURS_CHOICES = [6, 7, 8, 9, 10, 12];

/** Keeps a stored value visible even when this build's list has not heard of it. */
function withCurrent(choices: readonly number[], current: number): number[] {
  return choices.includes(current)
    ? [...choices]
    : [...choices, current].sort((a, b) => a - b);
}

function graceHelp(grace: number): string {
  if (grace === 0) {
    return "Every minute past the shift end counts as overtime.";
  }
  return `Minutes past the shift end that do not count — and past the grace the whole overrun is paid, so ${grace + 25} minutes pays ${grace + 25}, not 25.`;
}

function rateHelp(label: string, rate: number, when: string): string {
  return `${label} ${rate}× — an hour ${when} pays ${multiplierWords(rate)} the normal hourly rate.`;
}

export function OvertimePolicyForm() {
  const { policy, loading, error, saving, editable, source, save } =
    useOvertimePolicy();
  const { settings } = usePayrollSettings();
  const toast = useToast();

  /* Keyed by the policy it was started from, so a policy that arrives or
     changes underneath replaces the draft instead of being edited blind. No
     setState in an effect, and no stale form after a save. */
  const [edited, setEdited] = useState<{
    from: OvertimePolicy;
    value: OvertimePolicy;
  } | null>(null);

  const value = edited && edited.from === policy ? edited.value : policy;

  const set = <K extends keyof OvertimePolicy>(
    key: K,
    next: OvertimePolicy[K],
  ) => {
    setEdited({ from: policy, value: { ...value, [key]: next } });
  };

  const changed = (Object.keys(policy) as (keyof OvertimePolicy)[]).filter(
    (key) => policy[key] !== value[key],
  );
  const dirty = changed.length > 0;

  const hourly = hourlyRateKobo(
    EXAMPLE_MONTHLY_KOBO,
    settings.workingDaysPerMonth,
    value.hoursPerDay,
  );

  const onSave = async () => {
    const patch: Partial<OvertimePolicy> = {};
    for (const key of changed) {
      Object.assign(patch, { [key]: value[key] });
    }
    try {
      await save(patch);
      setEdited(null);
      toast.push({
        tone: "success",
        title: "Saved",
        detail:
          "Days already worked out keep the rate they were valued at. Work a month out again to apply this to it.",
      });
    } catch (caught) {
      toast.push({
        tone: "danger",
        title: "That did not save",
        detail:
          caught instanceof ApiError
            ? caught.message
            : "Something went wrong. Try again.",
      });
    }
  };

  return (
    <>
      <PageHeader
        title="Overtime"
        description="When extra hours count, what they pay, and who signs them off."
        breadcrumb={[{ href: "/settings", label: "Settings" }]}
        meta={
          <Badge tone={source === "api" ? "success" : "warning"} size="sm" dot>
            {sourceNote(source === "api")}
          </Badge>
        }
        action={
          <ButtonLink size="sm" href="/people/overtime">
            See overtime
          </ButtonLink>
        }
      />

      <PageBody className="flex flex-col gap-6">
        {error && (
          <Callout tone="danger" title="Could not read the policy">
            {error}
          </Callout>
        )}

        {loading ? (
          <span className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Loading
          </span>
        ) : !editable ? (
          <ReadOnlyPolicy policy={policy} hourly={hourly} />
        ) : (
          <>
            <Card>
              <CardBody>
                <Switch
                  label="Pay overtime"
                  description="Off means extra hours are not worked out from the clock and nothing reaches payroll."
                  checked={value.enabled}
                  onChange={(e) => {
                    const next = e.target.checked;
                    set("enabled", next);
                  }}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="What counts"
                description="Overtime is read from clock-outs. These two decide which ones."
              />
              <CardBody className="grid gap-5 sm:grid-cols-2">
                <Field label="Grace" help={graceHelp(value.graceMinutes)}>
                  <Select
                    value={String(value.graceMinutes)}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      set("graceMinutes", next);
                    }}
                  >
                    {withCurrent(GRACE_CHOICES, value.graceMinutes).map(
                      (minutes) => (
                        <option key={minutes} value={minutes}>
                          {minutes === 0 ? "None" : `${minutes} minutes`}
                        </option>
                      ),
                    )}
                  </Select>
                </Field>

                <Field
                  label="Most one day can pay"
                  help="However late the clock-out. Somebody who forgot to clock out is capped here instead of paid for the night."
                >
                  <Select
                    value={String(value.dailyCapMinutes)}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      set("dailyCapMinutes", next);
                    }}
                  >
                    {withCurrent(CAP_CHOICES, value.dailyCapMinutes).map(
                      (minutes) => (
                        <option key={minutes} value={minutes}>
                          {spokenHours(minutes)}
                        </option>
                      ),
                    )}
                  </Select>
                </Field>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="What it pays"
                description="Multipliers on the normal hourly rate. None of these are statutory in Nigeria — they are what your contracts say."
              />
              <CardBody className="grid gap-5 sm:grid-cols-2">
                <Field
                  label="Weekday rate"
                  help={rateHelp("Weekday rate", value.weekdayRate, "of overtime")}
                >
                  <RateSelect
                    value={value.weekdayRate}
                    onPick={(next) => set("weekdayRate", next)}
                  />
                </Field>

                <Field
                  label="Weekend rate"
                  help={rateHelp(
                    "Weekend rate",
                    value.weekendRate,
                    "worked on a day off",
                  )}
                >
                  <RateSelect
                    value={value.weekendRate}
                    onPick={(next) => set("weekendRate", next)}
                  />
                </Field>

                <Field
                  label="Public holiday rate"
                  help={rateHelp(
                    "Public holiday rate",
                    value.holidayRate,
                    "worked on a public holiday",
                  )}
                >
                  <RateSelect
                    value={value.holidayRate}
                    onPick={(next) => set("holidayRate", next)}
                  />
                </Field>

                <Field
                  label="Hours in a normal day"
                  help="The divisor. One hour is worth monthly pay ÷ working days ÷ hours in a day."
                >
                  <Select
                    value={String(value.hoursPerDay)}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      set("hoursPerDay", next);
                    }}
                  >
                    {withCurrent(HOURS_CHOICES, value.hoursPerDay).map((hours) => (
                      <option key={hours} value={hours}>
                        {hours} hours
                      </option>
                    ))}
                  </Select>
                </Field>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <Switch
                  label="A manager approves it first"
                  description="Off means overtime is approved the moment it is worked out, and the next payroll pays it with nobody looking."
                  checked={value.requiresApproval}
                  onChange={(e) => {
                    const next = e.target.checked;
                    set("requiresApproval", next);
                  }}
                />
              </CardBody>
            </Card>

            {/* Closed by default — `PARITY.md` Rule 5. An illustration is
                reference: it never needs action, it only needs to be findable,
                and the figure it turns on is in the summary so most readers do
                not have to open it. Everything above it is a live form and stays
                open. */}
            <Disclosure
              className="bg-surface"
              title="Worked example"
              meta={
                <Badge tone="neutral" size="sm">
                  An ordinary hour is{" "}
                  {formatMoney(naira(hourly), "NGN", { decimals: true })}
                </Badge>
              }
              hint={`On a ₦1,000,000 monthly salary, at ${settings.workingDaysPerMonth} working days a month.`}
              panelClassName="flex flex-col gap-4 p-5"
            >
              <ExampleFigures policy={value} hourly={hourly} />
              <ButtonLink size="sm" href="/settings/payroll" className="self-start">
                Working days
              </ButtonLink>
            </Disclosure>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4">
              <p className="text-body-sm text-muted">
                {dirty
                  ? `${changed.length} ${changed.length === 1 ? "change" : "changes"} not saved yet.`
                  : "Applies the next time a month is worked out."}
              </p>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="secondary"
                  disabled={!dirty || saving}
                  onClick={() => setEdited(null)}
                >
                  Discard
                </Button>
                <Button
                  variant="accent"
                  loading={saving}
                  disabled={!dirty}
                  onClick={() => void onSave()}
                >
                  Save changes
                </Button>
              </div>
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The multipliers contracts use.
 *
 * `POLICY_LIMITS.rate` is the API's actual range and is checked here so a list
 * edited later cannot start producing 422s.
 */
function RateSelect({
  value,
  onPick,
}: {
  value: number;
  onPick: (next: number) => void;
}) {
  const choices = withCurrent(RATE_CHOICES, value).filter(
    (rate) => rate >= POLICY_LIMITS.rate.min && rate <= POLICY_LIMITS.rate.max,
  );
  return (
    <Select
      value={String(value)}
      onChange={(e) => {
        const next = Number(e.target.value);
        onPick(next);
      }}
    >
      {choices.map((rate) => (
        <option key={rate} value={rate}>
          {rate}&times; — {multiplierWords(rate)} normal
        </option>
      ))}
    </Select>
  );
}

function ExampleFigures({
  policy,
  hourly,
}: {
  policy: OvertimePolicy;
  hourly: number;
}) {
  return (
    <DescriptionList
      columns={2}
      items={[
        {
          term: "An ordinary hour",
          value: <Money amount={naira(hourly)} decimals />,
        },
        {
          term: `${KIND_LABEL.WEEKDAY} overtime, one hour`,
          value: (
            <Money
              amount={naira(amountKoboFor(hourly, 60, policy.weekdayRate))}
              decimals
            />
          ),
        },
        {
          term: `${KIND_LABEL.WEEKEND} overtime, one hour`,
          value: (
            <Money
              amount={naira(amountKoboFor(hourly, 60, policy.weekendRate))}
              decimals
            />
          ),
        },
        {
          term: `${KIND_LABEL.PUBLIC_HOLIDAY} overtime, one hour`,
          value: (
            <Money
              amount={naira(amountKoboFor(hourly, 60, policy.holidayRate))}
              decimals
            />
          ),
        },
        {
          term: `The most one weekday can pay — ${spokenHours(policy.dailyCapMinutes)}`,
          value: (
            <Money
              amount={naira(
                amountKoboFor(hourly, policy.dailyCapMinutes, policy.weekdayRate),
              )}
              decimals
            />
          ),
        },
      ]}
    />
  );
}

/** What somebody without `MANAGE_PAY_STRUCTURE` sees: the figures, no controls. */
function ReadOnlyPolicy({
  policy,
  hourly,
}: {
  policy: OvertimePolicy;
  hourly: number;
}) {
  return (
    <>
      <Card>
        <CardHeader
          title="Overtime policy"
          description="Changing overtime rates needs pay-structure permission."
        />
        <CardBody className="flex flex-col gap-5">
          <DescriptionList
            columns={2}
            items={[
              {
                term: "Overtime",
                value: policy.enabled ? "Paid" : "Not paid",
              },
              {
                term: "Grace",
                value:
                  policy.graceMinutes === 0
                    ? "None — every minute counts"
                    : spokenHours(policy.graceMinutes),
              },
              {
                term: "Most one day can pay",
                value: spokenHours(policy.dailyCapMinutes),
              },
              { term: "Weekday rate", value: `${policy.weekdayRate}×` },
              { term: "Weekend rate", value: `${policy.weekendRate}×` },
              {
                term: "Public holiday rate",
                value: `${policy.holidayRate}×`,
              },
              {
                term: "Approval",
                value: policy.requiresApproval
                  ? "A manager approves it first"
                  : "Approved as soon as it is worked out",
              },
              {
                term: "Hours in a normal day",
                value: `${policy.hoursPerDay} hours`,
              },
            ]}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Worked example"
          description="On a ₦1,000,000 monthly salary."
        />
        <CardBody>
          <ExampleFigures policy={policy} hourly={hourly} />
        </CardBody>
      </Card>
    </>
  );
}
