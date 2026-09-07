"use client";

import { useMemo, useState } from "react";
import { Info, TriangleAlert } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Modal,
  Select,
  Spinner,
  Stat,
  Textarea,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import {
  PERFORMANCE_AXIS_LABELS,
  POTENTIAL_LABELS,
  POTENTIAL_MEANING,
  potentialReasonProblem,
  scoreLabel,
  type ApiNineBox,
  type ApiNineBoxCell,
  type ApiNineBoxPerson,
  type ApiPerformanceAxis,
  type ApiPotentialLevel,
} from "@/lib/api/performance";
import { useCan } from "@/lib/permissions";
import { useCycleMutations, useNineBox } from "@/lib/store/performance";

/**
 * Performance against potential, for one appraisal period.
 *
 * ## The tenth cell is the feature
 *
 * Nine boxes and a list of everybody the grid cannot place. A person nobody has
 * assessed is **not low potential**, and a person with no mark is **not a low
 * performer** — both are unplaced, named, with the missing half said out loud.
 *
 * Every other nine-box on the market draws nine boxes and quietly leaves the
 * rest out, which reads as a grid covering the company when it covers whoever
 * happened to be finished. The counts under the heading are the honest version:
 * how many the grid covers and how many it does not, never divided into each
 * other.
 *
 * ## Potential is a judgement, and the screen says whose
 *
 * The server will not compute it and neither will this. Every placement carries
 * a reason somebody typed, and the reason is on the card — a placement nobody
 * can explain should not be deciding a promotion, and this grid is read by the
 * people who decide promotions.
 *
 * ## "At their level" is not a euphemism, it is the accurate description
 *
 * The literature calls the bottom-left box "Deadwood". `POTENTIAL_MEANING.LOW`
 * is rendered wherever the level is offered, and it says in as many words that
 * this is not a judgement of somebody's value. Most people are here. If a future
 * edit shortens that sentence to fit a layout, the layout is what should change.
 */

const AXES: readonly ApiPerformanceAxis[] = ["BELOW", "MEETS", "EXCEEDS"];
const LEVELS: readonly ApiPotentialLevel[] = ["HIGH", "MEDIUM", "LOW"];

/** The row tone. The middle row is neutral on purpose — see `BAND_TONE`'s reasoning. */
const ROW_TONE: Record<ApiPotentialLevel, "accent" | "neutral" | "info"> = {
  HIGH: "accent",
  MEDIUM: "info",
  LOW: "neutral",
};

export function NineBoxScreen({ cycleId }: { cycleId: string }) {
  const canSeeCompany = useCan("EDIT_RECORDS");
  const detail = useNineBox(cycleId, canSeeCompany);
  const [placing, setPlacing] = useState<ApiNineBoxPerson | null>(null);

  const cycle = detail.cycle;
  const grid = detail.grid;

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/performance", label: "Performance" },
          {
            href: `/performance/periods/${cycleId}`,
            label: cycle?.name ?? "Appraisal period",
          },
        ]}
        title="Nine-box"
        meta={
          <span className="text-meta text-faint">
            Where people are delivering, against how far they could go. Both
            halves are recorded; neither is worked out from the other.
          </span>
        }
      />
      <PageBody>
        {!canSeeCompany ? (
          <EmptyState
            title="Not yours to read"
            description="A nine-box covers everybody in the company, so it needs the permission to see everybody's record."
          />
        ) : !detail.available ? (
          <Callout tone="info" title="This needs the API">
            {detail.refusal}
          </Callout>
        ) : detail.error ? (
          <LoadFailure
            subject="the nine-box"
            error={detail.error}
            onRetry={detail.reload}
          />
        ) : detail.loading || !grid ? (
          <Spinner label="Working out the grid" />
        ) : (
          <Grid grid={grid} onPlace={setPlacing} />
        )}
      </PageBody>
      {placing && (
        <PlaceDialog
          cycleId={cycleId}
          person={placing}
          onClose={() => setPlacing(null)}
          onDone={() => {
            setPlacing(null);
            detail.reload();
          }}
        />
      )}
    </>
  );
}

function Grid({
  grid,
  onPlace,
}: {
  grid: ApiNineBox;
  onPlace: (person: ApiNineBoxPerson) => void;
}) {
  const cellFor = useMemo(() => {
    const map = new Map<string, ApiNineBoxCell>();
    for (const cell of grid.cells) map.set(cell.box, cell);
    return map;
  }, [grid.cells]);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="On the grid"
          value={String(grid.counts.placed)}
          hint={`of ${String(grid.counts.people)} people in this period`}
        />
        <Stat
          label="Not placed"
          value={String(grid.counts.unplaced)}
          hint={
            grid.counts.unplaced === 0
              ? "Everybody has both halves"
              : "Named below, with the half that is missing"
          }
        />
        <Stat
          label="People"
          value={String(grid.counts.people)}
          hint="Everybody the period covers"
        />
      </div>

      {/* Horizontal scroll rather than a card-per-row stack: a nine-box read one
          box at a time is a list, and the whole point is seeing the spread. */}
      <div className="overflow-x-auto">
        <div className="min-w-[52rem]">
          <div className="grid grid-cols-[9rem_repeat(3,1fr)] gap-2">
            <div />
            {AXES.map((axis) => (
              <div key={axis} className="px-1 pb-1">
                <p className="text-meta font-medium text-body">
                  {PERFORMANCE_AXIS_LABELS[axis]}
                </p>
              </div>
            ))}
            {LEVELS.map((level) => (
              <RowOfThree
                key={level}
                level={level}
                cellFor={cellFor}
                onPlace={onPlace}
              />
            ))}
          </div>
          <p className="mt-2 text-meta text-faint">
            Performance, left to right. Potential, top to bottom.
          </p>
        </div>
      </div>

      <Unplaced grid={grid} onPlace={onPlace} />
    </div>
  );
}

function RowOfThree({
  level,
  cellFor,
  onPlace,
}: {
  level: ApiPotentialLevel;
  cellFor: Map<string, ApiNineBoxCell>;
  onPlace: (person: ApiNineBoxPerson) => void;
}) {
  return (
    <>
      <div className="flex flex-col gap-1 py-2 pr-2">
        <Badge tone={ROW_TONE[level]} size="sm">
          {POTENTIAL_LABELS[level]}
        </Badge>
        {/* The sentence, not a tooltip. `LOW` is the one somebody misreads. */}
        <p className="text-meta text-faint">{POTENTIAL_MEANING[level]}</p>
      </div>
      {AXES.map((axis) => {
        const cell = cellFor.get(`${level}_${axis}`);
        if (!cell) return <div key={axis} />;
        return <Box key={axis} cell={cell} onPlace={onPlace} />;
      })}
    </>
  );
}

function Box({
  cell,
  onPlace,
}: {
  cell: ApiNineBoxCell;
  onPlace: (person: ApiNineBoxPerson) => void;
}) {
  return (
    <div className="flex min-h-[8rem] flex-col gap-2 rounded-md border border-line bg-surface p-3">
      <div>
        <p className="text-meta font-medium text-body">{cell.label}</p>
        <p className="text-meta text-faint">{cell.meaning}</p>
      </div>
      {cell.people.length === 0 ? (
        <p className="text-meta text-faint">Nobody</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {cell.people.map((person) => (
            <li key={person.employeeId}>
              <button
                type="button"
                onClick={() => onPlace(person)}
                className="text-left text-body-sm text-accent-text hover:underline underline-offset-4"
              >
                {person.employeeName}
              </button>
              {/* Never `?? 0`. A person in a cell has a band, so they have a
                  score — but writing a zero fallback in the one file whose
                  argument is that an absence is not a zero is how the next
                  person copies it somewhere it can fire. */}
              {person.scoreBp !== null && (
                <span className="ml-1 text-meta text-faint">
                  {scoreLabel(person.scoreBp)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Everybody the grid cannot place, and which half is missing.
 *
 * Three lists rather than one, because the fix differs: somebody with no
 * assessment needs a judgement, somebody with no mark needs a period finished,
 * and somebody with neither needs both. A single "unplaced" count would send a
 * reader to the wrong screen two thirds of the time.
 */
function Unplaced({
  grid,
  onPlace,
}: {
  grid: ApiNineBox;
  onPlace: (person: ApiNineBoxPerson) => void;
}) {
  const groups: {
    key: string;
    title: string;
    note: string;
    people: ApiNineBoxPerson[];
    placeable: boolean;
  }[] = [
    {
      key: "noPotential",
      title: "Nobody has assessed their potential",
      note: "They have a mark for this period. Recording where they sit puts them on the grid.",
      people: grid.unplaced.noPotential,
      placeable: true,
    },
    {
      key: "noPerformance",
      title: "No mark in this period",
      note: "Their potential is recorded and nothing has been scored yet, so there is no column to put them in.",
      people: grid.unplaced.noPerformance,
      placeable: false,
    },
    {
      key: "neither",
      title: "Neither half recorded",
      note: "No mark and no assessment. They are not at the bottom of the grid; they are not on it.",
      people: grid.unplaced.neither,
      placeable: false,
    },
  ];

  const anything = groups.some((group) => group.people.length > 0);
  if (!anything) {
    return (
      <Callout tone="success" title="Everybody is on the grid">
        Every person this period covers has both a mark and a recorded potential.
      </Callout>
    );
  }

  return (
    <Card>
      <CardHeader
        level={2}
        title="Not on the grid"
        description="Named rather than assumed. An absence is not the bottom of a scale."
        action={
          <Badge tone="warning" size="sm" dot>
            {grid.counts.unplaced} of {grid.counts.people}
          </Badge>
        }
      />
      <CardBody className="flex flex-col gap-5">
        {groups
          .filter((group) => group.people.length > 0)
          .map((group) => (
            <div key={group.key} className="flex flex-col gap-2">
              <div>
                <p className="text-body-sm font-medium text-body">
                  {group.title} ({group.people.length})
                </p>
                <p className="text-meta text-faint">{group.note}</p>
              </div>
              <ul className="flex flex-wrap gap-2">
                {group.people.map((person) => (
                  <li key={person.employeeId}>
                    {group.placeable ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onPlace(person)}
                      >
                        {person.employeeName}
                      </Button>
                    ) : (
                      <Badge tone="neutral" size="sm">
                        {person.employeeName}
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </CardBody>
    </Card>
  );
}

/**
 * Record or move one person's potential.
 *
 * The reason is required and refused locally in the server's own words before
 * the press, as well as by the server. `Take it off` is offered only where
 * there is something to take off, and the copy says what happens: they return
 * to unplaced, which is not the bottom row.
 */
function PlaceDialog({
  cycleId,
  person,
  onClose,
  onDone,
}: {
  cycleId: string;
  person: ApiNineBoxPerson;
  onClose: () => void;
  onDone: () => void;
}) {
  const mutations = useCycleMutations();
  const toast = useToast();
  const [level, setLevel] = useState<ApiPotentialLevel>(person.potential ?? "MEDIUM");
  const [reason, setReason] = useState(person.potentialReason ?? "");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const problem = potentialReasonProblem(reason);

  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setFailure(null);
    try {
      await work();
      toast.push({ tone: "success", title: done });
      onDone();
    } catch (error) {
      setFailure(
        error instanceof ApiError
          ? error.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Potential — ${person.employeeName}`}
      description={person.jobTitle}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="accent"
            loading={busy}
            disabled={problem !== null}
            onClick={() =>
              void run(
                () => mutations.setPotential(cycleId, person.employeeId, { level, reason }),
                person.potential ? "Moved" : "Placed",
              )
            }
          >
            {person.potential ? "Save the change" : "Place them"}
          </Button>
          {person.potential && (
            <Button
              variant="secondary"
              loading={busy}
              onClick={() =>
                void run(
                  () => mutations.clearPotential(cycleId, person.employeeId),
                  "Taken off the grid",
                )
              }
            >
              Take it off
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body-sm text-muted">
          {person.band
            ? `Performance this period: ${person.bandLabel ?? ""}.`
            : "No mark in this period yet, so recording potential will not place them on the grid — it will be waiting when the period is scored."}
        </p>

        <Field label="How far could they go?">
          <Select
            value={level}
            onChange={(event) => setLevel(event.target.value as ApiPotentialLevel)}
          >
            {LEVELS.map((each) => (
              <option key={each} value={each}>
                {POTENTIAL_LABELS[each]}
              </option>
            ))}
          </Select>
        </Field>
        <Callout tone="info" title={POTENTIAL_LABELS[level]} icon={<Info aria-hidden="true" />}>
          {POTENTIAL_MEANING[level]}
        </Callout>

        <Field
          label="Why"
          help="Read by whoever decides a promotion from this grid, possibly years from now."
          {...(problem && reason.length > 0 ? { error: problem } : {})}
        >
          <Textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="What you have seen that puts them here."
          />
        </Field>

        {person.potential && (
          <p className="text-meta text-faint">
            Taking the placement off returns them to the not-placed list. It does
            not move them to the bottom row.
          </p>
        )}

        {failure && (
          <Callout tone="danger" title="That was refused" icon={<TriangleAlert aria-hidden="true" />}>
            {failure}
          </Callout>
        )}
      </div>
    </Modal>
  );
}
