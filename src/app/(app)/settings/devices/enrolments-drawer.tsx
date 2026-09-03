"use client";

import { useCallback, useMemo, useState } from "react";
import { Plus, UserRound, X } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Drawer,
  DrawerSection,
  EmptyState,
  Field,
  Input,
  Select,
  Spinner,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { ApiError } from "@/lib/api/client";
import type { ApiAttendanceDevice } from "@/lib/api/attendance";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import { useDeviceEnrolments, useDeviceMutations } from "@/lib/store/attendance-devices";

/**
 * Who a terminal's own enrolment numbers mean.
 *
 * ## This is the part people underestimate
 *
 * A terminal knows a person as "user 47". Nothing about that number is ours —
 * whoever installed the machine typed it — and until somebody says who 47 is,
 * every tap it sends is stored attributed to nobody. Which is deliberate: a tap
 * nobody can attribute is still evidence that somebody was at the gate, so it is
 * kept rather than dropped.
 *
 * **Mapping a number goes back for everything it has already sent.** That is the
 * whole point — an installer can put a terminal in on Monday and the mapping can
 * be done on Friday without losing the week — and it is also a change to
 * somebody's attendance that nobody asked for in those words. So the toast says
 * how many taps and how many days it just absorbed, from the API's own count.
 *
 * ## Removing a mapping does not un-attribute the punches
 *
 * `DevicePunch.employeeId` was resolved when the tap arrived and is a record of
 * who we believed was at the gate at the time. Clearing it would rewrite that to
 * match a decision made afterwards, and the attendance entries it produced would
 * have no evidence behind them. The panel says so where somebody would ask.
 *
 * ## Numbers are strings and are never parsed
 *
 * Some terminals write `0047`. Reading that as a number makes it the same person
 * as `47` on a device that thinks they are two, and the taps merge silently. The
 * input is text, it is trimmed, and nothing else happens to it.
 */
export function EnrolmentsDrawer({
  device,
  canManage,
  onClose,
  onChanged,
}: {
  device: ApiAttendanceDevice;
  canManage: boolean;
  onClose: () => void;
  /** So the list behind the drawer can re-read its enrolment count. */
  onChanged: () => void;
}) {
  const toast = useToast();
  const mutations = useDeviceMutations();
  const { employees, loading: loadingPeople } = useEmployeeDirectory({ pageSize: 200 });

  /* Passed into the store so the demo rows can name a person. Connected the
     API resolves the name itself and this is never called — which is why it is
     a lookup rather than a copy of the directory kept in the store. */
  const nameOf = useCallback(
    (employeeId: string) => {
      const person = employees.find((row) => row.id === employeeId);
      return person
        ? {
            name: `${person.firstName} ${person.lastName}`,
            employeeNo: person.employeeNo,
          }
        : null;
    },
    [employees],
  );

  const list = useDeviceEnrolments(device.id, nameOf);

  const [deviceUserId, setDeviceUserId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [busy, setBusy] = useState(false);

  const mapped = useMemo(
    () => new Set(list.enrolments.map((row) => row.employeeId)),
    [list.enrolments],
  );

  const canAdd = deviceUserId.trim() !== "" && employeeId !== "" && !busy;

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      list.reload();
      onChanged();
      toast.push({ title: success, tone: "success" });
      return true;
    } catch (error) {
      toast.push({
        title: "That did not work",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
      return false;
    } finally {
      setBusy(false);
    }
  }

  /**
   * Map the number, and say what it did.
   *
   * Its own try/catch rather than `run` above, because the success message is
   * the API's `note` and `run` writes its own — but the failure half is
   * identical and had to be here: the first version awaited `mutations.map`
   * bare, so a 409 ("that number is already somebody's") became an unhandled
   * rejection and the button did nothing at all, visibly. The one refusal this
   * panel exists to show was the one it swallowed. Nothing in `tsc`, lint or
   * the build can see that; only pressing it can.
   */
  async function add() {
    const person = employees.find((row) => row.id === employeeId);
    setBusy(true);
    try {
      const result = await mutations.map(
        device.id,
        { deviceUserId: deviceUserId.trim(), employeeId },
        person ? `${person.firstName} ${person.lastName}` : undefined,
      );
      /* The API's own sentence, which is the only place the backlog count is
         stated. Paraphrasing it here is how the two stop agreeing. */
      toast.push({ title: "Mapped", tone: "success", detail: result.note });
      setDeviceUserId("");
      setEmployeeId("");
      list.reload();
      onChanged();
    } catch (error) {
      toast.push({
        title: "That did not work",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      size="md"
      title={`Who ${device.label} knows`}
      description="A terminal knows people by its own enrolment numbers. This is where those become names."
    >
      <div className="flex flex-col gap-6">
        <LoadFailure
          subject="this terminal's enrolments"
          error={list.error}
          onRetry={list.reload}
        />

        {device.unmappedPunches !== null && device.unmappedPunches > 0 && (
          <Callout tone="warning" title="Taps nobody is mapped to">
            {device.unmappedPunches === 1
              ? "One tap has arrived from a number nothing here recognises."
              : `${device.unmappedPunches} taps have arrived from numbers nothing here recognises.`}{" "}
            They are stored, not lost. Map the number below and every one of them
            is attributed and every day it touches is worked out again.
          </Callout>
        )}

        {canManage && (
          <DrawerSection title="Map a number">
            <div className="flex flex-col gap-4">
              <Field
                label="Enrolment number"
                required
                help="Exactly as the terminal shows it. Keep any leading zeros — 0047 and 47 are two different people to a machine that uses both."
              >
                <Input
                  value={deviceUserId}
                  placeholder="0047"
                  onChange={(e) => {
                    const value = e.target.value;
                    setDeviceUserId(value);
                  }}
                />
              </Field>

              <Field label="Who that is" required>
                <Select
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                >
                  <option value="">
                    {loadingPeople ? "Loading people…" : "Choose somebody"}
                  </option>
                  {employees.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.firstName} {person.lastName} · {person.jobTitle}
                      {mapped.has(person.id) ? " · already on this device" : ""}
                    </option>
                  ))}
                </Select>
              </Field>

              <div>
                <Button
                  variant="accent"
                  size="sm"
                  disabled={!canAdd}
                  loading={busy}
                  onClick={() => void add()}
                >
                  <Plus aria-hidden="true" className="size-4" />
                  Map it
                </Button>
              </div>

              <p className="text-body-sm text-muted">
                Mapping a number also claims everything it has already sent, so a
                terminal can go in weeks before anybody sits down to do this.
              </p>
            </div>
          </DrawerSection>
        )}

        <DrawerSection title={`Mapped (${String(list.enrolments.length)})`}>
          {list.loading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : list.enrolments.length === 0 ? (
            <EmptyState
              icon={<UserRound aria-hidden="true" />}
              title="Nobody is mapped yet"
              description="Until a number is mapped, taps from it are recorded against nobody and reach no timesheet. Nothing is lost — they are claimed the moment you map the number."
            />
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {list.enrolments.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-body-sm font-medium text-ink">
                        {row.employeeName}
                      </span>
                      <Badge tone="neutral" size="sm">
                        User {row.deviceUserId}
                      </Badge>
                    </span>
                    <span className="text-meta text-muted">{row.employeeNo}</span>
                  </span>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => mutations.unmap(device.id, row.id),
                          `User ${row.deviceUserId} is no longer mapped`,
                        )
                      }
                    >
                      <X aria-hidden="true" className="size-3.5" />
                      Take off
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DrawerSection>

        <DrawerSection title="What removing one does">
          <p className="text-body-sm text-body">
            Taps already collected keep the person they were attributed to. That
            is deliberate: we recorded who we believed was at the gate at the
            time, and rewriting it to match a decision made afterwards would
            leave their attendance with no evidence behind it. New taps from that
            number have nobody until it is mapped again.
          </p>
        </DrawerSection>
      </div>
    </Drawer>
  );
}
