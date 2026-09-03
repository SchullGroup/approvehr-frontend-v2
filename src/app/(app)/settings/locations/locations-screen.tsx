"use client";

import { useState } from "react";
import { Building2, MapPin, Plus, Power, RotateCcw } from "lucide-react";
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
import { GEOFENCE_EXPLANATION, type ApiWorkLocation } from "@/lib/api/attendance";
import { usePermissions } from "@/lib/permissions";
import {
  useWorkLocationList,
  useWorkLocationMutations,
} from "@/lib/store/work-locations";
import { LocationForm, type LocationDraft } from "./location-form";

/**
 * Work locations — every place people clock in at, and the fence around each.
 *
 * ## Why this screen had to exist
 *
 * `WorkLocation` has been in the schema since the first migration, `POST` and
 * `DELETE` were added later, and **nothing rendered any of it.** A company was
 * stuck with whatever the seed produced: it could not add its second branch, it
 * could not say where that branch is, and it could not draw a fence. Every
 * employee record and every timesheet points at this table, so the gap was not
 * cosmetic — a five-branch company had one place to be.
 *
 * ## The geofence is a per-location decision, not a company one
 *
 * Deliberately. A head office where everybody badges in and a site crew who
 * clock in from a gate two hundred metres away do not want the same rule, and a
 * company-wide radius would be set to whichever site is loosest. Five branches
 * therefore get five fences, or none, in any mixture.
 *
 * Two states are easy to conflate and are kept apart on the row:
 *
 * - **No fence.** The common case. Nothing is checked; a clock-in from anywhere
 *   is accepted. Rendered as "Not checked", never as a radius of zero — zero
 *   metres is a fence nobody on earth could stand inside.
 * - **A fence that is not applied.** Coordinates are set *and* staff may clock
 *   in from anywhere, so the radius sits on the record doing nothing. A real
 *   arrangement — a company keeps the office position while people work from
 *   home — and one the row states rather than showing a radius that bites
 *   nothing.
 *
 * ## Off, not gone
 *
 * Archiving hides a location; nothing is deleted. `AttendanceEntry` and
 * `Employee` both point here, so a delete either strands a timesheet or fails on
 * the constraint. The confirm dialog says how many people are still assigned
 * rather than refusing — somebody pointed at a closed branch is a thing HR needs
 * told, not a reason to block the edit — and "Turn back on" is the way back,
 * which is why the archived rows can be shown at all.
 */
/**
 * The form's draft as a create body.
 *
 * `null` becomes absence, because the create schema has no way to say "no
 * fence" other than not mentioning one — every field on it is optional and none
 * of them is nullable. On a patch the nulls are load-bearing and go through
 * untouched, which is the whole reason those two shapes are different types.
 */
function toCreateInput(draft: LocationDraft) {
  return {
    name: draft.name,
    remoteAllowed: draft.remoteAllowed,
    ...(draft.addressLine === null ? {} : { addressLine: draft.addressLine }),
    ...(draft.latitude === null ? {} : { latitude: draft.latitude }),
    ...(draft.longitude === null ? {} : { longitude: draft.longitude }),
    ...(draft.radiusMetres === null ? {} : { radiusMetres: draft.radiusMetres }),
  };
}

export function LocationsScreen() {
  const { can, loading: permissionsLoading } = usePermissions();
  const [showArchived, setShowArchived] = useState(false);
  const list = useWorkLocationList(showArchived);
  const mutations = useWorkLocationMutations();
  const toast = useToast();

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ApiWorkLocation | null>(null);
  const [archiving, setArchiving] = useState<ApiWorkLocation | null>(null);
  const [busy, setBusy] = useState(false);

  if (permissionsLoading) {
    return (
      <PageBody className="flex items-center justify-center py-24">
        <Spinner />
      </PageBody>
    );
  }

  const canManage = can("MANAGE_SETTINGS");

  /* Every write reports its own failure, and the API's wording is the useful
     part: it names the location that already holds a name and says whether it is
     taken or merely switched off. */
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

  const live = list.locations.filter((row) => row.archivedAt === null);
  const fenced = live.filter((row) => row.radiusMetres !== null);
  const enforcing = live.filter((row) => row.geofenceEnforced);

  return (
    <>
      <PageHeader
        title="Work locations"
        breadcrumb={[{ href: "/settings", label: "Settings" }]}
        action={
          canManage ? (
            <Button variant="accent" onClick={() => setAdding(true)}>
              <Plus aria-hidden="true" className="size-4" />
              Add a location
            </Button>
          ) : undefined
        }
      />

      <PageBody className="flex flex-col gap-6">
        <LoadFailure subject="your work locations" error={list.error}  onRetry={list.reload}/>

        {/* The one honest gap in demo mode, stated rather than left to be
            discovered by wondering why a fence let somebody in. */}
        {DEMO_ENABLED && list.source === "demo" && (
          <Callout tone="warning" title="Demo locations, this browser only">
            Adding, editing and switching off all work, and persist in this
            browser. One thing does not:{" "}
            <strong>a fence set here is never applied</strong>, because clocking
            in offline does not ask the device where it is. Connected, the
            clock-in is the only thing that judges a fence, and it judges every
            one of them.
          </Callout>
        )}

        {!canManage && (
          <Callout tone="info" title="You can see these, not change them">
            Where somebody may clock in is the same kind of decision as what
            counts as late, so it needs the settings permission. Ask whoever
            manages settings.
          </Callout>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Stat
            label="Locations"
            value={list.loading ? "—" : String(live.length)}
            hint="Switched-on places somebody can be assigned to."
          />
          <Stat
            label="With a geofence"
            value={list.loading ? "—" : String(fenced.length)}
            hint={
              fenced.length === enforcing.length
                ? "Each one checks where a clock-in came from."
                : `${fenced.length - enforcing.length} of them ${fenced.length - enforcing.length === 1 ? "is" : "are"} not applied, because staff there may clock in from anywhere.`
            }
          />
          <Stat
            label="Open to anywhere"
            value={
              list.loading
                ? "—"
                : String(live.filter((row) => row.remoteAllowed).length)
            }
            hint="Staff may clock in wherever they are."
          />
        </div>

        <Card>
          <CardHeader
            className="flex-wrap"
            level={2}
            title="Where people clock in"
            description={GEOFENCE_EXPLANATION}
            action={
              <Checkbox
                label="Show switched-off locations"
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
          ) : list.locations.length === 0 ? (
            <EmptyState
              icon={<Building2 aria-hidden="true" />}
              title="No work locations yet"
              description="Until one exists, a clock-in records a time and not a place, and nobody's record can say which branch they report to."
              action={
                canManage ? (
                  <Button variant="accent" onClick={() => setAdding(true)}>
                    <Plus aria-hidden="true" className="size-4" />
                    Add a location
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <TableWrap
              className="rounded-none border-0"
              caption="Work locations, with the geofence set for each"
            >
              <THead>
                <TH>Location</TH>
                <TH>Clocking in</TH>
                <TH>Geofence</TH>
                <TH align="right">Assigned</TH>
                {canManage && (
                  <TH align="right">
                    <span className="sr-only">Actions</span>
                  </TH>
                )}
              </THead>
              <TBody>
                {list.locations.map((row) => {
                  const off = row.archivedAt !== null;
                  return (
                    <TR key={row.id}>
                      <TDPrimary
                        title={
                          <span className="flex flex-wrap items-center gap-2">
                            {row.name}
                            {off && (
                              <Badge tone="neutral" size="sm">
                                Switched off
                              </Badge>
                            )}
                          </span>
                        }
                        subtitle={row.addressLine ?? undefined}
                      />
                      <TD>
                        {row.remoteAllowed ? (
                          <span className="text-body-sm text-body">
                            From anywhere
                          </span>
                        ) : row.geofenceEnforced ? (
                          <span className="text-body-sm text-body">
                            On site only
                          </span>
                        ) : (
                          <span className="text-body-sm text-body">Anywhere (no fence set)</span>
                        )}
                      </TD>
                      <TD>
                        {row.radiusMetres === null ? (
                          /* Absent, not zero. */
                          <span className="text-body-sm text-muted">Not checked</span>
                        ) : (
                          <span className="flex flex-col gap-0.5">
                            <span className="tabular flex items-center gap-1.5 text-body-sm text-ink">
                              <MapPin aria-hidden="true" className="size-3.5 text-faint" />
                              {row.radiusMetres.toLocaleString()} m
                            </span>
                            <span className="tabular text-meta text-muted">
                              {row.latitude}, {row.longitude}
                            </span>
                            {!row.geofenceEnforced && (
                              <span className="text-meta text-muted">
                                Set, but not applied
                              </span>
                            )}
                          </span>
                        )}
                      </TD>
                      <TD align="right">
                        {row.assigned === null ? (
                          /* Absent in demo mode: nothing joins a demo employee's
                             city to a work location, and 0 would read as "nobody
                             works here". */
                          <span className="text-body-sm text-muted">—</span>
                        ) : (
                          <span className="tabular text-body-sm text-ink">
                            {row.assigned}
                          </span>
                        )}
                      </TD>
                      {canManage && (
                        <TD align="right">
                          <div className="flex justify-end gap-1.5">
                            {off ? (
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                  void run(
                                    () => mutations.restore(row.id),
                                    `${row.name} is back on`,
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
                                  onClick={() => setEditing(row)}
                                >
                                  Edit
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
            title="What a location is used for"
            description="Four things read this table, which is why it is worth getting right."
          />
          <CardBody className="flex flex-col gap-2.5 text-body-sm text-body">
            <p>
              <strong className="text-ink">Clocking in.</strong> The place is
              recorded with the time, so a site crew clocking in &ldquo;at the
              office&rdquo; is visible rather than assumed.
            </p>
            <p>
              <strong className="text-ink">The geofence.</strong> Where one is set
              and staff may not clock in from anywhere, a clock-in from outside
              the radius is turned down and told how far off it was.
            </p>
            <p>
              <strong className="text-ink">Employee records.</strong> Each person
              can name the location they report to, on their record and in the
              spreadsheet import.
            </p>
            <p>
              <strong className="text-ink">The roster and the timesheet.</strong>{" "}
              Both show where the day was worked. Switching a location off keeps
              every record that already names it.
            </p>
            <p className="text-muted">
              What a location does <em>not</em> do is decide pay. The working
              month and the split live in{" "}
              <ButtonLink href="/settings/payroll" variant="ghost" size="sm">
                pay setup
              </ButtonLink>
              , and the office week in the attendance policy.
            </p>
          </CardBody>
        </Card>
      </PageBody>

      {adding && (
        <LocationForm
          onClose={() => setAdding(false)}
          onSave={async (draft) => {
            const ok = await run(
              () => mutations.create(toCreateInput(draft)),
              `${draft.name} added`,
            );
            if (ok) setAdding(false);
          }}
        />
      )}

      {editing && (
        <LocationForm
          location={editing}
          onClose={() => setEditing(null)}
          onSave={async (draft) => {
            /* The draft goes straight in: a patch is the one shape that can say
               "no fence" out loud, and clearing one is exactly what three nulls
               are for. */
            const ok = await run(
              () => mutations.update(editing.id, draft),
              `${draft.name} saved`,
            );
            if (ok) setEditing(null);
          }}
        />
      )}

      <ConfirmDialog
        open={archiving !== null}
        onClose={() => setArchiving(null)}
        loading={busy}
        tone="danger"
        title={`Switch off ${archiving?.name ?? "this location"}?`}
        confirmLabel="Switch it off"
        onConfirm={async () => {
          if (!archiving) return;
          const ok = await run(
            () => mutations.archive(archiving.id),
            `${archiving.name} switched off`,
          );
          if (ok) setArchiving(null);
        }}
        body={
          <span className="flex flex-col gap-2.5">
            <span>
              Nothing is deleted. Every clock-in already recorded there keeps
              pointing at it, and last quarter&rsquo;s reports keep reading
              correctly. Nobody can clock in there again, and it disappears from
              the picker on an employee record.
            </span>
            {archiving !== null && archiving.assigned !== null && archiving.assigned > 0 && (
              <span>
                {archiving.assigned === 1
                  ? "One person still has this as their location"
                  : `${archiving.assigned} people still have this as their location`}
                . They are not moved and nothing refuses the change. Reassign
                them when you know where they should be.
              </span>
            )}
            <span>You can turn it back on at any time.</span>
          </span>
        }
      />
    </>
  );
}
