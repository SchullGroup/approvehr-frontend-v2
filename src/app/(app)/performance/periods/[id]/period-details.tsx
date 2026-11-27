"use client";

import { useState } from "react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { dayLabel, type ApiCycle } from "@/lib/api/performance";
import {
  datesProblem,
  guideLinkProblem,
  messageProblem,
  REMINDER_CHOICES,
  reminderWords,
  STAFF_MESSAGE_WHERE,
} from "@/lib/performance/period-details";
import { useDepartments } from "@/lib/store/departments";
import { useCycleMutations } from "@/lib/store/performance";

/**
 * What a period says about itself after the wizard: when it covers and when
 * answers are due, the message people read above their first question, and the
 * one reminder. All three were asked once, in the wizard, and could not be seen
 * or changed afterwards.
 *
 * `PATCH /cycles/:id` takes every one of them at any stage short of published,
 * so they are editable on a running period too: correcting a due date changes
 * nothing anybody wrote. Each card sends only what changed, and says the API's
 * own sentence when it refuses.
 */

/** The API's `YYYY-MM-DD`, or empty. A date input will not take anything else. */
const day = (value: string | null): string => value?.slice(0, 10) ?? "";

function useSaver(onChanged: () => void) {
  const periods = useCycleMutations();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (
    cycleId: string,
    body: Parameters<typeof periods.updateCycle>[1],
    saved: string,
  ): Promise<boolean> => {
    /* A second press while one is out would send the same change twice. */
    if (saving) return false;
    setError(null);
    setSaving(true);
    try {
      await periods.updateCycle(cycleId, body);
      onChanged();
      toast.push({ title: saved, tone: "success" });
      return true;
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "That did not save. Try again.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  };
  return { save, saving, error, setError };
}

export function PeriodDatesCard({
  period,
  onChanged,
}: {
  period: ApiCycle;
  onChanged: () => void;
}) {
  const { flat } = useDepartments();
  const { save, saving, error, setError } = useSaver(onChanged);
  /* What was typed over what the server holds, so a re-read of the period never
     wipes an edit and nothing has to be seeded. */
  const [typed, setTyped] = useState<{
    start?: string;
    end?: string;
    due?: string;
  }>({});

  const current = {
    start: day(period.periodStart),
    end: day(period.periodEnd),
    due: day(period.dueDate),
  };
  const value = {
    start: typed.start ?? current.start,
    end: typed.end ?? current.end,
    due: typed.due ?? current.due,
  };
  const changed =
    value.start !== current.start ||
    value.end !== current.end ||
    value.due !== current.due;
  const problem = datesProblem(value.start, value.end);
  const fixed = period.stage === "PUBLISHED";

  const covers =
    period.departmentIds.length === 0
      ? "The whole company"
      : period.departmentIds
          .map(
            (id) => flat.find((one) => one.id === id)?.name ?? "A department",
          )
          .join(", ");

  const edit = (patch: typeof typed) => {
    setTyped({ ...typed, ...patch });
    setError(null);
  };

  const submit = async () => {
    if (problem || !changed) return;
    const body: Parameters<
      ReturnType<typeof useCycleMutations>["updateCycle"]
    >[1] = {};
    if (value.start !== current.start) body.periodStart = value.start || null;
    if (value.end !== current.end) body.periodEnd = value.end || null;
    if (value.due !== current.due) body.dueDate = value.due || null;
    if (await save(period.id, body, "Dates saved")) setTyped({});
  };

  return (
    <Card>
      <CardHeader title="Dates" />
      <CardBody className="flex flex-col gap-4">
        {fixed ? (
          <dl className="flex flex-col gap-1.5 text-body-sm">
            <Row
              label="Covers"
              text={
                current.start && current.end
                  ? `${dayLabel(current.start)} to ${dayLabel(current.end)}`
                  : "Not recorded"
              }
            />
            <Row
              label="Answers were due"
              text={current.due ? dayLabel(current.due) : "No date"}
            />
          </dl>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Period starts">
                <Input
                  type="date"
                  value={value.start}
                  onChange={(event) => edit({ start: event.target.value })}
                />
              </Field>
              <Field label="Period ends">
                <Input
                  type="date"
                  value={value.end}
                  onChange={(event) => edit({ end: event.target.value })}
                />
              </Field>
              <Field label="Answers due">
                <Input
                  type="date"
                  value={value.due}
                  onChange={(event) => edit({ due: event.target.value })}
                />
              </Field>
            </div>
            {(problem ?? error) && (
              <p role="alert" className="text-body-sm text-danger-text">
                {problem ?? error}
              </p>
            )}
            <div className="flex gap-2">
              <Button
                type="submit"
                size="sm"
                variant="accent"
                loading={saving}
                disabled={!changed || problem !== null}
              >
                Save dates
              </Button>
              {changed && (
                <Button
                  size="sm"
                  disabled={saving}
                  onClick={() => {
                    setTyped({});
                    setError(null);
                  }}
                >
                  Undo
                </Button>
              )}
            </div>
          </form>
        )}
        <dl className="text-body-sm">
          <Row label="Covers people in" text={covers} />
        </dl>
      </CardBody>
    </Card>
  );
}

export function PeriodMessageCard({
  period,
  onChanged,
}: {
  period: ApiCycle;
  onChanged: () => void;
}) {
  const { save, saving, error, setError } = useSaver(onChanged);
  const [typed, setTyped] = useState<{ message?: string; guide?: string }>({});
  const current = {
    message: period.instructions ?? "",
    guide: period.guideUrl ?? "",
  };
  const value = {
    message: typed.message ?? current.message,
    guide: typed.guide ?? current.guide,
  };
  const changed =
    value.message.trim() !== current.message ||
    value.guide.trim() !== current.guide;
  const problem =
    messageProblem(value.message) ?? guideLinkProblem(value.guide);
  const fixed = period.stage === "PUBLISHED";

  const submit = async () => {
    if (problem || !changed) return;
    const body: Parameters<
      ReturnType<typeof useCycleMutations>["updateCycle"]
    >[1] = {};
    if (value.message.trim() !== current.message)
      body.instructions = value.message.trim() || null;
    if (value.guide.trim() !== current.guide)
      body.guideUrl = value.guide.trim() || null;
    if (await save(period.id, body, "Message saved")) setTyped({});
  };

  return (
    <Card>
      <CardHeader title="Message to staff" description={STAFF_MESSAGE_WHERE} />
      <CardBody>
        {fixed ? (
          <div className="flex flex-col gap-2 text-body-sm text-ink">
            <p className="whitespace-pre-line">
              {current.message || "No message was written."}
            </p>
            {current.guide && (
              <p className="break-all text-muted">{current.guide}</p>
            )}
          </div>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <Field label="Message">
              <Textarea
                rows={4}
                value={value.message}
                onChange={(event) => {
                  setTyped({ ...typed, message: event.target.value });
                  setError(null);
                }}
              />
            </Field>
            <Field label="Link to the company's guide (optional)">
              <Input
                inputMode="url"
                value={value.guide}
                placeholder="https://"
                onChange={(event) => {
                  setTyped({ ...typed, guide: event.target.value });
                  setError(null);
                }}
              />
            </Field>
            {(problem ?? error) && (
              <p role="alert" className="text-body-sm text-danger-text">
                {problem ?? error}
              </p>
            )}
            <div className="flex gap-2">
              <Button
                type="submit"
                size="sm"
                variant="accent"
                loading={saving}
                disabled={!changed || problem !== null}
              >
                Save message
              </Button>
              {changed && (
                <Button
                  size="sm"
                  disabled={saving}
                  onClick={() => {
                    setTyped({});
                    setError(null);
                  }}
                >
                  Undo
                </Button>
              )}
            </div>
          </form>
        )}
      </CardBody>
    </Card>
  );
}

export function PeriodReminderCard({
  period,
  onChanged,
}: {
  period: ApiCycle;
  onChanged: () => void;
}) {
  const { save, saving, error } = useSaver(onChanged);
  const fixed = period.stage === "PUBLISHED";
  const noDate = !period.dueDate;
  const choices = REMINDER_CHOICES.includes(period.remindDaysBefore ?? 0)
    ? REMINDER_CHOICES
    : [...REMINDER_CHOICES, period.remindDaysBefore ?? 0]
        .filter((days) => days > 0)
        .sort((a, b) => a - b);

  return (
    <Card>
      <CardHeader
        title="Reminder"
        description="Sent once, to everybody who still owes a review. Nobody who has sent theirs is reminded."
      />
      <CardBody className="flex flex-col gap-3">
        {fixed ? (
          <p className="text-body-sm text-ink">
            {reminderWords(period.remindDaysBefore)}
          </p>
        ) : (
          <>
            <Field label="Remind them" className="max-w-64">
              <Select
                value={String(period.remindDaysBefore ?? 0)}
                disabled={saving || noDate}
                onChange={(event) => {
                  const days = Number(event.target.value);
                  void save(
                    period.id,
                    { remindDaysBefore: days === 0 ? null : days },
                    days === 0 ? "Reminder switched off" : "Reminder saved",
                  );
                }}
              >
                <option value="0">Not at all</option>
                {choices.map((days) => (
                  <option key={days} value={days}>
                    {reminderWords(days)}
                  </option>
                ))}
              </Select>
            </Field>
            {noDate && (
              <p className="text-body-sm text-muted">
                A reminder counts back from the answers-due date, and this
                period has none. Set it under Dates first.
              </p>
            )}
            {error && (
              <p role="alert" className="text-body-sm text-danger-text">
                {error}
              </p>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

function Row({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="text-muted">{label}</dt>
      <dd className="text-ink">{text}</dd>
    </div>
  );
}
