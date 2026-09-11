"use client";

import { useState } from "react";
import { Clock, LogIn, LogOut } from "lucide-react";
import Link from "next/link";
import {
  Button,
  ConfirmDialog,
  Field,
  Select,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { geofenceRefusal, type ApiClockResult } from "@/lib/api/attendance";
import { PositionError } from "@/lib/geolocation";
import {
  STATUS_LABEL,
  useAttendanceMutations,
  useWorkLocations,
  type RosterState,
} from "@/lib/store/attendance";
import { useSession } from "@/lib/store/session";
import { DayTimer } from "@/app/(app)/people/attendance/day-timer";

/**
 * Clocking in and out from the top bar.
 *
 * ## The roster is handed in, never fetched here
 *
 * `useNavBadges` in `shell.tsx` already calls `useAttendanceRoster()` on every
 * page to compute the sidebar's `notClockedIn` count, so the state this menu
 * needs is already in the chrome. Calling the hook again here would fire a
 * **second** `GET /attendance/roster` on every page load — and worse, the two
 * answers could differ, leaving the sidebar badge and this menu disagreeing
 * about whether you are on the clock. `AppShell` lifts the one call and passes
 * it to both. Same rule as `WalletStatement`, one module along.
 *
 * ## Nothing else is fetched until it is opened
 *
 * `ClockPanel` is a separate component mounted only while the menu is open, so
 * `useWorkLocations()` runs on first open rather than on every page load.
 * Putting that hook in this component would have put a second request into the
 * chrome for a panel most page views never open. The rate limit is 300 in
 * fifteen minutes and `.env.example` records that opening three screens spends
 * a noticeable part of it.
 *
 * ## Who sees it
 *
 * Somebody with an employee record, in a company that has clocked somebody in.
 * An account with no employee record is the owner on day one — registering a
 * company creates a `User`, not an `Employee` — and they cannot clock in at
 * all, so a clock in their chrome would be a control that only ever refuses.
 *
 * **The `tracked` half has a day-one consequence worth knowing**: a company
 * where nobody has ever clocked in has no icon here, so the first clock-in of
 * that company's life has to happen on `/people/attendance`. After it, the
 * icon is there for everybody. That is deliberate — it keeps the chrome clean
 * for the many companies that do not use clock-in at all — but it is the one
 * thing to revisit if the icon is meant to be how people *discover* the
 * feature.
 *
 * ## The dot
 *
 * Present only while the clock is running, which is the same rule the bell
 * beside it follows: a marker that is always there is not a marker. It does
 * **not** mark "you have not clocked in" — that would be a dot on every
 * evening and every weekend, and the sidebar's own badge already carries the
 * company-level version of that question for the people entitled to see it.
 */
export function ClockMenu({ roster }: { roster: RosterState }) {
  const session = useSession();
  const [open, setOpen] = useState(false);

  /* The id in the session is an *account* id when connected; `employeeId` is
     the one that matches a roster row. `my-clock-card.tsx` says the same. */
  const myRow = roster.rows.find(
    (row) => row.employeeId === session.employeeId,
  );

  if (!session.employeeId || !roster.tracked) return null;

  const onTheClock = Boolean(myRow?.clockIn && !myRow.clockOut);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={
          onTheClock
            ? `Your clock, on the clock since ${myRow?.clockIn ?? ""}`
            : "Your clock"
        }
        className="relative rounded-md p-2 text-muted transition-colors hover:bg-canvas hover:text-ink"
      >
        <Clock aria-hidden="true" className="size-4" />
        {onTheClock && (
          <span
            aria-hidden="true"
            className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-success-strong ring-2 ring-surface"
          />
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-label="Your clock"
            className="animate-scale-in absolute right-0 z-50 mt-1.5 w-72 rounded-lg border border-line bg-surface p-3 shadow-lg"
          >
            <ClockPanel roster={roster} onDone={() => setOpen(false)} />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The panel, mounted on open so its own reads cost nothing until then.
 *
 * Every refusal path is the card's, deliberately: three sources reach here and
 * they are not interchangeable — a `PositionError` the browser raised with no
 * request made, a geofence 422 whose `summary` is the API's own phrasing of
 * the distance, and an ordinary `ApiError` that already names the time and the
 * fix. "Clock-in failed" is the one thing none of them may become. No distance
 * is formatted here; doing so would be a second distance formatter drifting
 * from the API's.
 */
function ClockPanel({
  roster,
  onDone,
}: {
  roster: RosterState;
  onDone: () => void;
}) {
  const session = useSession();
  const locations = useWorkLocations();
  const { clockIn, clockOut } = useAttendanceMutations();
  const toast = useToast();

  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const policy = roster.policy;
  const myRow = roster.rows.find(
    (row) => row.employeeId === session.employeeId,
  );

  const locationId = picked ?? locations.locations[0]?.id ?? "";
  const selected = locations.locations.find((l) => l.id === locationId) ?? null;

  const nothingToClock =
    myRow?.status === "ON_LEAVE" ||
    myRow?.status === "HOLIDAY" ||
    myRow?.status === "REST_DAY";

  const run = async (
    action: () => Promise<ApiClockResult>,
    title: (time: string) => string,
    detail: (result: ApiClockResult) => string,
  ) => {
    setBusy(true);
    try {
      const result = await action();
      toast.push({
        title: title(result.time),
        tone: "success",
        detail: detail(result),
      });
      roster.reload();
      onDone();
    } catch (error) {
      const position = error instanceof PositionError ? error : null;
      const fence = geofenceRefusal(error);
      toast.push({
        title: position?.title ?? fence?.summary ?? "That did not go through",
        tone: "danger",
        detail:
          position?.message ??
          (error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again."),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-body-sm font-semibold text-ink">
          {session.displayName ?? myRow?.employeeName ?? "Your day"}
        </p>
        <p className="mt-0.5 text-body-sm text-muted">
          {myRow?.clockIn
            ? myRow.clockOut
              ? `In at ${myRow.clockIn}, out at ${myRow.clockOut}.`
              : `In at ${myRow.clockIn}.`
            : nothingToClock && myRow
              ? `${STATUS_LABEL[myRow.status]} today: nothing to clock.`
              : "You have not clocked in today."}
        </p>

        {myRow?.clockIn && !myRow.clockOut && (
          <DayTimer
            clockIn={myRow.clockIn}
            serverTime={roster.time}
            policy={policy}
            className="mt-1.5"
          />
        )}

        {!myRow?.clockIn && !nothingToClock && policy && (
          <p className="mt-1.5 flex items-center gap-1.5 text-body-sm font-semibold text-ink">
            <Clock aria-hidden="true" className="size-4 text-accent-text" />
            Expected {policy.shiftStart}–{policy.shiftEnd}
          </p>
        )}
      </div>

      {policy && !policy.selfServiceClockIn ? (
        <p className="text-body-sm text-muted">
          Your HR team records attendance for everybody.
        </p>
      ) : (
        !nothingToClock && (
          <>
            {!myRow?.clockIn && locations.locations.length > 0 && (
              <Field
                label="Where"
                /* Said before the click. Somebody about to see a browser
                   permission prompt should know why it is coming — an
                   unexplained prompt is the one people dismiss, and a
                   dismissal is remembered for the origin. Demo mode gets the
                   other half of the truth: it judges no fence, so promising a
                   prompt would be a promise this mode does not keep. */
                help={
                  !selected?.geofenceEnforced
                    ? undefined
                    : session.isConnected || !DEMO_ENABLED
                      ? `${selected.name} accepts clock-ins on site only, so your browser will ask for your location.`
                      : `${selected.name} has a geofence, and demo mode does not apply it.`
                }
              >
                <Select
                  value={locationId}
                  onChange={(e) => setPicked(e.target.value)}
                >
                  {locations.locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            {!myRow?.clockIn ? (
              <Button
                variant="approve"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => clockIn(selected),
                    (time) => `Clocked in at ${time}`,
                    (result) =>
                      `${result.workLocation?.name ?? selected?.name ?? "Recorded"}. Have a good day.`,
                  )
                }
              >
                <LogIn aria-hidden="true" className="size-4" />
                Clock in
              </Button>
            ) : !myRow.clockOut ? (
              /* Confirmed, where clocking in is not. Clocking out ends the day
                 and the figure feeds payroll proration; clocking in is undone
                 by the fact that you are still here. A confirm on arrival
                 every morning becomes a reflex click, which is a confirm that
                 has stopped confirming anything. */
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => setConfirming(true)}
              >
                <LogOut aria-hidden="true" className="size-4" />
                Clock out
              </Button>
            ) : (
              /* Undoing a clock-out is deliberately not offered here. It is a
                 correction to a finished day rather than part of one, the card
                 on /people/attendance carries it with the explanation of when
                 the API stops allowing it, and a second copy in the chrome
                 would be a third place that rule could drift. */
              <p className="text-body-sm text-muted">
                Day complete.{" "}
                <Link
                  href="/people/attendance"
                  className="underline underline-offset-2 hover:text-ink"
                  onClick={onDone}
                >
                  Open attendance
                </Link>{" "}
                to correct it.
              </p>
            )}
          </>
        )
      )}

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          void run(
            () => clockOut(),
            (time) => `Clocked out at ${time}`,
            () => "Your hours for today are on the timesheet.",
          );
        }}
        title="Clock out?"
        confirmLabel="Clock out"
        tone="primary"
        loading={busy}
        body={
          <span>
            This ends your day at the time the server records, and those hours
            are what the timesheet and any proration read.
            {myRow?.clockIn ? ` You clocked in at ${myRow.clockIn}.` : ""} A
            mis-click can be undone from the attendance screen.
          </span>
        }
      />
    </div>
  );
}
