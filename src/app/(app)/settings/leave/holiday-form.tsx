"use client";

import { useState } from "react";
import { Button, Checkbox, Field, Input, Modal } from "@/components/ui";
import type { PublicHolidayRow } from "@/lib/api/leave";

/**
 * Adding or editing a public holiday.
 *
 * ## The `confirmed` box is the whole point of the form
 *
 * A date somebody has seen gazetted goes in confirmed — which is the default,
 * matching the API and the column, because making somebody say so twice is how
 * you end up with a calendar of unconfirmed real holidays. A date that is
 * *expected* — both Eids, Mawlid, an Independence Day observance that may shift —
 * goes in unconfirmed, and the help text says what that costs, because it is not
 * nothing: payroll and overtime act on an unconfirmed date immediately.
 *
 * ## Dates are strings the whole way
 *
 * `type="date"` gives `YYYY-MM-DD`, which is exactly what the API's `isoDate`
 * wants, so nothing is parsed into a `Date` and back — a round trip through local
 * time is how a holiday lands on the 30th for anybody west of Lagos.
 */
export function HolidayForm({
  holiday,
  onClose,
  onSave,
}: {
  /** Absent when adding. */
  holiday?: PublicHolidayRow;
  onClose: () => void;
  onSave: (body: {
    date: string;
    name: string;
    confirmed: boolean;
  }) => Promise<void>;
}) {
  const editing = holiday !== undefined;

  const [date, setDate] = useState(holiday?.date ?? "");
  const [name, setName] = useState(holiday?.name ?? "");
  const [confirmed, setConfirmed] = useState(holiday?.confirmed ?? true);
  const [busy, setBusy] = useState(false);

  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const dateError =
    date.length > 0 && !dateValid ? "Use a full date: day, month and year." : undefined;

  const trimmed = name.trim();
  const canSave = dateValid && trimmed.length >= 2 && !busy;

  async function save() {
    setBusy(true);
    try {
      await onSave({ date, name: trimmed, confirmed });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={editing ? `Edit ${holiday.name}` : "Add a public holiday"}
      description={
        editing
          ? undefined
          : "Attendance, overtime rates and payroll proration all read this date."
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={!canSave}
            loading={busy}
            onClick={() => void save()}
          >
            {editing ? "Save" : "Add holiday"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Date" required error={dateError}>
          <Input
            type="date"
            value={date}
            autoFocus={!editing}
            onChange={(e) => {
              const value = e.target.value;
              setDate(value);
            }}
          />
        </Field>

        <Field label="Holiday" required help="As it is proclaimed: people search for it by name.">
          <Input
            value={name}
            placeholder="Eid al-Fitr"
            onChange={(e) => {
              const value = e.target.value;
              setName(value);
            }}
          />
        </Field>

        <Checkbox
          label="This date has been gazetted"
          description={
            confirmed
              ? "Everything that reads the calendar treats it as a settled holiday."
              : "Marked as awaiting proclamation. Payroll proration and overtime rates act on it straight away; the attendance timesheet and the help desk's response clock wait until it is confirmed."
          }
          checked={confirmed}
          onChange={(e) => {
            const next = e.target.checked;
            setConfirmed(next);
          }}
        />
      </div>
    </Modal>
  );
}
