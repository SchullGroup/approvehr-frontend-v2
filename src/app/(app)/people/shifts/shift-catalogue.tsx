"use client";

import { useMemo, useState } from "react";
import { Clock, Plus, Repeat, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import {
  crossesMidnight,
  hoursLabel,
  timesLabel,
  type ApiPattern,
  type ApiShift,
} from "@/lib/api/shifts";
import { useShiftMutations } from "@/lib/store/shifts";
import { CycleStrip } from "./assign-pattern";
import { shiftColours } from "./palette";

/**
 * The shifts a company has, and the cycles built out of them.
 *
 * Two lists rather than two routes: a pattern is a sequence of shift ids and
 * cannot be written without them in front of you. One route per concept.
 *
 * ## Three refusals that are features
 *
 * - **A shift's start and end move together.** Sending one without the other
 *   changes how long every future shift lasts and leaves `crossesMidnight`
 *   derived from a half-updated pair, so the API refuses it and this form always
 *   sends both.
 * - **Archiving is refused while the shift is on a future rota or inside a
 *   pattern**, and the message names which. Rotas already worked still point at
 *   it, so nothing is ever deleted.
 * - **Editing a cycle does not rewrite anybody's existing rota.** A pattern is a
 *   template; the rota is the record. The response says how many people are on
 *   the pattern, and putting them on the new cycle is a deliberate second act.
 */
export function ShiftCatalogue({
  shifts,
  patterns,
  editable,
  onChanged,
}: {
  shifts: ApiShift[];
  patterns: ApiPattern[];
  /** False when the reader cannot edit records. Controls are simply absent. */
  editable: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const { archiveShift } = useShiftMutations();
  const colours = useMemo(() => shiftColours(shifts), [shifts]);

  const [shiftForm, setShiftForm] = useState<
    { mode: "new" } | { mode: "edit"; shift: ApiShift } | null
  >(null);
  const [patternForm, setPatternForm] = useState<
    { mode: "new" } | { mode: "edit"; pattern: ApiPattern } | null
  >(null);
  const [archiving, setArchiving] = useState<ApiShift | null>(null);
  const [busy, setBusy] = useState(false);
  /**
   * A refused archive is shown **in the dialog**, not as a toast.
   *
   * The message names the blocker — "Nights is on the rota 94 times from 19 Aug"
   * — and that is the thing to act on. A toast carrying it disappears while the
   * dialog it belongs to is still open with the same button armed, so the next
   * press produces the same refusal and the reader has already lost the text.
   */
  const [blocked, setBlocked] = useState<string | null>(null);

  const archive = async () => {
    if (!archiving) return;
    setBusy(true);
    setBlocked(null);
    try {
      await archiveShift(archiving.id);
      toast.push({ title: `${archiving.name} archived`, tone: "success" });
      setArchiving(null);
      onChanged();
    } catch (caught) {
      setBlocked(
        caught instanceof ApiError
          ? caught.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Shifts"
            description="A start, an end, and an unpaid break."
            level={3}
            action={
              editable ? (
                <Button
                  variant="accent"
                  size="sm"
                  onClick={() => setShiftForm({ mode: "new" })}
                >
                  <Plus aria-hidden="true" className="size-4" />
                  Add a shift
                </Button>
              ) : undefined
            }
          />
          {shifts.length === 0 ? (
            <EmptyState
              compact
              icon={<Clock aria-hidden="true" />}
              title="No shifts yet"
              description="Add an early, a late and a night, then build a cycle out of them."
              action={
                editable ? (
                  <Button
                    variant="accent"
                    onClick={() => setShiftForm({ mode: "new" })}
                  >
                    Add a shift
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <CardBody className="flex flex-col divide-y divide-line">
              {shifts.map((shift) => (
                <div
                  key={shift.id}
                  className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <span
                    aria-hidden="true"
                    className={`size-2.5 shrink-0 rounded-sm ${colours.get(shift.id)?.swatch ?? "bg-muted"}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.875rem] font-medium text-ink">
                      <span className="font-semibold">{shift.shortName}</span>{" "}
                      {shift.name}
                    </span>
                    <span className="tabular block text-[0.75rem] text-muted">
                      {timesLabel(shift)} · {hoursLabel(shift.paidMinutes)} paid
                      {shift.unpaidBreakMinutes > 0
                        ? ` · ${shift.unpaidBreakMinutes}m break`
                        : ""}
                    </span>
                  </span>
                  {shift.archived && (
                    <Badge tone="neutral" size="sm">
                      Archived
                    </Badge>
                  )}
                  {!shift.active && !shift.archived && (
                    <Badge tone="warning" size="sm">
                      Switched off
                    </Badge>
                  )}
                  <Badge tone="neutral" size="sm">
                    {shift.timesRostered} rostered
                  </Badge>
                  {editable && !shift.archived && (
                    <span className="flex shrink-0 items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setShiftForm({ mode: "edit", shift })}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setArchiving(shift)}
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                        <span className="sr-only">Archive {shift.name}</span>
                      </Button>
                    </span>
                  )}
                </div>
              ))}
            </CardBody>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Cycles"
            description="Four on, four off. Earlies one week, lates the next."
            level={3}
            action={
              editable && shifts.length > 0 ? (
                <Button
                  variant="accent"
                  size="sm"
                  onClick={() => setPatternForm({ mode: "new" })}
                >
                  <Plus aria-hidden="true" className="size-4" />
                  Add a cycle
                </Button>
              ) : undefined
            }
          />
          {patterns.length === 0 ? (
            <EmptyState
              compact
              icon={<Repeat aria-hidden="true" />}
              title="No cycles yet"
              description={
                shifts.length === 0
                  ? "Add a shift first."
                  : "Build one out of the shifts you have."
              }
              action={
                editable && shifts.length > 0 ? (
                  <Button
                    variant="accent"
                    onClick={() => setPatternForm({ mode: "new" })}
                  >
                    Add a cycle
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <CardBody className="flex flex-col gap-3">
              {patterns.map((pattern) => (
                <div
                  key={pattern.id}
                  className="flex flex-col gap-2 rounded-md border border-line bg-surface px-3.5 py-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 text-[0.875rem] font-medium text-ink">
                      {pattern.name}
                    </span>
                    <Badge tone="neutral" size="sm">
                      {pattern.cycleDays}-day cycle
                    </Badge>
                    <Badge tone="neutral" size="sm">
                      {pattern.peopleOn} on it
                    </Badge>
                    {pattern.archived && (
                      <Badge tone="neutral" size="sm">
                        Archived
                      </Badge>
                    )}
                    {editable && !pattern.archived && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setPatternForm({ mode: "edit", pattern })}
                      >
                        Edit
                      </Button>
                    )}
                  </div>
                  <CycleStrip pattern={pattern} colours={colours} />
                </div>
              ))}
            </CardBody>
          )}
        </Card>
      </div>

      {shiftForm && (
        <ShiftForm
          state={shiftForm}
          onClose={() => setShiftForm(null)}
          onDone={onChanged}
        />
      )}

      {patternForm && (
        <PatternForm
          state={patternForm}
          shifts={shifts.filter((row) => !row.archived)}
          onClose={() => setPatternForm(null)}
          onDone={onChanged}
        />
      )}

      <ConfirmDialog
        open={archiving !== null}
        onClose={() => {
          setArchiving(null);
          setBlocked(null);
        }}
        onConfirm={() => void archive()}
        title={`Archive ${archiving?.name ?? "this shift"}?`}
        confirmLabel="Archive"
        loading={busy}
        body={
          blocked ? (
            <span className="text-ink">{blocked}</span>
          ) : (
            <>
              It comes off the pickers. Days already worked keep pointing at it,
              so nothing on an old rota or payslip changes.
            </>
          )
        }
      />
    </>
  );
}

/* ---------------------------------------------------------------- shift form */

function ShiftForm({
  state,
  onClose,
  onDone,
}: {
  state: { mode: "new" } | { mode: "edit"; shift: ApiShift };
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const { createShift, updateShift } = useShiftMutations();
  const existing = state.mode === "edit" ? state.shift : null;

  const [name, setName] = useState(existing?.name ?? "");
  const [shortName, setShortName] = useState(existing?.shortName ?? "");
  const [startTime, setStartTime] = useState(existing?.startTime ?? "06:00");
  const [endTime, setEndTime] = useState(existing?.endTime ?? "14:00");
  const [breakMinutes, setBreakMinutes] = useState(
    String(existing?.unpaidBreakMinutes ?? 30),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const crosses = crossesMidnight(startTime, endTime);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        shortName: shortName.trim(),
        /* Both times, always. One without the other is refused. */
        startTime,
        endTime,
        unpaidBreakMinutes: Number(breakMinutes) || 0,
      };
      if (existing) await updateShift(existing.id, body);
      else await createShift(body);
      toast.push({
        title: existing ? `${body.name} saved` : `${body.name} added`,
        tone: "success",
      });
      onDone();
      onClose();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "That did not save. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={existing ? `Edit ${existing.name}` : "Add a shift"}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="accent"
            onClick={submit}
            loading={busy}
            disabled={name.trim().length < 2 || shortName.trim().length < 1}
          >
            {existing ? "Save" : "Add shift"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <p className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-[0.875rem] text-ink">
            {error}
          </p>
        )}
        <Field label="Name" required>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nights"
            maxLength={60}
          />
        </Field>
        <Field
          label="Short label"
          help="What fits in a rota square. N, E, L."
          required
        >
          <Input
            value={shortName}
            onChange={(event) => setShortName(event.target.value)}
            placeholder="N"
            maxLength={4}
            className="w-24"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts" required>
            <Input
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
            />
          </Field>
          <Field
            label="Ends"
            required
            {...(crosses ? { help: "The next morning." } : {})}
          >
            <Input
              type="time"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
            />
          </Field>
        </div>
        <Field label="Unpaid break, in minutes">
          <Input
            type="number"
            min={0}
            max={480}
            value={breakMinutes}
            onChange={(event) => setBreakMinutes(event.target.value)}
            className="w-28"
          />
        </Field>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------- pattern form */

const REST = "";

/**
 * Building a cycle.
 *
 * One select per day, and the number of days **is** the cycle length — there is
 * no separate "how long is the cycle" field to contradict it. That is the same
 * decision the API's `sequence` makes: four on four off is eight entries, so
 * nothing can disagree about how long the cycle runs.
 */
function PatternForm({
  state,
  shifts,
  onClose,
  onDone,
}: {
  state: { mode: "new" } | { mode: "edit"; pattern: ApiPattern };
  shifts: ApiShift[];
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const { createPattern, updatePattern } = useShiftMutations();
  const existing = state.mode === "edit" ? state.pattern : null;

  const [name, setName] = useState(existing?.name ?? "");
  const [days, setDays] = useState<string[]>(
    existing
      ? existing.sequence.map((entry) => entry ?? REST)
      : [shifts[0]?.id ?? REST, shifts[0]?.id ?? REST, REST, REST],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const working = days.filter((entry) => entry !== REST).length;

  const setDay = (index: number, value: string) =>
    setDays((current) =>
      current.map((entry, i) => (i === index ? value : entry)),
    );

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const sequence = days.map((entry) => (entry === REST ? null : entry));
      if (existing) {
        const result = await updatePattern(existing.id, {
          name: name.trim(),
          sequence,
        });
        toast.push({
          title: `${result.name} saved`,
          tone: "success",
          detail:
            result.peopleOn > 0
              ? `${result.peopleOn} ${result.peopleOn === 1 ? "person is" : "people are"} on the old cycle. Put them on this one from the rota.`
              : undefined,
        });
      } else {
        await createPattern({ name: name.trim(), sequence });
        toast.push({ title: `${name.trim()} added`, tone: "success" });
      }
      onDone();
      onClose();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "That did not save. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={existing ? `Edit ${existing.name}` : "Add a cycle"}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="accent"
            onClick={submit}
            loading={busy}
            disabled={name.trim().length < 2 || working === 0}
          >
            {existing ? "Save cycle" : "Add cycle"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <p className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-[0.875rem] text-ink">
            {error}
          </p>
        )}

        <Field label="Name" required>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Four on, four off"
            maxLength={60}
          />
        </Field>

        <div>
          <p className="text-sm font-medium text-ink">
            The cycle · {days.length} days, {working} on
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {days.map((entry, index) => (
              <Field key={index} label={`Day ${index + 1}`}>
                <Select
                  value={entry}
                  onChange={(event) => setDay(index, event.target.value)}
                >
                  <option value={REST}>Rest day</option>
                  {shifts.map((shift) => (
                    <option key={shift.id} value={shift.id}>
                      {shift.shortName} · {shift.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => setDays((current) => [...current, REST])}
              disabled={days.length >= 42}
            >
              <Plus aria-hidden="true" className="size-4" />
              Add a day
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDays((current) => current.slice(0, -1))}
              disabled={days.length <= 1}
            >
              Remove the last day
            </Button>
          </div>
        </div>

        {existing && existing.peopleOn > 0 && (
          <p className="text-[0.875rem] text-body">
            {existing.peopleOn}{" "}
            {existing.peopleOn === 1 ? "person is" : "people are"} on this cycle.
            Saving does not move their rota.
          </p>
        )}
      </div>
    </Modal>
  );
}
