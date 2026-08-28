"use client";

import { useState } from "react";
import { LogIn, LogOut, Undo2 } from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  Field,
  Select,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import {
  geofenceRefusal,
  type ApiClockResult,
} from "@/lib/api/attendance";
import { PositionError } from "@/lib/geolocation";
import {
  STATUS_LABEL,
  useAttendanceMutations,
  useAttendanceRoster,
  useWorkLocations,
} from "@/lib/store/attendance";
import { useSession } from "@/lib/store/session";
import { DayTimer } from "@/app/(app)/people/attendance/day-timer";

/**
 * Somebody's own clock-in, extracted so `/dashboard` and `/people/attendance`
 * share one implementation rather than two that can disagree about what
 * "clocked in" means.
 *
 * `onRecorded` is for a page that also holds its own copy of related data —
 * `/people/attendance` reloads its 15-day timesheet on top of this card's own
 * roster reload, because a clock event this card causes should be reflected
 * there too. The dashboard has nothing else to refresh, so it passes nothing.
 */
export function MyClockCard({
  onRecorded,
}: { onRecorded?: () => void } = {}) {
  const roster = useAttendanceRoster();
  const locations = useWorkLocations();
  const { clockIn, clockOut, undoClockOut } = useAttendanceMutations();
  const session = useSession();
  const toast = useToast();

  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const policy = roster.policy;

  /* Attributing an action to a person needs an employee id, and the id in the
     session is an *account* id when connected. `employeeId` is the one that
     matches a roster row; `displayName` is the one to print. */
  const myRow = roster.rows.find(
    (row) => row.employeeId === session.employeeId,
  );

  /* Derived rather than stored, so the first location to arrive becomes the
     default without a setState in an effect. The ids differ between the two
     modes — uuids from the API, `loc-hq` from the seed — so nothing may
     hardcode one. */
  const locationId = picked ?? locations.locations[0]?.id ?? "";
  /* The row, not the id: `clockIn` needs to know whether this location's fence
     is enforced before it decides to ask the browser where the device is. */
  const selected = locations.locations.find((l) => l.id === locationId) ?? null;

  const nothingToClock =
    myRow?.status === "ON_LEAVE" ||
    myRow?.status === "HOLIDAY" ||
    myRow?.status === "REST_DAY";

  /**
   * Both clock actions, and every way they can be turned down.
   *
   * Three sources of refusal reach here and they are not interchangeable:
   *
   * 1. **The browser** — a `PositionError`, when the device would not say where
   *    it is. Permission denied, position unavailable and timeout are three
   *    different problems with three different next steps, and it carries which
   *    one along with the wording for it. No request was made, so there is no
   *    API message to fall back on.
   * 2. **The geofence** — a 422 carrying the distance, the location and the
   *    radius. `summary` is the API's own one-line phrasing of the fact — "You
   *    are 340m from Lagos HQ" — and it is the heading, with the full message
   *    and its way forward underneath. This card formats no distances: doing
   *    so would be a second distance formatter drifting from the API's.
   * 3. **Everything else** — an ordinary `ApiError`, whose message already names
   *    the time and the fix ("Already clocked in at 08:12…").
   *
   * "Clock-in failed" is the one thing none of them is allowed to become.
   */
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
      onRecorded?.();
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
    <Card>
      <CardBody className="flex flex-wrap items-center gap-4">
        <Avatar
          name={session.displayName ?? myRow?.employeeName ?? "You"}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <p className="text-body font-semibold">
            {session.displayName ?? myRow?.employeeName ?? "Your day"}
          </p>
          <p className="mt-0.5 text-body-sm text-muted">
            {myRow?.clockIn
              ? myRow.clockOut
                ? `In at ${myRow.clockIn}, out at ${myRow.clockOut}.`
                : `In at ${myRow.clockIn}.`
              : nothingToClock && myRow
                ? `${STATUS_LABEL[myRow.status]} today — nothing to clock.`
                : "You have not clocked in today."}
          </p>

          {/* Only while the clock is running.
              ----------------------------------
              The reported problem was that clocking in "looked like nothing
              happened" — a static "Still clocked in" is a state, and a
              number that moves is proof the press registered. That sentence
              is now redundant and has gone; this replaces it.

              Absent once clocked out, because a finished day is a stored
              fact and a ticking readout of it would imply otherwise. The
              totals below are the record. */}
          {myRow?.clockIn && !myRow.clockOut && (
            <DayTimer
              clockIn={myRow.clockIn}
              serverTime={roster.time}
              policy={policy}
              className="mt-1.5"
            />
          )}
        </div>

        {policy && !policy.selfServiceClockIn ? (
          <p className="text-body-sm text-muted">
            Your HR team records attendance for everybody.
          </p>
        ) : (
          !nothingToClock && (
            <div className="flex flex-wrap items-end gap-2">
              {!myRow?.clockIn && locations.locations.length > 0 && (
                <Field
                  label="Where"
                  /* Said before the click, not after it. Somebody about to
                     see a browser permission prompt should know why it is
                     coming — an unexplained prompt is the one people
                     dismiss, and a dismissal is remembered for the origin.
                     Nothing is said for a location with no enforced fence,
                     because nothing will be asked.

                     Demo mode gets the other half of the truth, not this
                     one. It asks for no position and judges no fence, so
                     promising a prompt here would be a promise this mode
                     does not keep — the same gap `store/work-locations.ts`
                     states on the settings screen. */
                  help={
                    !selected?.geofenceEnforced
                      ? undefined
                      : session.isConnected || !DEMO_ENABLED
                        ? `${selected.name} accepts clock-ins on site only, so your browser will ask for your location.`
                        : `${selected.name} has a geofence, and demo mode does not apply it — nothing here asks where you are.`
                  }
                >
                  <Select
                    value={locationId}
                    onChange={(e) => {
                      const next = e.target.value;
                      setPicked(next);
                    }}
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
                      /* The API's resolved name when connected — it may
                         have fallen back to the location on the employee's
                         own record — and the picked one otherwise. */
                      (result) =>
                        `${result.workLocation?.name ?? selected?.name ?? "Recorded"}. Have a good day.`,
                    )
                  }
                >
                  <LogIn aria-hidden="true" className="size-4" />
                  Clock in
                </Button>
              ) : !myRow.clockOut ? (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => clockOut(),
                      (time) => `Clocked out at ${time}`,
                      () => "Your hours for today are on the timesheet.",
                    )
                  }
                >
                  <LogOut aria-hidden="true" className="size-4" />
                  Clock out
                </Button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="success" size="sm" dot>
                    Day complete
                  </Badge>
                  {/* A mis-click is the common case and used to need a
                      ticket: reversing a clock-out was an HR correction, so
                      the one person who knew exactly what happened was the
                      one who could not act.

                      Offered always rather than only inside the window —
                      the window is the server's rule, and a second copy
                      here would drift from it. Past it the API refuses and
                      names the correction as the way through, which is a
                      better answer than a button that has quietly
                      disappeared. */}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        /* `run` is shaped for a clock action and returns
                           the resulting entry; the undo returns the same
                           three fields with `clockIn` where `time` sits, so
                           it is mapped rather than given its own runner. */
                        () =>
                          undoClockOut().then((result) => ({
                            employeeId: result.employeeId,
                            date: result.date,
                            time: result.clockIn ?? "",
                          })),
                        () => "Clock-out reversed",
                        () => "You are on the clock again.",
                      )
                    }
                  >
                    <Undo2 aria-hidden="true" className="size-3.5" />
                    Undo
                  </Button>
                </div>
              )}
            </div>
          )
        )}
      </CardBody>
    </Card>
  );
}
