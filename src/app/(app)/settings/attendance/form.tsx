"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  DescriptionList,
  Field,
  Input,
  Select,
  Spinner,
  Switch,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import type { ApiAttendancePolicy, PolicyBody } from "@/lib/api/attendance";
import { sourceNote } from "@/lib/demo";
import { useAttendancePolicy } from "@/lib/store/attendance";

/**
 * The company's working hours.
 *
 * ## Why this needed a settings screen at all
 *
 * `AttendancePolicy` — shift start, shift end, the grace before a clock-in
 * counts as late, which weekdays are working days, whether staff clock
 * themselves in — has existed since attendance did, `GET/PATCH
 * /attendance/policy` has always worked, and nothing anywhere ever called
 * `updatePolicy`. Every company ran on the same 08:00–17:00, Monday–Friday
 * default with no way to say otherwise — which is exactly the "hardcodes
 * 09:00 and has decided which kind of company it is for" failure the type's
 * own doc comment already warns against.
 *
 * ## One thing this screen is not
 *
 * It is not the "do you want staff to check in and out on ApproveHR"
 * question from setup, and it is not `selfServiceClockIn` wearing a second
 * name. That earlier question turns the *feature* on. This screen only
 * exists once it is on, and shapes what the feature means for this
 * particular company. The self-service switch here is a narrower, later
 * question: given attendance is on, does HR clock everybody in by hand, or
 * does each person clock in themselves? Off does not turn attendance off —
 * `attendance-screen.tsx` and `MyClockCard` both already read it correctly;
 * this is the first screen that can set it.
 *
 * ## Weekday numbering is the API's, not the demo's
 *
 * `ApiAttendancePolicy.workingWeekdays` is ISO — 1 Monday through 7 Sunday —
 * and that is the only numbering this file ever holds. `useAttendancePolicy`
 * is the seam that converts to and from the demo store's own 0-Sunday
 * numbering; getting that wrong the other way once already rotated a whole
 * company's working week by a day.
 */

const WEEKDAYS = [
  { iso: 1, label: "Monday" },
  { iso: 2, label: "Tuesday" },
  { iso: 3, label: "Wednesday" },
  { iso: 4, label: "Thursday" },
  { iso: 5, label: "Friday" },
  { iso: 6, label: "Saturday" },
  { iso: 7, label: "Sunday" },
] as const;

const GRACE_CHOICES = [0, 5, 10, 15, 20, 30, 45, 60, 90];

/** Keeps a stored value visible even when this build's list has not heard of it. */
function withCurrent(choices: readonly number[], current: number): number[] {
  return choices.includes(current)
    ? [...choices]
    : [...choices, current].sort((a, b) => a - b);
}

function graceHelp(grace: number): string {
  if (grace === 0) {
    return "Anybody who clocks in after the shift starts is late, from the first minute.";
  }
  return `Clocking in up to ${grace} ${grace === 1 ? "minute" : "minutes"} after the shift starts still counts as on time.`;
}

function weekdayNames(iso: number[]): string {
  if (iso.length === 0) return "No working days set";
  const set = new Set(iso);
  return WEEKDAYS.filter((day) => set.has(day.iso))
    .map((day) => day.label)
    .join(", ");
}

export function AttendancePolicyForm() {
  const { policy, loading, error, saving, editable, source, save } =
    useAttendancePolicy();
  const toast = useToast();

  /* Keyed by the policy it was started from, so a policy that arrives or
     changes underneath replaces the draft instead of being edited blind. No
     setState in an effect, and no stale form after a save. */
  const [edited, setEdited] = useState<{
    from: ApiAttendancePolicy;
    value: ApiAttendancePolicy;
  } | null>(null);

  const value = edited && edited.from === policy ? edited.value : policy;

  const set = <K extends keyof ApiAttendancePolicy>(
    key: K,
    next: ApiAttendancePolicy[K],
  ) => {
    setEdited({ from: policy, value: { ...value, [key]: next } });
  };

  const toggleDay = (iso: number) => {
    const next = value.workingWeekdays.includes(iso)
      ? value.workingWeekdays.filter((day) => day !== iso)
      : [...value.workingWeekdays, iso].sort((a, b) => a - b);
    set("workingWeekdays", next);
  };

  const changed = (
    Object.keys(policy) as (keyof ApiAttendancePolicy)[]
  ).filter((key) => key !== "id" && policy[key] !== value[key]);
  const dirty = changed.length > 0;
  const noWorkingDays = value.workingWeekdays.length === 0;

  const onSave = async () => {
    const patch: PolicyBody = {};
    for (const key of changed) {
      Object.assign(patch, { [key]: value[key as keyof PolicyBody] });
    }
    try {
      await save(patch);
      setEdited(null);
      toast.push({
        tone: "success",
        title: "Saved",
        detail: "Today's roster and timesheet read this the next time they load.",
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
        title="Working hours"
        breadcrumb={[{ href: "/settings", label: "Settings" }]}
        meta={
          sourceNote(source === "api") && (
            <Badge tone="warning" size="sm" dot>
              {sourceNote(source === "api")}
            </Badge>
          )
        }
      />

      <PageBody className="flex flex-col gap-6">
        <LoadFailure subject="the working-hours policy" error={error} />

        {loading ? (
          <span className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Loading
          </span>
        ) : !editable ? (
          <ReadOnlyPolicy policy={policy} />
        ) : (
          <>
            <Card>
              <CardHeader
                title="Shift"
                description="What everybody's clock-in is measured against. Shown to staff before they clock in, so they know what they are aiming for."
              />
              <CardBody className="grid gap-5 sm:grid-cols-2">
                <Field label="Starts" required>
                  <Input
                    type="time"
                    value={value.shiftStart}
                    onChange={(event) => {
                      const next = event.target.value;
                      set("shiftStart", next);
                    }}
                  />
                </Field>
                <Field label="Ends" required>
                  <Input
                    type="time"
                    value={value.shiftEnd}
                    onChange={(event) => {
                      const next = event.target.value;
                      set("shiftEnd", next);
                    }}
                  />
                </Field>
                <Field label="Grace" help={graceHelp(value.graceMinutes)}>
                  <Select
                    value={String(value.graceMinutes)}
                    onChange={(event) => {
                      const next = Number(event.target.value);
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
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Working days"
                description="Days measured for attendance. A day left off is never counted as a no-show."
              />
              <CardBody>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {WEEKDAYS.map((day) => (
                    <Checkbox
                      key={day.iso}
                      label={day.label}
                      checked={value.workingWeekdays.includes(day.iso)}
                      onChange={() => toggleDay(day.iso)}
                    />
                  ))}
                </div>
                {noWorkingDays && (
                  <p className="mt-3 text-body-sm text-danger-text">
                    No working days chosen: every day would count as a day
                    off, and attendance would have nothing to measure.
                  </p>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <Switch
                  label="Staff clock themselves in"
                  description="Off means only HR records attendance, and the clock-in button on everybody's own screen disappears: attendance itself stays on."
                  checked={value.selfServiceClockIn}
                  onChange={(event) => {
                    const next = event.target.checked;
                    set("selfServiceClockIn", next);
                  }}
                />
              </CardBody>
            </Card>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4">
              <p className="text-body-sm text-muted">
                {dirty
                  ? `${changed.length} ${changed.length === 1 ? "change" : "changes"} not saved yet.`
                  : `${value.shiftStart}–${value.shiftEnd}, ${weekdayNames(value.workingWeekdays)}.`}
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
                  disabled={!dirty || noWorkingDays}
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

/** What somebody without `MANAGE_SETTINGS` sees: the figures, no controls. */
function ReadOnlyPolicy({ policy }: { policy: ApiAttendancePolicy }) {
  return (
    <Card>
      <CardHeader
        title="Working hours"
        description="Changing these needs settings permission."
      />
      <CardBody>
        <DescriptionList
          columns={2}
          items={[
            { term: "Shift starts", value: policy.shiftStart },
            { term: "Shift ends", value: policy.shiftEnd },
            {
              term: "Grace",
              value:
                policy.graceMinutes === 0
                  ? "None (late from the first minute)"
                  : `${policy.graceMinutes} minutes`,
            },
            {
              term: "Working days",
              value: weekdayNames(policy.workingWeekdays),
            },
            {
              term: "Clocking in",
              value: policy.selfServiceClockIn
                ? "Staff clock themselves in"
                : "HR records attendance for everybody",
            },
          ]}
        />
      </CardBody>
    </Card>
  );
}
