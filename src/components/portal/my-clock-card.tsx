"use client";

import { useState } from "react";
import { Clock, LogIn, LogOut, Undo2 } from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  Field,
  Select,
  useToast,
  ButtonLink,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { geofenceRefusal, type ApiClockResult } from "@/lib/api/attendance";
import { PositionError } from "@/lib/geolocation";
import {
  defaultClockLocationId,
  STATUS_LABEL,
  useAttendanceMutations,
  useAttendanceRoster,
  useLastClockLocation,
  useWorkLocations,
} from "@/lib/store/attendance";
import { useCan } from "@/lib/permissions";
import { useSession } from "@/lib/store/session";
import { DayTimer } from "@/app/(app)/people/attendance/day-timer";

/**
 * Somebody's own clock-in, extracted so `/dashboard` and `/people/attendance`
 * share one implementation rather than two that can disagree about what
 * "clocked in" means.
 *
 * It takes no "and now refresh that too" callback, and deliberately does not
 * refresh anything itself. It used to do both: an `onRecorded` prop that
 * `/people/attendance` used to reload its timesheet, on top of this card
 * reloading its own roster. `announceClock()` inside the mutation replaced all
 * of it — a call site cannot forget a panel it has never heard of — and the
 * leftovers were not merely redundant, they were aborting the request the
 * announcement had started. See the note in `run` below.
 */
export function MyClockCard() {
  const roster = useAttendanceRoster();
  const locations = useWorkLocations();
  const { clockIn, clockOut, undoClockOut } = useAttendanceMutations();
  const session = useSession();
  const toast = useToast();
  /* Creating an employee is `EDIT_RECORDS` on `POST /employees`. Read here so
     the card offers the fix only to somebody the API would let perform it. */
  const canAddPeople = useCan("EDIT_RECORDS");

  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const policy = roster.policy;

  /* Attributing an action to a person needs an employee id, and the id in the
     session is an *account* id when connected. `employeeId` is the one that
     matches a roster row; `displayName` is the one to print. */
  const myRow = roster.rows.find(
    (row) => row.employeeId === session.employeeId,
  );

  /* Still derived rather than stored, so a location arriving late becomes the
     default without a setState in an effect. The ids differ between the two
     modes — uuids from the API, `loc-hq` from the seed — so nothing may
     hardcode one, and the remembered id is checked against the live list
     rather than trusted. `defaultClockLocationId` is shared with `ClockMenu`:
     two copies of "which one is preselected" is how the navbar and this card
     come to disagree about where somebody is about to clock in. */
  const remembered = useLastClockLocation();
  const locationId = defaultClockLocationId(
    locations.locations,
    remembered,
    picked,
  );
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
      /* Nothing is reloaded here on purpose.
         -----------------------------------
         `announceClock()` inside the mutation has already invalidated every
         attendance read in the app, and it does it the way the bus documents:
         by bumping a generation that sits in each fetch effect's *dependency
         list* and not in the key those hooks compare during render.

         A `reload()` here bumps the key instead, and that is actively worse
         than doing nothing. It re-runs the effect, whose cleanup **aborts the
         request the announcement just started**; and because the displayed
         data no longer matches the new key, the panel treats what is on screen
         as stale. So the answer that was already in flight got thrown away and
         the table sat on the old row until a second round trip finished.

         Measured on this screen before the calls came out: the clock-out POST
         answered at 101ms, six reads fired at ~400ms, all six landed by 650ms
         — and the table did not change until **937ms**, because it was waiting
         on a second burst the reload had forced. Five roster GETs went out for
         one clock-out. */
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

  /**
   * An account with no employee record cannot clock in, and saying so here is
   * two clicks earlier than the API does.
   *
   * **Registering a company creates a `User`, not an `Employee`** — so the
   * person this happens to is usually the owner, on day one, in every new
   * company. **Usually, not always**, and that assumption is what this used to
   * get wrong: it told every such account it was "signed in to run this
   * company", which is plainly false for a plain employee whose account was
   * never linked to a staff record, and offered them a button to
   * `/people/new` that `EDIT_RECORDS` gates and the API refuses. A control
   * whose only outcome is a refusal is worse than no control. Which sentence
   * they get is decided by that permission now, not assumed.
   * The card used to render in full, with their name, their expected hours and
   * an enabled button, and answer `403 · This account has no employee record
   * to clock in.` on press. That refusal is correct and well written and it
   * arrives far too late.
   *
   * The card **states the fact rather than disappearing**. Somebody who has
   * been told there is a clock-in button needs to find out why theirs is not
   * there; a card that silently vanishes sends them looking for a bug. The
   * roster beside it already knew — it counted the employees and did not list
   * this person.
   */
  if (!session.employeeId) {
    return (
      <Card>
        <CardBody className="flex flex-wrap items-center gap-4">
          <Avatar name={session.displayName ?? "You"} size="md" />
          <div className="min-w-0 flex-1">
            <p className="text-body font-semibold">
              {session.displayName ?? "Your day"}
            </p>
            <p className="mt-0.5 text-body-sm text-muted">
              {canAddPeople
                ? "You are signed in to run this company, not as somebody on its payroll, so there is nothing here to clock. Add yourself as an employee and this becomes your own day."
                : "This account is not linked to an employee record, so there is nothing here to clock. Whoever looks after your people records can link it."}
            </p>
          </div>
          {canAddPeople && (
            <ButtonLink href="/people/new" variant="secondary" size="sm">
              Add yourself as an employee
            </ButtonLink>
          )}
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      {/* Three zones — who you are, when you are expected, what you press —
          laid out as a column that becomes a row at `lg`.

          It was a single `flex-wrap` row at every width, which is what made
          this card the worst-looking thing on the dashboard. Wrapping decides
          the break points by arithmetic on content widths, so the three zones
          broke in whatever order they happened to overflow in: at the half
          width the widget used to have, the name column was squeezed to about
          200px and "Expected 08:00–17:00 · 15 min grace" came apart across
          three lines while the location picker sat beside it. A column that
          becomes a row breaks where somebody decided it should.

          `items-start` rather than `items-center` in the stacked direction:
          centring a two-line status against a one-line action puts the button
          halfway up the card. */}
      <CardBody className="flex flex-col items-start gap-5 lg:flex-row lg:items-center lg:gap-6">
        <div className="flex min-w-0 w-full items-start gap-4 lg:w-auto lg:flex-1">
          <Avatar
            name={session.displayName ?? myRow?.employeeName ?? "You"}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <p className="text-body-lg font-semibold text-ink">
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

            {/* Bold and ahead of the click, not a caption after it: the
              question this answers is "what time do I need to be here",
              and that only matters before somebody has clocked in. Once
              `myRow.clockIn` exists the actual time already answers it, and
              showing both would leave two clocks on the card disagreeing
              about which one is real. Absent, not a guessed 08:00–17:00,
              when the policy has not loaded yet. */}
            {!myRow?.clockIn && !nothingToClock && policy && (
              /* A chip, and every part of it `whitespace-nowrap`.
               ----------------------------------------------------
               The old markup was a flex row whose *text node* was one flex
               item and whose grace note was another, so a narrow column broke
               it between "Expected" and the hours and then orphaned "· 15 min
               grace" in a column of its own. Two nowrap spans wrap as whole
               phrases or not at all, and the times can no longer be split from
               the word that says what they are.

               The separator went with it: a leading "·" at the start of a
               wrapped line is punctuation pointing at nothing, and the chip
               already groups the two. */
              <p className="mt-2 inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg bg-sunken px-2.5 py-1.5">
                <Clock
                  aria-hidden="true"
                  className="size-4 shrink-0 text-accent-text"
                />
                <span className="font-semibold whitespace-nowrap text-ink">
                  Expected {policy.shiftStart}–{policy.shiftEnd}
                </span>
                {policy.graceMinutes > 0 && (
                  <span className="text-body-sm whitespace-nowrap text-muted">
                    {policy.graceMinutes} min grace
                  </span>
                )}
              </p>
            )}

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
        </div>

        {policy && !policy.selfServiceClockIn ? (
          <p className="text-body-sm text-muted">
            Your HR team records attendance for everybody.
          </p>
        ) : (
          !nothingToClock && (
            /* Full width while stacked so the control and the button are not
               a lonely pair under a wide card, and its natural width once it
               sits beside the identity zone. */
            <div className="flex w-full flex-wrap items-end gap-3 lg:w-auto lg:shrink-0 lg:justify-end">
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
                        : `${selected.name} has a geofence, and demo mode does not apply it: nothing here asks where you are.`
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
