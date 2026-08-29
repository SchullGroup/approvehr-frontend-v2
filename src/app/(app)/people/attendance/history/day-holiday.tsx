"use client";

import { useState } from "react";
import { CalendarPlus, PartyPopper } from "lucide-react";
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  Field,
  Input,
  Modal,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import {
  HOLIDAY_DELETE_EFFECTS,
  UNCONFIRMED_HOLIDAY_EFFECT,
} from "@/lib/api/leave";
import { useCan } from "@/lib/permissions";
import { useHolidayMutations, usePublicHolidays } from "@/lib/store/holidays";

/**
 * Making a date a public holiday, from the calendar you are looking at.
 *
 * ## Why it belongs here and not only in Settings
 *
 * `/settings/leave` has the full holidays panel, and it is the right home for
 * loading a year at a time. It is the wrong place to be the **only** door: a
 * Nigerian public holiday is frequently proclaimed days before it happens, and
 * the moment somebody finds out is the moment they are looking at the month —
 * on this calendar, at the date. Making them leave, find a settings page and
 * type the date they were already pointing at is how a date gets recorded late
 * or not at all.
 *
 * ## What it does not do
 *
 * It does not change what the day already looks like on this screen. A holiday
 * is a fact about the calendar; the attendance for that date is a separate fact
 * and stays exactly as it was. `history-screen` reloads afterwards so the day's
 * `kind` comes back from the server rather than being guessed at here.
 *
 * ## Confirmed, and the asymmetry that surprises people
 *
 * A date can be added before it is gazetted, which is the common case and the
 * reason `confirmed` exists at all. `UNCONFIRMED_HOLIDAY_EFFECT` is the API's
 * own sentence about what that costs — payroll proration and overtime read
 * **every** holiday row and ignore `confirmed`, while the timesheet and the
 * help desk's SLA clock filter to confirmed ones. So an expected date already
 * costs money before it is announced and still shows as a working day here.
 * That is stated rather than smoothed over, because somebody adding a date
 * needs to know which half of the product will act on it tonight.
 */
export function DayHoliday({
  /** `YYYY-MM-DD`, the selected date. */
  date,
  /** What the server says about this date, if anything. */
  holiday: onDay,
  onChanged,
}: {
  date: string;
  holiday: { name: string; confirmed: boolean } | null;
  onChanged: () => void;
}) {
  const canManage = useCan("MANAGE_SETTINGS");
  const year = Number(date.slice(0, 4));
  /* Only to find the row's **id**, which the attendance day does not carry —
     `ApiAttendanceDay.holiday` is a name and a flag. Editing or removing one
     needs the id, and this is where it comes from. */
  const calendar = usePublicHolidays(year);
  const mutations = useHolidayMutations();
  const toast = useToast();

  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);

  const row = calendar.holidays.find((entry) => entry.date === date) ?? null;

  /* Absent, not disabled. Somebody who cannot change the company's calendar has
     no use for a button the API would refuse — and on a date that is already a
     holiday the badge below still tells them, which is the part they need. */
  if (!canManage && !onDay) return null;

  const confirm = async () => {
    if (!row) return;
    setBusy(true);
    try {
      await mutations.update(row.id, { confirmed: true });
      toast.push({ title: `${row.name} is confirmed`, tone: "success" });
      onChanged();
    } catch (caught) {
      toast.push({
        title: "That did not work",
        tone: "danger",
        detail:
          caught instanceof ApiError ? caught.message : "Try again in a moment.",
      });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!row) return;
    setBusy(true);
    try {
      await mutations.remove(row.id);
      setRemoving(false);
      toast.push({ title: `${row.name} removed`, tone: "success" });
      onChanged();
    } catch (caught) {
      toast.push({
        title: "That did not work",
        tone: "danger",
        detail:
          caught instanceof ApiError ? caught.message : "Try again in a moment.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-canvas px-3.5 py-3">
      {onDay ? (
        <span className="flex flex-wrap items-center gap-2">
          <PartyPopper aria-hidden="true" className="size-4 text-accent-text" />
          <span className="text-body-sm font-medium text-ink">{onDay.name}</span>
          <Badge tone={onDay.confirmed ? "success" : "warning"} size="sm">
            {onDay.confirmed ? "Confirmed" : "Not gazetted yet"}
          </Badge>
        </span>
      ) : (
        <span className="text-body-sm text-muted">
          Not a public holiday.
        </span>
      )}

      {canManage && (
        <span className="flex flex-wrap gap-2">
          {onDay ? (
            <>
              {!onDay.confirmed && row && (
                <Button size="sm" loading={busy} onClick={() => void confirm()}>
                  Mark confirmed
                </Button>
              )}
              {/* Only where the id was found. The calendar read is scoped to
                  the year, and a holiday the server knows about but this read
                  has not returned would otherwise offer a button that could
                  not act. */}
              {row && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRemoving(true)}
                >
                  Remove it
                </Button>
              )}
            </>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
              <CalendarPlus aria-hidden="true" className="size-3.5" />
              Make it a public holiday
            </Button>
          )}
        </span>
      )}

      {adding && (
        <AddHolidayDialog
          date={date}
          onClose={() => setAdding(false)}
          onAdded={(name) => {
            setAdding(false);
            toast.push({ title: `${name} added`, tone: "success" });
            onChanged();
          }}
        />
      )}

      {removing && row && (
        <ConfirmDialog
          open
          onClose={() => setRemoving(false)}
          onConfirm={() => void remove()}
          title={`Remove ${row.name}?`}
          confirmLabel="Remove it"
          tone="danger"
          loading={busy}
          /* The API's own paragraph, written once so this dialog and the
             settings panel cannot describe the same act differently. It is
             four specific consequences rather than "are you sure?" — deleting
             a date a leave request was costed against is allowed, cascades
             nothing, and leaves several things quietly treating the day as
             ordinary. */
          body={HOLIDAY_DELETE_EFFECTS}
        />
      )}
    </div>
  );
}

function AddHolidayDialog({
  date,
  onClose,
  onAdded,
}: {
  date: string;
  onClose: () => void;
  onAdded: (name: string) => void;
}) {
  const mutations = useHolidayMutations();
  const [name, setName] = useState("");
  /* Confirmed by default, matching the API's own column default: somebody
     adding a date they have seen proclaimed should not have to say so twice.
     Unticking it is the deliberate act, for a date that is expected. */
  const [confirmed, setConfirmed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const save = async () => {
    if (name.trim().length < 2) {
      setFailed("Give it a name people will recognise.");
      return;
    }
    setBusy(true);
    setFailed(null);
    try {
      await mutations.create({ date, name: name.trim(), confirmed });
      onAdded(name.trim());
    } catch (caught) {
      setFailed(
        caught instanceof ApiError
          ? caught.message
          : "That did not save. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const readable = new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Add a public holiday"
      description={readable}
      size="sm"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="accent" loading={busy} onClick={() => void save()}>
            Add it
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="What it is called"
          required
          {...(failed ? { error: failed } : {})}
        >
          <Input
            value={name}
            autoFocus
            placeholder="Eid al-Fitr"
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Checkbox
          label="It has been gazetted"
          description="Leave this unticked for a date you are expecting but which has not been announced yet."
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
        />

        {/* The asymmetry, in the API's own words, and only where it applies.
            Somebody adding an expected date needs to know that half the product
            will act on it tonight and half will not. */}
        {!confirmed && (
          <div className="flex flex-col gap-1.5 rounded-md border border-warning-line bg-warning-soft px-3.5 py-2.5 text-meta text-ink">
            {/* Two halves, and they are the point: one part of the product acts
                on an ungazetted date tonight and the other does not. Rendered
                as the API names them rather than joined into a sentence, so a
                reader can see which is which. */}
            <span>{UNCONFIRMED_HOLIDAY_EFFECT.acts}</span>
            <span>{UNCONFIRMED_HOLIDAY_EFFECT.waits}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
