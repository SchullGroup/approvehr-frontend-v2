"use client";

import { useMemo, useState } from "react";
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  ToggleRight,
} from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  DescriptionList,
  EmptyState,
  Field,
  Modal,
  Select,
  SegmentedControl,
  Spinner,
  Stat,
  Switch,
  Tabs,
  useToast,
  type TabItem,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import {
  addDays,
  hoursLabel,
  shortDay,
  spokenDay,
  timesLabel,
  weekStart,
  type ApiRotaCell,
  type ApiRotaRow,
} from "@/lib/api/shifts";
import { Can, useCan } from "@/lib/permissions";
import { useFeatures } from "@/lib/store/features";
import { useSession } from "@/lib/store/session";
import { useRota, useShiftCatalogue, useShiftMutations } from "@/lib/store/shifts";
import { TODAY } from "@/lib/today";
import { AssignPatternModal } from "./assign-pattern";
import { SHIFT_TABS, isShiftTab, type ShiftTab } from "./tabs";
import { shiftColours } from "./palette";
import { RequestSwapModal } from "./request-swap";
import { RotaGrid, ShiftLegend } from "./rota-grid";
import { ShiftCatalogue } from "./shift-catalogue";
import { SwapPanel } from "./swaps";

type Span = "1" | "2";

/* Labels only. The ids and their order come from `tabs.ts`, which the server
   page also reads — see the note there about the client boundary. */
const LABELS: Record<ShiftTab, string> = {
  rota: "Rota",
  catalogue: "Shifts and cycles",
};

const TABS: TabItem[] = SHIFT_TABS.map((id) => ({ id, label: LABELS[id] }));

/**
 * The rota.
 *
 * ## The flag
 *
 * This whole screen is behind `useFeatures().shifts`, and the way it is handled
 * is by **not being in the nav** — the sidebar filters on the same flag, so a
 * company that answered "no" to shifts never sees it. What is here for the
 * deep-linked case is a title and a button that turns it on, not a paragraph
 * explaining what shifts are. A sentence explaining why the product is refusing
 * should have been a button doing the thing.
 *
 * ## Reading is ungated; every control needs `EDIT_RECORDS`
 *
 * A rota is pinned to the wall in every factory and clinic that has one, so
 * nobody needs a permission to look at it — and "who is on nights tonight, I
 * need to call somebody" is the question it exists to answer. Deciding when a
 * named person works is one act, so defining a shift, writing a cycle, putting
 * somebody on a day and approving a swap all sit behind the one permission.
 * Controls the reader cannot use are absent rather than disabled.
 *
 * The one exception, and it is deliberate: **asking a colleague to cover your
 * own shift needs nothing**, and agreeing to cover somebody else's cannot be
 * delegated even with permission to edit records.
 *
 * ## Cover requests are on this tab, not their own
 *
 * They are the only thing on the screen that is a task, and a rota where they
 * live behind a tab is a rota where they go unanswered for a week.
 */
export function ShiftsScreen({ initialTab }: { initialTab: ShiftTab }) {
  const features = useFeatures();
  const { employeeId } = useSession();
  const canEdit = useCan("EDIT_RECORDS");

  const [tab, setTab] = useState<ShiftTab>(initialTab);
  const [weekOf, setWeekOf] = useState(() => weekStart(TODAY));
  const [span, setSpan] = useState<Span>("1");
  const [everybody, setEverybody] = useState(false);

  const from = weekOf;
  const to = addDays(weekOf, span === "1" ? 6 : 13);

  const catalogue = useShiftCatalogue();
  const grid = useRota({ from, to, includeUnrostered: everybody });

  const [opened, setOpened] = useState<{
    row: ApiRotaRow;
    date: string;
    cell: ApiRotaCell | null;
  } | null>(null);
  const [assigning, setAssigning] = useState(false);

  /* The grid, the legend and every preview read one map, so a colour cannot
     mean two things on one screen. */
  const colours = useMemo(
    () => shiftColours(grid.rota?.shifts ?? catalogue.shifts),
    [grid.rota, catalogue.shifts],
  );

  const reload = () => {
    grid.reload();
    catalogue.reload();
  };

  /**
   * The tab is in the query string, so a link to the catalogue opens on it.
   *
   * `replaceState` rather than a router push: switching tab is not a navigation,
   * should not add a back-button step, and must not re-run a server render that
   * would throw away the week you had paged to.
   */
  const changeTab = (next: string) => {
    if (!isShiftTab(next)) return;
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  };

  if (features.loading) {
    return (
      <PageBody className="flex items-center justify-center py-24">
        <Spinner />
        <span className="sr-only">Loading</span>
      </PageBody>
    );
  }

  if (!features.shifts) {
    return (
      <>
        <PageHeader title="Shifts" />
        <PageBody>
          <EmptyState
            icon={<ToggleRight aria-hidden="true" />}
            title="Shifts are switched off"
            description="Rotas, night duty and weekend cover instead of one working pattern."
            action={
              <ButtonLink variant="accent" href="/settings/features">
                Turn shifts on
              </ButtonLink>
            }
          />
        </PageBody>
      </>
    );
  }

  const noShiftsYet = !catalogue.loading && catalogue.shifts.length === 0;
  const uncovered = (grid.rota?.coverage ?? []).filter(
    (day) => day.shifts.length === 0,
  ).length;

  return (
    <>
      <PageHeader
        title="Shifts"
        description="Who works when. Nights, earlies, weekend cover."
        meta={
          grid.source === "demo" ? (
            <Badge tone="warning" size="sm">
              Demo · this browser only
            </Badge>
          ) : undefined
        }
        action={
          <Can permission="EDIT_RECORDS">
            {noShiftsYet ? (
              <Button
                variant="accent"
                size="sm"
                onClick={() => changeTab("catalogue")}
              >
                Add a shift
              </Button>
            ) : (
              <Button
                variant="accent"
                size="sm"
                onClick={() => setAssigning(true)}
              >
                Put people on the rota
              </Button>
            )}
          </Can>
        }
      />

      <PageBody>
        <Tabs items={TABS} value={tab} onChange={changeTab}>
          <div className="flex flex-col gap-6">
            {grid.error && (
              <p className="rounded-md border border-danger-line bg-danger-soft px-3.5 py-2.5 text-[0.875rem] text-ink">
                {grid.error.message}
              </p>
            )}

            {tab === "rota" ? (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Stat
                    label="On the rota"
                    value={String(grid.rota?.totals.people ?? 0)}
                    hint={`${shortDay(from)} to ${shortDay(to)}`}
                  />
                  <Stat
                    label="Rostered days"
                    value={String(grid.rota?.totals.rosteredDays ?? 0)}
                  />
                  <Stat
                    label="Days with nobody on"
                    value={String(uncovered)}
                    {...(uncovered > 0
                      ? {
                          trend: {
                            direction: "down" as const,
                            label: "Nobody rostered",
                          },
                        }
                      : {})}
                  />
                </div>

                <Card>
                  <CardHeader
                    title="The week"
                    description={`${shortDay(from)} – ${shortDay(to)}`}
                    action={
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => setWeekOf(addDays(weekOf, -7))}
                        >
                          <ChevronLeft aria-hidden="true" className="size-4" />
                          <span className="sr-only">Previous week</span>
                        </Button>
                        <Button size="sm" onClick={() => setWeekOf(weekStart(TODAY))}>
                          This week
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => setWeekOf(addDays(weekOf, 7))}
                        >
                          <ChevronRight aria-hidden="true" className="size-4" />
                          <span className="sr-only">Next week</span>
                        </Button>
                        <SegmentedControl<Span>
                          label="How many weeks to show"
                          value={span}
                          onChange={setSpan}
                          options={[
                            { value: "1", label: "1 week" },
                            { value: "2", label: "2 weeks" },
                          ]}
                        />
                      </div>
                    }
                  />
                  <CardBody className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <ShiftLegend
                        shifts={grid.rota?.shifts ?? []}
                        colours={colours}
                      />
                      <Switch
                        label="Show everybody"
                        checked={everybody}
                        onChange={(event) => setEverybody(event.target.checked)}
                      />
                    </div>

                    {grid.loading ? (
                      <span className="flex items-center gap-2 text-[0.875rem] text-muted">
                        <Spinner size="sm" />
                        Loading the rota
                      </span>
                    ) : !grid.rota || grid.rota.rows.length === 0 ? (
                      <EmptyState
                        compact
                        icon={<CalendarRange aria-hidden="true" />}
                        title={
                          noShiftsYet ? "No shifts defined yet" : "Nobody on this week"
                        }
                        description={
                          noShiftsYet
                            ? "Add an early, a late and a night, then build a cycle out of them."
                            : "Put a crew on a cycle, or turn on Show everybody to pick names."
                        }
                        action={
                          canEdit ? (
                            noShiftsYet ? (
                              <Button
                                variant="accent"
                                onClick={() => changeTab("catalogue")}
                              >
                                Add a shift
                              </Button>
                            ) : (
                              <Button
                                variant="accent"
                                onClick={() => setAssigning(true)}
                              >
                                Put people on the rota
                              </Button>
                            )
                          ) : undefined
                        }
                      />
                    ) : (
                      <RotaGrid
                        rota={grid.rota}
                        colours={colours}
                        onOpenCell={(row, date, cell) => {
                          /* Nothing to offer on an empty day to somebody who cannot
                             edit the rota, so it does not open. */
                          if (!cell && !canEdit) return;
                          setOpened({ row, date, cell });
                        }}
                      />
                    )}
                  </CardBody>
                </Card>

                <SwapPanel onChanged={reload} />
              </>
            ) : (
              <ShiftCatalogue
                shifts={catalogue.shifts}
                patterns={catalogue.patterns}
                editable={canEdit}
                onChanged={reload}
              />
            )}
          </div>
        </Tabs>
      </PageBody>

      {/* Mounted only while open, so the wizard's first day defaults to the
          week you are actually looking at. Kept mounted, `useState(defaultFrom)`
          would hold whichever week the screen opened on — which was a real bug:
          page forward three weeks, open the wizard, and it offers to roster the
          week you started from. */}
      {assigning && (
        <AssignPatternModal
          open
          onClose={() => setAssigning(false)}
          patterns={catalogue.patterns}
          shifts={catalogue.shifts}
          defaultFrom={from}
          onDone={reload}
        />
      )}

      {opened && (
        <DayPanel
          row={opened.row}
          date={opened.date}
          cell={opened.cell}
          shifts={catalogue.shifts}
          canEdit={canEdit}
          isMine={opened.row.employeeId === employeeId}
          onClose={() => setOpened(null)}
          onChanged={reload}
        />
      )}
    </>
  );
}

/* ----------------------------------------------------------------- one day */

/**
 * One person, one day.
 *
 * The buttons are the copy. A rostered day offers cover and removal; an empty
 * one offers a shift. Nothing here explains what a rota is.
 */
function DayPanel({
  row,
  date,
  cell,
  shifts,
  canEdit,
  isMine,
  onClose,
  onChanged,
}: {
  row: ApiRotaRow;
  date: string;
  cell: ApiRotaCell | null;
  shifts: ReturnType<typeof useShiftCatalogue>["shifts"];
  canEdit: boolean;
  isMine: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const { assign, removeAssignment } = useShiftMutations();
  const [shiftId, setShiftId] = useState(shifts[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const full = cell ? shifts.find((shift) => shift.id === cell.shiftId) : undefined;

  const put = async () => {
    setBusy(true);
    setError(null);
    try {
      await assign({ employeeId: row.employeeId, shiftId, onDate: date });
      toast.push({
        title: `${row.name} on the rota`,
        tone: "success",
        detail: shortDay(date),
      });
      onChanged();
      onClose();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "That did not go through. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const take = async () => {
    if (!cell) return;
    setBusy(true);
    try {
      const result = await removeAssignment(cell.assignmentId);
      toast.push({
        title: `${row.name} off ${shortDay(date)}`,
        tone: "success",
        ...(result.swapsCancelled > 0
          ? {
              detail: `${result.swapsCancelled} cover ${result.swapsCancelled === 1 ? "request" : "requests"} withdrawn.`,
            }
          : {}),
      });
      setRemoving(false);
      onChanged();
      onClose();
    } catch (caught) {
      toast.push({
        title: "That did not work",
        tone: "danger",
        detail:
          caught instanceof ApiError
            ? caught.message
            : "Something went wrong. Try again.",
      });
      setRemoving(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal
        open={!asking && !removing}
        onClose={onClose}
        title={`${row.name} · ${spokenDay(date)}`}
        size="sm"
        footer={
          cell ? (
            <>
              {(isMine || canEdit) && (
                <Button onClick={() => setAsking(true)}>Ask cover</Button>
              )}
              {canEdit && (
                <Button variant="danger" onClick={() => setRemoving(true)}>
                  Take off the rota
                </Button>
              )}
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="accent"
                onClick={put}
                loading={busy}
                disabled={!shiftId}
              >
                Put them on
              </Button>
            </>
          )
        }
      >
        {error && (
          <p className="mb-4 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-[0.875rem] text-ink">
            {error}
          </p>
        )}

        {cell ? (
          <DescriptionList
            items={[
              { term: "Shift", value: cell.shiftName },
              { term: "Times", value: timesLabel(cell) },
              ...(full
                ? [{ term: "Paid", value: hoursLabel(full.paidMinutes) }]
                : []),
              { term: "Staff number", value: row.employeeNo },
              ...(cell.note ? [{ term: "Note", value: cell.note }] : []),
              ...(cell.patternId
                ? [{ term: "From", value: "A cycle" }]
                : [{ term: "From", value: "Put on by hand" }]),
            ]}
          />
        ) : (
          <Field label="Which shift">
            <Select
              value={shiftId}
              onChange={(event) => setShiftId(event.target.value)}
            >
              {shifts
                .filter((shift) => shift.active && !shift.archived)
                .map((shift) => (
                  <option key={shift.id} value={shift.id}>
                    {shift.shortName} · {shift.name} · {timesLabel(shift)}
                  </option>
                ))}
            </Select>
          </Field>
        )}
      </Modal>

      {cell && (
        <RequestSwapModal
          open={asking}
          onClose={() => {
            setAsking(false);
            onClose();
          }}
          shift={cell}
          employeeId={row.employeeId}
          employeeName={row.name}
          onDone={onChanged}
        />
      )}

      <ConfirmDialog
        open={removing}
        onClose={() => setRemoving(false)}
        onConfirm={() => void take()}
        title={`Take ${row.name} off ${shortDay(date)}?`}
        confirmLabel="Take off"
        loading={busy}
        body={
          <>
            The day comes off the rota, and any cover request on it is withdrawn.
            Payroll counts rostered days, so this changes what that month divides
            by.
          </>
        }
      />
    </>
  );
}
