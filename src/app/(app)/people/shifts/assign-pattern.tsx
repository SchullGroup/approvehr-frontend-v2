"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Badge,
  Button,
  Field,
  Input,
  StepHeader,
  StepperModal,
  useStepper,
  useToast,
  type Step,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import {
  addDays,
  dayAbbrev,
  dayOfMonth,
  daysBetween,
  isWeekend,
  shortDay,
  timesLabel,
  type ApiPattern,
  type ApiShift,
} from "@/lib/api/shifts";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import {
  previewPattern,
  previewShift,
  useShiftMutations,
} from "@/lib/store/shifts";
import { colourFor, shiftColours } from "./palette";

const STEPS: Step[] = [
  { id: "people", label: "Who" },
  { id: "pattern", label: "What they work" },
  { id: "dates", label: "From when" },
  { id: "preview", label: "Check it" },
];

/** The API's own ceiling, said once here so the picker can enforce it. */
const MAX_PEOPLE = 100;
/** A quarter. Longer than this and the API refuses the generation. */
const MAX_DAYS = 92;

/**
 * Putting a crew on a rota.
 *
 * Four decisions, in the order somebody makes them: who, what they work, from
 * when, and then **the actual days**. The fourth step is the one that earns the
 * wizard. A cycle described as "four on, four off from the 24th" is a sentence
 * two people can read differently; fourteen squares with dates under them is
 * not. Anything a preview cannot show — a clash, a closed payroll month — the
 * API refuses by name, and the refusal is shown verbatim rather than replaced
 * with "could not save".
 *
 * The preview runs the same `cycleIndex` arithmetic the generation does, from
 * `lib/store/shifts.ts`. A preview computed a second way is a preview that can
 * be wrong in the one place it matters, which is the wrap at the end of the
 * cycle: day nine of an eight-day pattern is day one again, and a rota that gets
 * that wrong is wrong from the second week onwards.
 *
 * ## Generating again is safe. Overwriting is not.
 *
 * Re-running the same pattern over the same weeks replaces only the days that
 * pattern wrote. A manual cover, a day from another pattern or an approved swap
 * stops the whole generation and is named — which is what stops "extend the rota
 * by a week" from quietly undoing every exception somebody entered by hand.
 */
export function AssignPatternModal({
  open,
  onClose,
  patterns,
  shifts,
  defaultFrom,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  patterns: ApiPattern[];
  shifts: ApiShift[];
  /** The week the grid is showing. The rota usually starts where you are. */
  defaultFrom: string;
  onDone?: () => void;
}) {
  const toast = useToast();
  const stepper = useStepper(STEPS);
  const { bulkAssign } = useShiftMutations();
  const { employees } = useEmployeeDirectory({ pageSize: 200 });

  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [choice, setChoice] = useState<
    { kind: "pattern"; id: string } | { kind: "shift"; id: string } | null
  >(null);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(addDays(defaultFrom, 27));
  const [cycleStart, setCycleStart] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const colours = useMemo(() => shiftColours(shifts), [shifts]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return employees.filter((employee) =>
      needle === ""
        ? true
        : `${employee.firstName} ${employee.lastName} ${employee.employeeNo}`
            .toLowerCase()
            .includes(needle),
    );
  }, [employees, query]);

  const pattern =
    choice?.kind === "pattern"
      ? (patterns.find((row) => row.id === choice.id) ?? null)
      : null;
  const shift =
    choice?.kind === "shift"
      ? (shifts.find((row) => row.id === choice.id) ?? null)
      : null;

  const span = daysBetween(from, to) + 1;
  const dateProblem =
    span < 1
      ? "The last day is before the first."
      : span > MAX_DAYS
        ? "Roster a quarter at a time."
        : cycleStart && cycleStart > from
          ? "The cycle has to start on or before the first day you are rostering."
          : null;

  /** The first fortnight, exactly as the generation will write it. */
  const preview = useMemo(() => {
    const days = Math.min(14, Math.max(span, 0));
    if (days === 0) return [];
    if (pattern) {
      return previewPattern(pattern, from, days, cycleStart || undefined);
    }
    if (shift) return previewShift(shift, from, days);
    return [];
  }, [pattern, shift, from, span, cycleStart]);

  const rosteredEach = preview.filter((day) => day.shiftId !== null).length;

  const canContinue =
    stepper.index === 0
      ? chosen.length > 0 && chosen.length <= MAX_PEOPLE
      : stepper.index === 1
        ? choice !== null
        : stepper.index === 2
          ? dateProblem === null
          : rosteredEach > 0;

  const toggle = (id: string) =>
    setChosen((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id],
    );

  const reset = () => {
    setChosen([]);
    setChoice(null);
    setQuery("");
    setCycleStart("");
    setError(null);
    stepper.reset();
  };

  const finish = async () => {
    if (!choice) return;
    setBusy(true);
    setError(null);
    try {
      const result = await bulkAssign({
        employeeIds: chosen,
        ...(choice.kind === "pattern"
          ? { patternId: choice.id }
          : { shiftId: choice.id }),
        from,
        to,
        ...(cycleStart ? { cycleStart } : {}),
      });
      toast.push({
        title: `${result.people} ${result.people === 1 ? "person" : "people"} on the rota`,
        tone: "success",
        detail:
          result.replaced > 0
            ? `${result.created} days written, ${result.replaced} replaced.`
            : `${result.created} days written, ${result.rosteredDaysEach} each.`,
      });
      reset();
      onDone?.();
      onClose();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "That did not go through. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepperModal
      open={open}
      onClose={onClose}
      title="Put people on the rota"
      stepper={stepper}
      onFinish={finish}
      finishLabel="Write the rota"
      busy={busy}
      canContinue={canContinue}
    >
      {error && (
        <p className="mb-4 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-body-sm text-ink">
          {error}
        </p>
      )}

      {stepper.index === 0 && (
        <div>
          <StepHeader
            title="Who is on this rota?"
            description={`Up to ${MAX_PEOPLE} at a time.`}
          />
          <Field label="Find a person" hideLabel>
            <span className="relative block">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name or staff number"
                className="pl-9"
              />
            </span>
          </Field>
          <p className="mt-3 text-body-sm text-muted">
            {chosen.length} selected
          </p>
          <div className="mt-2 flex max-h-72 flex-col gap-1 overflow-y-auto">
            {visible.map((employee) => (
              <label
                key={employee.id}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2",
                  chosen.includes(employee.id)
                    ? "border-accent bg-accent-soft"
                    : "border-line bg-surface hover:bg-canvas",
                )}
              >
                {/* A native control inside the label, the same as the radios
                    below: `Checkbox` requires its own visible label, and here
                    the label is the whole row. */}
                <input
                  type="checkbox"
                  checked={chosen.includes(employee.id)}
                  onChange={() => toggle(employee.id)}
                  className="size-4 shrink-0 accent-(--color-accent)"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body-sm font-medium text-ink">
                    {employee.firstName} {employee.lastName}
                  </span>
                  <span className="tabular block text-meta text-muted">
                    {employee.employeeNo} · {employee.jobTitle}
                  </span>
                </span>
              </label>
            ))}
            {visible.length === 0 && (
              <p className="text-body-sm text-body">Nobody by that name.</p>
            )}
          </div>
        </div>
      )}

      {stepper.index === 1 && (
        <div>
          <StepHeader title="What do they work?" />
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">Pattern or single shift</legend>
            {patterns
              .filter((row) => row.active && !row.archived)
              .map((row) => (
                <label
                  key={row.id}
                  className={cn(
                    "flex cursor-pointer flex-col gap-2 rounded-md border px-3.5 py-3",
                    choice?.kind === "pattern" && choice.id === row.id
                      ? "border-accent bg-accent-soft"
                      : "border-line bg-surface hover:bg-canvas",
                  )}
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="what"
                      checked={
                        choice?.kind === "pattern" && choice.id === row.id
                      }
                      onChange={() =>
                        setChoice({ kind: "pattern", id: row.id })
                      }
                      className="size-4 shrink-0 accent-(--color-accent)"
                    />
                    <span className="min-w-0 flex-1 text-body-sm font-medium text-ink">
                      {row.name}
                    </span>
                    <Badge tone="neutral" size="sm">
                      {row.shiftDaysPerCycle} on,{" "}
                      {row.cycleDays - row.shiftDaysPerCycle} off
                    </Badge>
                  </span>
                  <CycleStrip pattern={row} colours={colours} />
                </label>
              ))}

            {shifts.filter((row) => row.active && !row.archived).length > 0 && (
              <p className="mt-2 text-meta font-semibold text-muted">
                Or the same shift every day
              </p>
            )}
            {shifts
              .filter((row) => row.active && !row.archived)
              .map((row) => (
                <label
                  key={row.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-md border px-3.5 py-2.5",
                    choice?.kind === "shift" && choice.id === row.id
                      ? "border-accent bg-accent-soft"
                      : "border-line bg-surface hover:bg-canvas",
                  )}
                >
                  <input
                    type="radio"
                    name="what"
                    checked={choice?.kind === "shift" && choice.id === row.id}
                    onChange={() => setChoice({ kind: "shift", id: row.id })}
                    className="size-4 shrink-0 accent-(--color-accent)"
                  />
                  <span className="min-w-0 flex-1 text-body-sm text-ink">
                    <span className="font-semibold">{row.shortName}</span>{" "}
                    {row.name}
                  </span>
                  <span className="tabular shrink-0 text-body-sm text-muted">
                    {timesLabel(row)}
                  </span>
                </label>
              ))}
          </fieldset>
        </div>
      )}

      {stepper.index === 2 && (
        <div>
          <StepHeader title="From when?" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First day" required>
              <Input
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </Field>
            <Field
              label="Last day"
              required
              {...(dateProblem ? { error: dateProblem } : {})}
            >
              <Input
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </Field>
            {pattern && (
              <Field
                label="Start the cycle on"
                help="Leave this blank to start on the first day. Set it earlier to put a second crew out of step with the first."
                className="sm:col-span-2"
              >
                <Input
                  type="date"
                  value={cycleStart}
                  onChange={(event) => setCycleStart(event.target.value)}
                />
              </Field>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {[7, 28, 91].map((days) => (
              <Button
                key={days}
                size="sm"
                onClick={() => setTo(addDays(from, days - 1))}
              >
                {days === 7
                  ? "One week"
                  : days === 28
                    ? "Four weeks"
                    : "A quarter"}
              </Button>
            ))}
          </div>
        </div>
      )}

      {stepper.index === 3 && (
        <div>
          <StepHeader
            title="The first two weeks"
            description={`${chosen.length} ${chosen.length === 1 ? "person" : "people"} · ${rosteredEach} of these ${preview.length} days on`}
          />
          <div className="overflow-x-auto">
            <ul className="flex min-w-max gap-1">
              {preview.map((day) => {
                const colour = colourFor(colours, day.shiftId);
                return (
                  <li
                    key={day.date}
                    className="w-13 shrink-0 text-center"
                  >
                    <span className="block text-meta text-muted">
                      {dayAbbrev(day.date)}
                    </span>
                    <span className="tabular block text-body-sm font-semibold text-ink">
                      {dayOfMonth(day.date)}
                    </span>
                    {day.shiftId ? (
                      <span
                        className={cn(
                          "mt-1 flex h-8 items-center justify-center rounded-sm border text-meta font-semibold text-ink",
                          colour.block,
                        )}
                      >
                        {day.shortName}
                      </span>
                    ) : (
                      <span
                        className={cn(
                          "mt-1 flex h-8 items-center justify-center rounded-sm border border-line text-meta text-faint",
                          isWeekend(day.date) ? "bg-canvas" : "bg-surface",
                        )}
                      >
                        Off
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
          <p className="mt-4 text-body-sm text-body">
            {pattern ? pattern.name : shift ? shift.name : ""} from{" "}
            {shortDay(from)} to {shortDay(to)}. Everybody selected works the
            same days.
          </p>
        </div>
      )}
    </StepperModal>
  );
}

/** One cycle, named day by day. What tells you it is really four on four off. */
export function CycleStrip({
  pattern,
  colours,
}: {
  pattern: Pick<ApiPattern, "days">;
  colours: Map<string, import("./palette").ShiftColour>;
}) {
  return (
    <ul className="flex flex-wrap gap-1">
      {pattern.days.map((day) => {
        const colour = colourFor(colours, day.shiftId);
        return (
          <li key={day.day}>
            <span
              className={cn(
                "flex size-7 items-center justify-center rounded-sm border text-meta font-semibold",
                day.shiftId
                  ? cn(colour.block, "text-ink")
                  : "border-line bg-canvas text-faint",
              )}
              title={
                day.name
                  ? `Day ${day.day}: ${day.name}`
                  : `Day ${day.day}: rest day`
              }
            >
              {day.shortName ?? "·"}
              <span className="sr-only">
                {day.name
                  ? `Day ${day.day}, ${day.name}`
                  : `Day ${day.day}, off`}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
