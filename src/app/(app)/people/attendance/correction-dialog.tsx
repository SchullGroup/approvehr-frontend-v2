"use client";

import { useState } from "react";
import {
  Button,
  Callout,
  Field,
  Input,
  Modal,
  Select,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { ApiRosterRow } from "@/lib/api/attendance";
import {
  useAttendanceMutations,
  useWorkLocations,
} from "@/lib/store/attendance";
import { shortDate } from "@/lib/today";
import { actionMessage } from "@/lib/use-action";

/**
 * What is wrong with a correction before it is sent, or nothing.
 *
 * These are the ones the API would refuse anyway — `correct()` rejects a
 * clock-out before the clock-in, and the schema caps the reason at 300 — plus
 * one it would accept and shouldn't have to: a clock-out with no clock-in is a
 * day that ended without starting. Said beside the field rather than after a
 * round trip.
 *
 * `HH:MM` strings from a time input compare correctly as text; both are
 * zero-padded.
 */
export function correctionProblems(input: {
  clockIn: string;
  clockOut: string;
  note: string;
}): { clockOut?: string; note?: string } {
  const problems: { clockOut?: string; note?: string } = {};
  if (input.clockOut && !input.clockIn) {
    problems.clockOut = "Add a clock-in as well, or clear this.";
  } else if (input.clockOut && input.clockOut < input.clockIn) {
    problems.clockOut = "The clock-out is before the clock-in.";
  }
  if (!input.note.trim()) {
    problems.note = "A reason is required.";
  } else if (input.note.trim().length < 3) {
    problems.note = "Say why this changed.";
  } else if (input.note.trim().length > 300) {
    problems.note = "Keep the reason under 300 characters.";
  }
  return problems;
}

/**
 * The API's own words for a refusal.
 *
 * A field-level refusal arrives as "Some fields are not valid." with the real
 * sentence one level down, so those are read out; everything else goes through
 * the same wording every save in the app uses, which keeps the server's sentence
 * where it wrote one ("The clock-out is before the clock-in.") and says
 * something true where it did not.
 */
function refusalDetail(error: unknown): string {
  if (error instanceof ApiError && error.fieldErrors.length > 0) {
    return error.fieldErrors.map((field) => field.message).join(" ");
  }
  /* A 404 here is the person, not the correction: the employee was removed
     while the form was open. "The correction is not there" would be a riddle. */
  if (error instanceof ApiError && error.status === 404) {
    return "That person's record could not be found, so nothing was changed.";
  }
  return actionMessage(error, "the correction");
}

/**
 * An HR correction of one person's day.
 *
 * Shared by the roster on `/people/attendance` (today) and the calendar on
 * `/people/attendance/history` (any earlier day) — one dialog, because two
 * copies drift until one of them stops asking for the reason.
 *
 * The note is required rather than optional. Payroll pays against this number,
 * so a change without a stated reason is exactly the kind of thing an auditor
 * asks about and nobody can answer.
 *
 * The location select starts on "leave it as it is" rather than on a default,
 * because a roster row carries a location *name* and not its id — so preselecting
 * anything would quietly move somebody's site the next time HR fixed a time.
 * Omitting the field leaves the stored value alone.
 *
 * ## A day with nothing on it
 *
 * `PATCH /attendance/entries/:employeeId/:date` creates the entry when there is
 * none, so the same form records a day nobody clocked. The roster row cannot
 * tell "no entry" from "an entry HR emptied" — both read as no times — so
 * nothing on the row means the wording says "record", which is true of both.
 *
 * ## A day that has been paid
 *
 * The API does not refuse a correction inside a payroll run that is already
 * approved or paid; the run is frozen and keeps its old figures. `pastDay`
 * says so rather than letting a change look as if it reached the payslip.
 *
 * Whatever the API refuses is shown as it said it — "The correction was
 * refused" with the server's own sentence beneath — and the form stays open.
 */
export function CorrectionDialog({
  row,
  date,
  pastDay = false,
  onClose,
}: {
  row: ApiRosterRow;
  /** `YYYY-MM-DD`, the day being corrected. */
  date: string;
  /** True for any day before today. */
  pastDay?: boolean;
  onClose: () => void;
}) {
  const { correct } = useAttendanceMutations();
  const { locations } = useWorkLocations();
  const toast = useToast();

  const blank = !row.clockIn && !row.clockOut;

  const [clockIn, setClockIn] = useState(row.clockIn ?? "");
  const [clockOut, setClockOut] = useState(row.clockOut ?? "");
  const [locationId, setLocationId] = useState("");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const problems = correctionProblems({ clockIn, clockOut, note });

  async function save() {
    setTouched(true);
    if (problems.clockOut || problems.note) return;
    setSaving(true);
    try {
      await correct(
        row.employeeId,
        date,
        {
          clockIn: clockIn || null,
          clockOut: clockOut || null,
          ...(locationId ? { locationId } : {}),
        },
        note,
      );
      toast.push({
        title: blank
          ? `${row.employeeName}'s day recorded`
          : `${row.employeeName}'s record corrected`,
        tone: "success",
        detail: "The change and your reason are both on the record.",
      });
      /* `correct` announces, so every attendance read on screen refetches
         itself. All this has left to do is shut the dialog. */
      onClose();
    } catch (error) {
      toast.push({
        title: "The correction was refused",
        tone: "danger",
        detail: refusalDetail(error),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={
        blank
          ? `Record ${row.employeeName}'s day`
          : `Correct ${row.employeeName}'s day`
      }
      description={
        blank
          ? `${shortDate(date)}. Nothing is on file for this day. The reason is kept with the entry.`
          : `${shortDate(date)}. The reason is kept with the change.`
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={saving}
            onClick={() => void save()}
          >
            {blank ? "Save record" : "Save correction"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {pastDay && (
          <Callout tone="warning">
            If this day is in a payroll that is already approved or paid, that
            payroll keeps the figures it had. This change will not reach it.
          </Callout>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Clocked in" help="Leave empty to record an absence.">
            <Input
              type="time"
              value={clockIn}
              onChange={(e) => {
                const v = e.target.value;
                setClockIn(v);
              }}
            />
          </Field>
          <Field
            label="Clocked out"
            error={touched ? problems.clockOut : undefined}
          >
            <Input
              type="time"
              value={clockOut}
              onChange={(e) => {
                const v = e.target.value;
                setClockOut(v);
              }}
            />
          </Field>
        </div>

        <Field label="Where">
          <Select
            value={locationId}
            onChange={(e) => {
              const v = e.target.value;
              setLocationId(v);
            }}
          >
            <option value="">
              {row.workLocation
                ? `Leave as ${row.workLocation}`
                : "Leave as it is"}
            </option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
                {location.addressLine ? ` — ${location.addressLine}` : ""}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Reason for the change"
          required
          error={touched ? problems.note : undefined}
          help="Payroll pays against this record."
        >
          <Input
            value={note}
            placeholder="Forgot to clock out; confirmed with their manager"
            onChange={(e) => {
              const v = e.target.value;
              setNote(v);
            }}
          />
        </Field>
      </div>
    </Modal>
  );
}
