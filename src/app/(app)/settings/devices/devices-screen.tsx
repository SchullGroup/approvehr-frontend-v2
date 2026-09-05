"use client";

import { useState } from "react";
import {
  Cpu,
  KeyRound,
  Plus,
  Power,
  RotateCcw,
  Users,
} from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  Spinner,
  Stat,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import type {
  ApiAttendanceDevice,
  ApiDeviceSecret,
  ApiWorkLocation,
} from "@/lib/api/attendance";
import { usePermissions } from "@/lib/permissions";
import {
  useAttendanceDevices,
  useDeviceMutations,
} from "@/lib/store/attendance-devices";
import { useWorkLocationList } from "@/lib/store/work-locations";
import { DeviceForm, type DeviceDraft } from "./device-form";
import { EnrolmentsDrawer } from "./enrolments-drawer";
import { SecretPanel } from "./secret-panel";

/**
 * Biometric terminals — the machines on the wall that clock people in.
 *
 * ## Why this screen had to exist
 *
 * The whole ingestion contract shipped without one: the registry, the signing
 * secret and the enrolment mapping were reachable only over the API, so a
 * company that bought a terminal had no way to tell us it existed. That is the
 * fifth time in this codebase — the company logo, the assistant, the manual tax
 * override and `Payslip.emailedAt` were the others — and the rule it keeps
 * proving is that **a thing you cannot find is a thing you do not have.**
 *
 * ## What a terminal is *for*, and why it is not a nicer clock-in button
 *
 * `attendance/geofence.ts` argues against its own sufficiency: a browser's
 * position "is not proof of presence. Presence needs something the employee does
 * not control." A device is that. Which is also why a punch supersedes somebody's
 * own clock-in — and why it never supersedes a correction a person signed their
 * name to. Both facts are on this screen, because the second one is the surprise.
 *
 * ## Three states, kept apart on the row
 *
 * - **Never seen.** Registered and nothing has arrived. Rendered as "Nothing
 *   yet", never as a date.
 * - **Not accepting.** `active` off — a unit away for repair. Deliveries are
 *   refused and the agent is told so.
 * - **Switched off.** Archived. Also refused, and this is the deliberate one:
 *   it is what somebody does about a stolen terminal, and it erases nothing the
 *   device reported while it was trusted.
 *
 * ## Absent is absent, twice
 *
 * `secret` is null in demo mode — no fabricated credential — and
 * `unmappedPunches` is null there too, because no tap can reach a browser. Both
 * render as an em-dash with the reason stated once in the callout, never as a
 * confident zero.
 */

/**
 * Where a terminal stands.
 *
 * `workLocationName` is resolved by the API and is **null offline**, where
 * nothing joins an id to a name — so this falls back to the location list the
 * screen already holds for the form's picker. Without it a device registered at
 * Lagos HQ rendered "Not set", which is not a blank: it is a wrong claim about a
 * choice somebody made, and it reads as the form having dropped it.
 *
 * The remaining gap is an office that has been switched off, which the list
 * excludes. Said out loud rather than falling through to "Not set", because an
 * archived office is a real state with a real fix and "nothing is set" is not
 * what happened.
 */
function DeviceOffice({
  row,
  locations,
}: {
  row: ApiAttendanceDevice;
  locations: ApiWorkLocation[];
}) {
  if (row.workLocationId === null) {
    return <span className="text-body-sm text-muted">Not set</span>;
  }
  const name =
    row.workLocationName ??
    locations.find((location) => location.id === row.workLocationId)?.name ??
    null;
  return name === null ? (
    <span className="text-body-sm text-muted">An office that is switched off</span>
  ) : (
    <span className="text-body-sm text-body">{name}</span>
  );
}

const seenAt = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export function DevicesScreen() {
  const { can, loading: permissionsLoading } = usePermissions();
  const [showArchived, setShowArchived] = useState(false);
  const list = useAttendanceDevices(showArchived);
  const locations = useWorkLocationList(false);
  const mutations = useDeviceMutations();
  const toast = useToast();

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ApiAttendanceDevice | null>(null);
  const [archiving, setArchiving] = useState<ApiAttendanceDevice | null>(null);
  const [rotating, setRotating] = useState<ApiAttendanceDevice | null>(null);
  const [enrolling, setEnrolling] = useState<ApiAttendanceDevice | null>(null);
  const [secret, setSecret] = useState<{
    result: ApiDeviceSecret;
    rotated: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  if (permissionsLoading) {
    return (
      <PageBody className="flex items-center justify-center py-24">
        <Spinner />
      </PageBody>
    );
  }

  const canManage = can("MANAGE_SETTINGS");

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      list.reload();
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

  const live = list.devices.filter((row) => row.archivedAt === null);
  const listening = live.filter((row) => row.active);
  const unmapped = live.reduce((total, row) => total + (row.unmappedPunches ?? 0), 0);
  /* Whether the figure is knowable is a property of the source, not of whether
     any row happens to carry one. Read off the rows, a company with no terminal
     registered yet answered `false` — so a connected screen told somebody a tap
     "needs a server" while it was talking to one. The two stats beside this one
     both special-case an empty list rather than letting it fall through; this
     one did not. */
  const unmappedKnown = list.source === "api";
  /* Over every registered terminal, not only the ones currently accepting.
     Counted over `listening` this read "Every terminal has delivered at least
     once" while the only terminal in the company had delivered nothing — it had
     merely been switched to not-accepting, which took it out of the numerator
     and left the sentence false. "Registered and nothing has arrived" is true of
     a paused unit too. */
  const neverSeen = live.filter((row) => row.lastSeenAt === null);

  return (
    <>
      <PageHeader
        title="Biometric terminals"
        breadcrumb={[{ href: "/settings", label: "Settings" }]}
        action={
          canManage ? (
            <Button variant="accent" onClick={() => setAdding(true)}>
              <Plus aria-hidden="true" className="size-4" />
              Register a terminal
            </Button>
          ) : undefined
        }
      />

      <PageBody className="flex flex-col gap-6">
        <LoadFailure
          subject="your terminals"
          error={list.error}
          onRetry={list.reload}
        />

        {/* The honest gap, stated rather than left to be discovered by
            registering a device and waiting for a tap that cannot come. */}
        {DEMO_ENABLED && list.source === "demo" && (
          <Callout tone="warning" title="Demo terminals, this browser only">
            Registering, naming and mapping enrolment numbers all work and
            persist in this browser. Two things do not.{" "}
            <strong>No tap can arrive</strong>, because the thing that delivers
            one is an endpoint on the server — so nothing here reaches a
            timesheet. And <strong>no signing secret is issued</strong>: one made
            up in a browser would look exactly like a real credential and would
            sign deliveries nothing would accept.
          </Callout>
        )}

        {!canManage && (
          <Callout tone="info" title="You can see these, not change them">
            Registering a machine that may write attendance is the same kind of
            decision as drawing the fence people clock in inside, so it needs the
            settings permission. Ask whoever manages settings.
          </Callout>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Stat
            label="Terminals"
            value={list.loading ? "—" : String(live.length)}
            /* "All of them are accepting deliveries" over a count of zero is a
               vacuous truth reading as a reassurance. Same family as the "1
               people" and "9 of 10 payslips" defects — a sentence under a
               number has to be true of the number. */
            hint={
              live.length === 0
                ? "None registered yet."
                : listening.length === live.length
                  ? "All of them are accepting deliveries."
                  : `${live.length - listening.length} of them ${live.length - listening.length === 1 ? "is" : "are"} not accepting deliveries.`
            }
          />
          <Stat
            label="Nothing yet"
            value={list.loading ? "—" : String(neverSeen.length)}
            hint={
              live.length === 0
                ? "Nothing to wait on yet."
                : neverSeen.length === 0
                  ? "Every terminal has delivered at least once."
                  : "Registered, and nothing has arrived. Usually the agent has not been given the secret yet."
            }
          />
          <Stat
            label="Taps nobody is mapped to"
            /* Absent, not zero: no tap can reach a browser, so a confident 0
               would read as "everybody is mapped". */
            value={list.loading || !unmappedKnown ? "—" : String(unmapped)}
            hint={
              !unmappedKnown
                  /* True wherever it renders, rather than a sentence naming a
                     mode — `verify-demo` only checks this file mentions
                     DEMO_ENABLED somewhere, so the guard is the wording. */
                ? "A tap is delivered over the network, so this needs a server."
                : live.length === 0
                  ? "Nothing to map yet: no terminal has been registered."
                  : unmapped === 0
                    /* Not "every tap has somebody's name on it": over a terminal
                       that has never delivered that is a vacuous truth reading as
                       a reassurance, which is the defect the first stat's comment
                       describes. State the nought. */
                    ? "Nothing is waiting to be identified."
                    : "Stored and waiting for somebody to say whose they are. Nothing is lost."
            }
          />
        </div>

        <Card>
          <CardHeader
            className="flex-wrap"
            level={2}
            title="Registered terminals"
            description="Each machine signs its deliveries with its own secret, so an unregistered box cannot write anybody's attendance."
            action={
              <Checkbox
                label="Show switched-off terminals"
                checked={showArchived}
                onChange={(e) => {
                  const next = e.target.checked;
                  setShowArchived(next);
                }}
              />
            }
          />

          {list.loading ? (
            <CardBody className="flex justify-center py-10">
              <Spinner />
            </CardBody>
          ) : list.devices.length === 0 ? (
            <EmptyState
              icon={<Cpu aria-hidden="true" />}
              title="No terminals registered"
              description="A clock-in from a browser is somebody saying where they are. A terminal on the wall is something they do not control, which is the only kind of attendance a dispute can be settled on."
              action={
                canManage ? (
                  <Button variant="accent" onClick={() => setAdding(true)}>
                    <Plus aria-hidden="true" className="size-4" />
                    Register a terminal
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <TableWrap
              className="rounded-none border-0"
              caption="Registered biometric terminals, with what each one has delivered"
            >
              <THead>
                <TH>Terminal</TH>
                <TH>Where</TH>
                <TH>Last delivery</TH>
                <TH align="right">Mapped</TH>
                <TH align="right">Unattributed</TH>
                {canManage && (
                  <TH align="right">
                    <span className="sr-only">Actions</span>
                  </TH>
                )}
              </THead>
              <TBody>
                {list.devices.map((row) => {
                  const off = row.archivedAt !== null;
                  return (
                    <TR key={row.id}>
                      <TDPrimary
                        title={
                          <span className="flex flex-wrap items-center gap-2">
                            {row.label}
                            {off && (
                              <Badge tone="neutral" size="sm">
                                Switched off
                              </Badge>
                            )}
                            {!off && !row.active && (
                              <Badge tone="warning" size="sm">
                                Not accepting
                              </Badge>
                            )}
                          </span>
                        }
                        subtitle={row.serialNumber}
                      />
                      <TD>
                        <DeviceOffice row={row} locations={locations.locations} />
                      </TD>
                      <TD>
                        {row.lastSeenAt === null ? (
                          /* Absent, not a date. */
                          <span className="text-body-sm text-muted">
                            Nothing yet
                          </span>
                        ) : (
                          <span className="tabular text-body-sm text-ink">
                            {seenAt(row.lastSeenAt)}
                          </span>
                        )}
                      </TD>
                      <TD align="right">
                        <span className="tabular text-body-sm text-ink">
                          {row.enrolments}
                        </span>
                      </TD>
                      <TD align="right">
                        {row.unmappedPunches === null ? (
                          <span className="text-body-sm text-muted">—</span>
                        ) : row.unmappedPunches === 0 ? (
                          <span className="tabular text-body-sm text-muted">0</span>
                        ) : (
                          <Badge tone="warning" size="sm">
                            {row.unmappedPunches}
                          </Badge>
                        )}
                      </TD>
                      {canManage && (
                        <TD align="right">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {off ? (
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                  void run(
                                    () => mutations.restore(row.id),
                                    `${row.label} is back on`,
                                  )
                                }
                              >
                                <RotateCcw aria-hidden="true" className="size-3.5" />
                                Turn back on
                              </Button>
                            ) : (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setEnrolling(row)}
                                >
                                  <Users aria-hidden="true" className="size-3.5" />
                                  Who it knows
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setEditing(row)}
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setRotating(row)}
                                >
                                  <KeyRound aria-hidden="true" className="size-3.5" />
                                  New secret
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setArchiving(row)}
                                >
                                  <Power aria-hidden="true" className="size-3.5" />
                                  Switch off
                                </Button>
                              </>
                            )}
                          </div>
                        </TD>
                      )}
                    </TR>
                  );
                })}
              </TBody>
            </TableWrap>
          )}
        </Card>

        <Card>
          <CardHeader
            level={2}
            title="How a tap becomes a working day"
            description="Worth reading once, because two of these surprise people."
          />
          <CardBody className="flex flex-col gap-2.5 text-body-sm text-body">
            <p>
              <strong className="text-ink">Every tap is kept, then read.</strong>{" "}
              Taps are recorded exactly as they arrive, and a separate pass
              decides what the day meant — first tap in, last tap out. A single
              tap is an open shift, never a zero-length day.
            </p>
            <p>
              <strong className="text-ink">
                A tap beats somebody&rsquo;s own clock-in.
              </strong>{" "}
              That is what the machine is for: a clock-in from a browser is
              somebody saying where they are, and a terminal is not.
            </p>
            <p>
              <strong className="text-ink">
                It never beats a correction somebody made.
              </strong>{" "}
              A correction carries a note and a name, and payroll pays against
              it. A late tap is recorded with its reason and the day is left
              alone, rather than a decision being quietly undone.
            </p>
            <p>
              <strong className="text-ink">Late taps are normal.</strong> A
              terminal that loses its network keeps its own record and delivers
              the lot when it comes back — a fortnight arrives in one go and
              lands on the right days. Sending the same taps twice changes
              nothing, which is what makes an unreliable link safe.
            </p>
            <p className="text-muted">
              Where a tap counts as having happened comes from the terminal,
              which is why the office matters — set it in{" "}
              <ButtonLink href="/settings/locations" variant="ghost" size="sm">
                work locations
              </ButtonLink>{" "}
              first, then choose it here.
            </p>
          </CardBody>
        </Card>
      </PageBody>

      {adding && (
        <DeviceForm
          locations={locations.locations}
          onClose={() => setAdding(false)}
          onSave={async (draft: DeviceDraft) => {
            setBusy(true);
            try {
              const result = await mutations.register({
                serialNumber: draft.serialNumber,
                label: draft.label,
                ...(draft.workLocationId === null
                  ? {}
                  : { workLocationId: draft.workLocationId }),
              });
              list.reload();
              setAdding(false);
              /* Straight into the secret panel rather than a toast: this is the
                 only time the plaintext exists anywhere a person can read it. */
              setSecret({ result, rotated: false });
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
          }}
        />
      )}

      {editing && (
        <DeviceForm
          device={editing}
          locations={locations.locations}
          onClose={() => setEditing(null)}
          onSave={async (draft: DeviceDraft) => {
            const ok = await run(
              () =>
                mutations.update(editing.id, {
                  label: draft.label,
                  workLocationId: draft.workLocationId,
                  active: draft.active,
                }),
              `${draft.label} saved`,
            );
            if (ok) setEditing(null);
          }}
        />
      )}

      {enrolling && (
        <EnrolmentsDrawer
          device={enrolling}
          canManage={canManage}
          onClose={() => setEnrolling(null)}
          onChanged={list.reload}
        />
      )}

      {secret && (
        <SecretPanel
          result={secret.result}
          rotated={secret.rotated}
          onClose={() => setSecret(null)}
        />
      )}

      <ConfirmDialog
        open={rotating !== null}
        onClose={() => setRotating(null)}
        loading={busy}
        tone="danger"
        title={`Issue a new secret for ${rotating?.label ?? "this terminal"}?`}
        confirmLabel="Issue a new one"
        onConfirm={async () => {
          if (!rotating) return;
          setBusy(true);
          try {
            const result = await mutations.rotateSecret(rotating.id);
            list.reload();
            setRotating(null);
            setSecret({ result, rotated: true });
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
        }}
        body={
          <span className="flex flex-col gap-2.5">
            <span>
              The current secret stops working immediately — there is no grace
              period, because a rotation is what you do when one has leaked.
            </span>
            <span>
              Until you update the agent on site, its deliveries are refused.
              Nothing is lost: it keeps its own record and everything it buffers
              meanwhile arrives once the new secret is in.
            </span>
            <span>The new one is shown once, on the next screen.</span>
          </span>
        }
      />

      <ConfirmDialog
        open={archiving !== null}
        onClose={() => setArchiving(null)}
        loading={busy}
        tone="danger"
        title={`Switch off ${archiving?.label ?? "this terminal"}?`}
        confirmLabel="Switch it off"
        onConfirm={async () => {
          if (!archiving) return;
          const ok = await run(
            () => mutations.archive(archiving.id),
            `${archiving.label} switched off`,
          );
          if (ok) setArchiving(null);
        }}
        body={
          <span className="flex flex-col gap-2.5">
            <span>
              Deliveries from it are refused from now on, and the agent is told
              why rather than left retrying. This is what to do about a terminal
              that has been stolen.
            </span>
            <span>
              Nothing is deleted. Every tap it has already sent stays on file,
              and the attendance those taps produced keeps reading correctly —
              which matters, because a payslip was prorated against it.
            </span>
            <span>You can turn it back on at any time.</span>
          </span>
        }
      />
    </>
  );
}
