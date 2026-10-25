"use client";

import { useId, useMemo, useState } from "react";
import {
  AttentionMark,
  Field,
  Input,
  SegmentedControl,
  Select,
  Spinner,
} from "@/components/ui";
import { InfoTooltip } from "@/components/ui/field";
import type {
  PayComponentApplyMode,
  PayFrequency,
  PaySchedule,
  PayServiceClock,
} from "@/lib/api/pay-components";
import {
  dayWords,
  dueMonths,
  editWarning,
  scheduleFromDraft,
  type ScheduleDraft,
  type ScheduleProblem,
  type ScheduleUnit,
  type StopKind,
} from "@/lib/pay/schedule";
import { useSchedulePreview } from "@/lib/store/schedule-preview";
import { useToday } from "@/lib/use-today";

/**
 * When an allowance falls due: the "Applies" section of the allowance form, and
 * the whole of the Change schedule dialog.
 *
 * ## What this decides, and what it leaves to the API
 *
 * It collects six numbers and choices and turns them into months. Everything
 * else (the sentence, what is refused, and the dates it would be paid) is the
 * API's, through `POST /pay-components/schedule-preview`, because the rules and
 * the wording live there once and the same function decides the payroll run. So
 * the example under the section is not arithmetic done here: "every 3 years
 * after 3 years" shows 3, 6 and 9 years because the API said so, and it cannot
 * disagree with what a run pays.
 *
 * Each refusal is shown at its own field, in the API's words, while somebody
 * types, which is what the same body would be refused with on save.
 *
 * ## No banners, no pills
 *
 * One section, plain controls, the explanation behind an info icon, and the one
 * thing worth a second look (changing the schedule of an allowance people are
 * already on) behind the ochre mark.
 */

/**
 * What the schedule form knows, derived from what was typed.
 *
 * A hook of its own so the dialog around the fields can read it: whether the
 * schedule can be sent, and whether the API would refuse it, decide whether Save
 * is offered, and the dialog is where Save lives. Pass `enabled: false` for a
 * deduction, which has no schedule and asks nothing.
 */
export function useScheduleForm(
  draft: ScheduleDraft,
  applyMode: PayComponentApplyMode,
  enabled = true,
) {
  const today = useToday();
  const [sample, setSample] = useState<string | null>(null);
  const sampleStart = sample ?? today;

  /* What is sent, or why it cannot be yet. A number that is not a number is the
     form's to say; every other rule is the API's. */
  const { schedule, problems: local } = useMemo(
    () => scheduleFromDraft(draft, applyMode),
    [draft, applyMode],
  );
  const preview = useSchedulePreview(
    enabled && schedule
      ? {
          schedule,
          kind: "ALLOWANCE",
          applyMode,
          startDate: sampleStart,
          count: 4,
        }
      : null,
  );
  const problems: ScheduleProblem[] = [...local, ...preview.problems];

  return {
    schedule,
    problems,
    preview,
    sample: sampleStart,
    setSample,
    /** Whether saving would be refused, as far as anything has said so yet. */
    blocked: enabled && problems.length > 0,
  };
}

export type ScheduleFieldsProps = {
  draft: ScheduleDraft;
  onChange: (next: ScheduleDraft) => void;
  form: ReturnType<typeof useScheduleForm>;
  /** An allowance nobody is assigned has no assignment date to count from. */
  applyMode: PayComponentApplyMode;
  /** For the warning, when somebody is already on it. Zero for a new one. */
  assignmentCount?: number;
  /** An edit, not an add: only then is there anything already running to move. */
  editing?: boolean;
  className?: string;
};

const UNITS: { value: ScheduleUnit; label: string }[] = [
  { value: "months", label: "months" },
  { value: "years", label: "years" },
];

const FREQUENCIES: { value: PayFrequency; label: string }[] = [
  { value: "MONTHLY", label: "Every month" },
  { value: "EVERY_N_MONTHS", label: "Every few months or years" },
  { value: "ONCE", label: "Once" },
];

const STOPS: { value: StopKind; label: string }[] = [
  { value: "NONE", label: "Never" },
  { value: "PAYMENTS", label: "After some payments" },
  { value: "TIME", label: "After some time" },
];

export function ScheduleFields({
  draft,
  onChange,
  form,
  applyMode,
  assignmentCount = 0,
  editing = false,
  className,
}: ScheduleFieldsProps) {
  const set = <K extends keyof ScheduleDraft>(
    field: K,
    value: ScheduleDraft[K],
  ) => onChange({ ...draft, [field]: value });

  const permanent = applyMode === "PERMANENT";
  const { schedule, problems, preview, sample, setSample } = form;
  const at = (field: string): string | undefined =>
    problems.find((problem) => problem.field === field)?.message;
  /* A refusal that names a field this form has no control for (the schedule as
     a whole) still has to be said somewhere. */
  const shown = new Set([
    "schedule.qualifyingMonths",
    "schedule.serviceClock",
    "schedule.intervalMonths",
    "schedule.maxPayments",
    "schedule.durationMonths",
  ]);
  const elsewhere = problems.filter((problem) => !shown.has(problem.field));

  const explain = useId();
  const warning = editing
    ? editWarning(assignmentCount, applyMode === "PERMANENT")
    : null;

  const clock: PayServiceClock = permanent ? "START_DATE" : draft.clock;

  return (
    <div className={className}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-1.5">
          <h3 className="text-body-sm font-semibold text-ink">Applies</h3>
          <InfoTooltip
            id={explain}
            label="How an allowance's schedule works"
            text="An allowance is paid every month unless it is told otherwise. Make it wait for a period of service, pay it only every few months or years, or pay it once, and stop it after a number of payments or a length of time. The amount is paid each time it falls due. Tax and pension are decided by the switches above, exactly as for a monthly allowance."
          />
          {warning && <AttentionMark text={warning} />}
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-body-sm font-medium text-ink">Counts from</p>
          <SegmentedControl
            label="What the waiting period is counted from"
            value={clock}
            onChange={(value) => set("clock", value)}
            options={[
              { value: "START_DATE", label: "Their start date" },
              {
                value: "ASSIGNMENT_DATE",
                label: "The day it is given to them",
                disabled: permanent,
              },
            ]}
          />
          {permanent && (
            <p className="text-meta text-muted">
              It applies to everybody, so there is no day it is given to them:
              it counts from each person&apos;s start date.
            </p>
          )}
          {at("schedule.serviceClock") && (
            <p className="text-body-sm text-danger-text">
              {at("schedule.serviceClock")}
            </p>
          )}
        </div>

        <Field
          label="Waits for"
          help="How long after that date it first falls due. 0 means straight away."
          {...(at("schedule.qualifyingMonths")
            ? { error: at("schedule.qualifyingMonths") as string }
            : {})}
        >
          <div className="flex items-center gap-2">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              className="w-24"
              value={draft.waitCount}
              onChange={(event) => set("waitCount", event.target.value)}
            />
            <UnitSelect
              label="Unit for how long it waits"
              value={draft.waitUnit}
              onChange={(value) => set("waitUnit", value)}
            />
          </div>
        </Field>

        <div className="flex flex-col gap-1.5">
          <p className="text-body-sm font-medium text-ink">How often</p>
          <SegmentedControl
            label="How often it is paid"
            value={draft.frequency}
            onChange={(value) => set("frequency", value)}
            options={FREQUENCIES}
          />
          {draft.frequency === "EVERY_N_MONTHS" && (
            <Field
              label="Every"
              {...(at("schedule.intervalMonths")
                ? { error: at("schedule.intervalMonths") as string }
                : {})}
            >
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={2}
                  step={1}
                  className="w-24"
                  value={draft.everyCount}
                  onChange={(event) => set("everyCount", event.target.value)}
                />
                <UnitSelect
                  label="Unit for how often it is paid"
                  value={draft.everyUnit}
                  onChange={(value) => set("everyUnit", value)}
                />
              </div>
            </Field>
          )}
        </div>

        {draft.frequency !== "ONCE" && (
          <div className="flex flex-col gap-1.5">
            <p className="text-body-sm font-medium text-ink">It stops</p>
            <SegmentedControl
              label="When it stops being paid"
              value={draft.stop}
              onChange={(value) => set("stop", value)}
              options={STOPS}
            />
            {draft.stop === "PAYMENTS" && (
              <Field
                label="After this many payments"
                {...(at("schedule.maxPayments")
                  ? { error: at("schedule.maxPayments") as string }
                  : {})}
              >
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  className="w-24"
                  value={draft.paymentsCount}
                  onChange={(event) => set("paymentsCount", event.target.value)}
                />
              </Field>
            )}
            {draft.stop === "TIME" && (
              <Field
                label="After this long from when it first falls due"
                {...(at("schedule.durationMonths")
                  ? { error: at("schedule.durationMonths") as string }
                  : {})}
              >
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    className="w-24"
                    value={draft.timeCount}
                    onChange={(event) => set("timeCount", event.target.value)}
                  />
                  <UnitSelect
                    label="Unit for how long it lasts"
                    value={draft.timeUnit}
                    onChange={(value) => set("timeUnit", value)}
                  />
                </div>
              </Field>
            )}
          </div>
        )}

        {elsewhere.map((problem) => (
          <p
            key={`${problem.field}-${problem.message}`}
            className="text-body-sm text-danger-text"
          >
            {problem.message}
          </p>
        ))}

        <Preview
          schedule={schedule}
          state={preview}
          sample={sample}
          onSample={setSample}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function UnitSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ScheduleUnit;
  onChange: (value: ScheduleUnit) => void;
}) {
  return (
    <Select
      aria-label={label}
      className="w-28"
      value={value}
      onChange={(event) => onChange(event.target.value as ScheduleUnit)}
    >
      {UNITS.map((unit) => (
        <option key={unit.value} value={unit.value}>
          {unit.label}
        </option>
      ))}
    </Select>
  );
}

/**
 * The API's sentence, and the dates it would be paid for somebody who started on
 * a day the reader picks. Plain text, and nothing here is worked out locally:
 * absent is absent, so with no answer (offline, a number half typed, a request in
 * flight) it says nothing rather than something from a stale keystroke.
 */
function Preview({
  schedule,
  state,
  sample,
  onSample,
}: {
  schedule: PaySchedule | null;
  state: ReturnType<typeof useSchedulePreview>;
  sample: string;
  onSample: (value: string) => void;
}) {
  if (!state.available || !schedule) return null;
  const summary = state.data?.schedule.summary;
  const examples = state.data?.examples ?? null;

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-4">
      <div aria-live="polite" className="flex flex-col gap-1">
        {summary ? (
          <p className="text-body-sm font-medium text-ink">{summary}</p>
        ) : state.loading ? (
          <p className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Working out the dates
          </p>
        ) : null}
        {examples && examples.dueMonths.length > 0 && (
          <p className="text-body-sm text-muted">
            For somebody who started on {dayWords(examples.startDate)}, it falls
            due in {dueMonths(examples.dueMonths)}.
          </p>
        )}
      </div>
      <Field label="Example for somebody who started on">
        <Input
          type="date"
          className="w-44"
          value={sample}
          onChange={(event) => onSample(event.target.value)}
        />
      </Field>
    </div>
  );
}
