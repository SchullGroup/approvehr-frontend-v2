"use client";

import { useMemo, useState } from "react";
import { Lock, UserRound } from "lucide-react";
import {
  Button,
  Callout,
  Disclosure,
  EmptyState,
  Field,
  Modal,
  Textarea,
  useToast,
  LoadState,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { BigChoice, WizardShell } from "@/components/performance/wizard-shell";
import { ApiError } from "@/lib/api/client";
import {
  PERFORMANCE_AXIS_LABELS,
  POTENTIAL_REASON_MIN,
  scoreWords,
  type ApiNineBox,
  type ApiNineBoxCell,
  type ApiNineBoxPerson,
  type ApiPerformanceAxis,
  type ApiPotentialLevel,
} from "@/lib/api/performance";
import { useCan } from "@/lib/permissions";
import { useCycleMutations, useNineBox } from "@/lib/store/performance";
import { cn } from "@/lib/cn";

/**
 * The talent map: who is ready for more, who to grow, who needs a conversation.
 *
 * It crosses two things: across, how they did this period, from their mark; up,
 * how far they could go, which is their manager's judgement and is asked at the
 * end of the manager's review so the map fills itself as reviews are sent.
 * Neither half is worked out from the other, and a person missing a half is not
 * placed at the bottom: they are listed as not on the map yet.
 *
 * The grid is the page. A cell shows its name, a count and the faces in it; a
 * click opens who they are and the one thing worth doing about it.
 */

const AXES: readonly ApiPerformanceAxis[] = ["BELOW", "MEETS", "EXCEEDS"];
const LEVELS: readonly ApiPotentialLevel[] = ["HIGH", "MEDIUM", "LOW"];

const POTENTIAL_CHOICES: { level: ApiPotentialLevel; label: string }[] = [
  { level: "HIGH", label: "Ready for a bigger role" },
  { level: "MEDIUM", label: "Could grow in this role" },
  { level: "LOW", label: "Happy where they are" },
];

const AXIS_WORDS: Record<ApiPerformanceAxis, string> = {
  BELOW: "Below what was agreed",
  MEETS: "Meets what was agreed",
  EXCEEDS: "Above what was agreed",
};

const ROW_WORDS: Record<ApiPotentialLevel, string> = {
  HIGH: "Ready for a bigger role",
  MEDIUM: "Could grow here",
  LOW: "Happy in their role",
};

/** The one next step worth taking for a cell, where there is one. */
const CELL_NEXT: Record<string, string> = {
  HIGH_EXCEEDS: "Plan their next role",
  HIGH_MEETS: "Give them a stretch goal",
  HIGH_BELOW: "Find out what is in the way",
  MEDIUM_EXCEEDS: "Talk about growth",
  MEDIUM_BELOW: "Agree what changes",
  LOW_EXCEEDS: "Make sure they stay",
  LOW_BELOW: "Book the conversation",
};

/** Soft tint by corner: the top right is the strongest, the bottom left a warm neutral. */
const TINT: Record<string, string> = {
  HIGH_EXCEEDS: "bg-success-soft",
  HIGH_MEETS: "bg-accent-soft",
  MEDIUM_EXCEEDS: "bg-accent-soft",
  LOW_BELOW: "bg-sand",
};

const initials = (name: string) =>
  name
    .split(" ")
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();

export function NineBoxScreen({ cycleId }: { cycleId: string }) {
  const canSeeCompany = useCan("EDIT_RECORDS");
  const detail = useNineBox(cycleId, canSeeCompany);
  const [open, setOpen] = useState<ApiNineBoxCell | null>(null);
  const [placing, setPlacing] = useState<ApiNineBoxPerson | null>(null);
  const [filling, setFilling] = useState(false);

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
        title="Talent map"
      />
      <PageBody>
        {!canSeeCompany ? (
          <EmptyState
            plain
            icon={<Lock aria-hidden="true" />}
            title="Not available to you"
            description="The talent map covers everyone in the company, so it is only open to people who can see every employee's record."
          />
        ) : !detail.available ? (
          <Callout tone="info" title="This needs a connection to the server">
            {detail.refusal}
          </Callout>
        ) : detail.error || detail.loading || !grid ? (
          <LoadState
            loading={detail.loading}
            error={detail.error}
            subject="the talent map"
            onRetry={detail.reload}
            skeleton="detail"
          >
            {null}
          </LoadState>
        ) : (
          <div className="flex flex-col gap-6">
            {grid.unplaced.noPotential.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
                <p className="text-body-sm text-ink">
                  {grid.unplaced.noPotential.length === 1
                    ? "1 person isn't on the map yet"
                    : `${String(grid.unplaced.noPotential.length)} people aren't on the map yet`}
                </p>
                <Button size="sm" onClick={() => setFilling(true)}>
                  Place them
                </Button>
              </div>
            )}
            <Map grid={grid} onOpen={setOpen} />
            <NotOnTheMap grid={grid} />
          </div>
        )}
      </PageBody>

      {open && (
        <Modal
          open
          onClose={() => setOpen(null)}
          title={open.label}
          size="md"
          footer={<Button onClick={() => setOpen(null)}>Close</Button>}
        >
          <div className="flex flex-col gap-4">
            {CELL_NEXT[open.box] && (
              <p className="text-body-sm text-muted">{CELL_NEXT[open.box]}</p>
            )}
            <ul className="flex flex-col gap-2">
              {open.people.map((person) => (
                <li
                  key={person.employeeId}
                  className="flex items-center justify-between gap-3 rounded-md border border-line p-3"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Avatar name={person.employeeName} />
                    <span className="min-w-0">
                      <span className="block truncate text-body-sm font-medium text-ink">
                        {person.employeeName}
                      </span>
                      <span className="block truncate text-meta text-muted">
                        {person.jobTitle}
                        {person.scoreBp !== null &&
                          ` · ${scoreWords(person) ?? ""}`}
                      </span>
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setOpen(null);
                      setPlacing(person);
                    }}
                  >
                    Change
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </Modal>
      )}

      {placing && (
        <PlaceDialog
          key={placing.employeeId}
          cycleId={cycleId}
          person={placing}
          onClose={() => setPlacing(null)}
          onDone={() => {
            setPlacing(null);
            detail.reload();
          }}
        />
      )}

      {filling && grid && (
        <PlaceThem
          cycleId={cycleId}
          people={grid.unplaced.noPotential}
          onClose={() => {
            setFilling(false);
            detail.reload();
          }}
        />
      )}
    </>
  );
}

function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-sunken text-meta font-semibold text-body ring-2 ring-surface",
        className,
      )}
    >
      {initials(name) || <UserRound className="size-4" />}
    </span>
  );
}

function Map({
  grid,
  onOpen,
}: {
  grid: ApiNineBox;
  onOpen: (cell: ApiNineBoxCell) => void;
}) {
  const cellFor = useMemo(() => {
    const map = new globalThis.Map<string, ApiNineBoxCell>();
    for (const cell of grid.cells) map.set(cell.box, cell);
    return map;
  }, [grid.cells]);

  return (
    <div className="grid grid-cols-[auto_repeat(3,minmax(0,1fr))] gap-2 sm:gap-3">
      <div />
      {AXES.map((axis) => (
        <p
          key={axis}
          className="px-1 text-center text-meta font-medium text-muted"
          title={PERFORMANCE_AXIS_LABELS[axis]}
        >
          {AXIS_WORDS[axis]}
        </p>
      ))}
      {LEVELS.map((level) => (
        <Row key={level} level={level} cellFor={cellFor} onOpen={onOpen} />
      ))}
    </div>
  );
}

function Row({
  level,
  cellFor,
  onOpen,
}: {
  level: ApiPotentialLevel;
  cellFor: globalThis.Map<string, ApiNineBoxCell>;
  onOpen: (cell: ApiNineBoxCell) => void;
}) {
  return (
    <>
      <p className="flex w-16 items-center text-meta font-medium text-muted sm:w-24">
        {ROW_WORDS[level]}
      </p>
      {AXES.map((axis) => {
        const cell = cellFor.get(`${level}_${axis}`);
        if (!cell) return <div key={axis} />;
        const tint = TINT[cell.box] ?? "bg-surface";
        /* An empty cell has nothing to open, so it is not a button. */
        if (cell.people.length === 0) {
          return (
            <div
              key={axis}
              className={cn(
                "flex min-h-28 flex-col justify-between gap-3 rounded-xl border border-line p-3",
                tint,
              )}
            >
              <span className="text-body-sm font-medium text-muted">
                {cell.label}
              </span>
            </div>
          );
        }
        return (
          <button
            key={axis}
            type="button"
            onClick={() => onOpen(cell)}
            aria-label={`${cell.label}, ${String(cell.people.length)} ${cell.people.length === 1 ? "person" : "people"}`}
            className={cn(
              "flex min-h-28 flex-col justify-between gap-3 rounded-xl border border-line p-3 text-left transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2",
              tint,
            )}
          >
            <span className="text-body-sm font-medium text-ink">
              {cell.label}
            </span>
            <span className="flex items-center justify-between gap-2">
              <span className="flex -space-x-2">
                {cell.people.slice(0, 5).map((person) => (
                  <Avatar key={person.employeeId} name={person.employeeName} />
                ))}
              </span>
              <span className="tabular text-body-sm font-semibold text-ink">
                {cell.people.length > 5
                  ? `+${String(cell.people.length - 5)}`
                  : String(cell.people.length)}
              </span>
            </span>
          </button>
        );
      })}
    </>
  );
}

/** People who cannot be placed yet because they have no mark, kept to one quiet line. */
function NotOnTheMap({ grid }: { grid: ApiNineBox }) {
  const waiting = [...grid.unplaced.noPerformance, ...grid.unplaced.neither];
  if (waiting.length === 0) return null;
  return (
    <Disclosure
      title="No score yet"
      meta={<span className="text-meta text-muted">{waiting.length}</span>}
      level={2}
    >
      <ul className="flex flex-col gap-1 text-body-sm text-ink">
        {waiting.map((person) => (
          <li key={person.employeeId}>{person.employeeName}</li>
        ))}
      </ul>
    </Disclosure>
  );
}

/**
 * Place the people who are not on the map yet, one at a time.
 *
 * A name, how they did, and three large answers. Choosing one saves it and moves
 * to the next person. "Ready for a bigger role" asks for a sentence first,
 * because that is the answer a promotion is decided from.
 */
function PlaceThem({
  cycleId,
  people,
  onClose,
}: {
  cycleId: string;
  people: ApiNineBoxPerson[];
  onClose: () => void;
}) {
  const mutations = useCycleMutations();
  const [queue] = useState(people);
  const [at, setAt] = useState(0);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const person = queue[at];
  if (!person) {
    return (
      <WizardShell
        open
        onClose={onClose}
        step={queue.length - 1}
        total={queue.length}
        title="Everyone is on the map"
        hideNext
      >
        <div>
          <Button variant="accent" onClick={onClose}>
            See the map
          </Button>
        </div>
      </WizardShell>
    );
  }

  const place = async (level: ApiPotentialLevel, why?: string) => {
    setBusy(true);
    setError(null);
    try {
      await mutations.setPotential(cycleId, person.employeeId, {
        level,
        ...(why?.trim() ? { reason: why.trim() } : {}),
      });
      setAsking(false);
      setReason("");
      setAt(at + 1);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <WizardShell
      open
      onClose={onClose}
      step={at}
      total={queue.length}
      title={`How far could ${person.employeeName} go?`}
      error={error}
      busy={busy}
      hideNext={!asking}
      canNext={reason.trim().length >= POTENTIAL_REASON_MIN}
      nextLabel="Place them"
      onNext={() => void place("HIGH", reason)}
      {...(asking ? { onBack: () => setAsking(false) } : {})}
    >
      <p className="text-body-sm text-muted">
        {person.jobTitle}
        {person.bandLabel ? ` · ${person.bandLabel} this period` : ""}
      </p>
      {asking ? (
        <Field label="Why">
          <Textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="What you have seen that puts them here."
          />
        </Field>
      ) : (
        <div className="flex flex-col gap-3">
          {POTENTIAL_CHOICES.map((choice) => (
            <BigChoice
              key={choice.level}
              onClick={() =>
                choice.level === "HIGH"
                  ? setAsking(true)
                  : void place(choice.level)
              }
            >
              {choice.label}
            </BigChoice>
          ))}
          <button
            type="button"
            onClick={() => setAt(at + 1)}
            className="self-start text-body-sm text-muted hover:text-ink"
          >
            Skip for now
          </button>
        </div>
      )}
    </WizardShell>
  );
}

/** Move or take off one person's placement, from the map. */
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
  const [level, setLevel] = useState<ApiPotentialLevel>(
    person.potential ?? "MEDIUM",
  );
  const [reason, setReason] = useState(person.potentialReason ?? "");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const needsReason =
    level === "HIGH" && reason.trim().length < POTENTIAL_REASON_MIN;

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
      title={person.employeeName}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="accent"
            loading={busy}
            disabled={needsReason}
            onClick={() =>
              void run(
                () =>
                  mutations.setPotential(cycleId, person.employeeId, {
                    level,
                    ...(reason.trim() ? { reason: reason.trim() } : {}),
                  }),
                "Saved",
              )
            }
          >
            Save
          </Button>
          {person.potential && (
            <Button
              variant="ghost"
              loading={busy}
              onClick={() =>
                void run(
                  () => mutations.clearPotential(cycleId, person.employeeId),
                  "Taken off the map",
                )
              }
            >
              Take off the map
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          {POTENTIAL_CHOICES.map((choice) => (
            <BigChoice
              key={choice.level}
              selected={level === choice.level}
              onClick={() => setLevel(choice.level)}
            >
              {choice.label}
            </BigChoice>
          ))}
        </div>
        {level === "HIGH" && (
          <Field label="Why">
            <Textarea
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="What you have seen that puts them here."
            />
          </Field>
        )}
        {failure && (
          <Callout tone="danger" title="That was refused">
            {failure}
          </Callout>
        )}
      </div>
    </Modal>
  );
}
