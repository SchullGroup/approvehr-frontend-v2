"use client";

import { useMemo, useRef, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { Button, Input, LoadState } from "@/components/ui";
import { BigChoice, WizardShell } from "@/components/performance/wizard-shell";
import { WeightsPie, sliceColour } from "@/components/performance/weights-pie";
import { kindOf, serverSentence } from "@/lib/api/failure";
import {
  performanceApi,
  type ApiScoringWeights,
  type ScoreComponent,
} from "@/lib/api/performance";
import { actionMessage } from "@/lib/use-action";
import { useHeld } from "@/lib/use-held";
import {
  useFramework,
  useFrameworkActions,
  useScoringWeights,
  useSections,
} from "@/lib/store/performance";
import { useProjectsGate } from "@/lib/store/project-session";
import {
  WIZARD_ORDER,
  choicesFrom,
  evenly,
  firstWithoutShare,
  startingPoint,
  weightBody,
} from "@/lib/performance/setup-choices";

/**
 * Setting appraisals up, once, one question to a screen.
 *
 * What counts towards a mark, how much each counts, and what is rated under each
 * competency part. Every screen is pre-filled with what the company is scored on
 * today, so a company happy with that presses Continue. Nothing is written until
 * the last question has been answered, and what is written is the company's own
 * scoring parts and competencies, the same ones Settings and Competency ratings
 * edit afterwards.
 *
 * ## Saving is one write
 *
 * The weights, for every part, go in a single request that the server accepts or
 * refuses whole. It used to add and change parts one at a time, so a part the
 * server refused (Tasks done, with Projects off) was refused after the ones
 * before it had been rewritten, and the company was left at a total nobody had
 * chosen. Parts that were taken off are removed afterwards, and by then they are
 * already at 0%, so a failure there leaves a part that counts for nothing. The
 * competency changes come last and each is remembered once it lands, so pressing
 * Save again finishes the rest and never repeats one.
 *
 * ## It starts from what is saved
 *
 * The wrapper reads the weights and hands them down, because the first render of
 * a component that reads them itself has no answer yet and would start from the
 * defaults, ignoring what the company saved.
 */

const COMPETENCY_PARTS: ScoreComponent[] = [
  "CORE_COMPETENCY",
  "BEHAVIOURAL_COMPETENCY",
  "LEADERSHIP",
];

type Scoring = ReturnType<typeof useScoringWeights>;

function SetupWizardInner({
  open,
  onClose,
  onDone,
  scoring,
  scored,
}: {
  open: boolean;
  onClose: () => void;
  /** Called after everything is saved, when the person chooses to start an appraisal. */
  onDone: (startPeriod: boolean) => void;
  scoring: Scoring;
  /** What the company is scored on today, already read: this is where the wizard starts. */
  scored: ApiScoringWeights;
}) {
  const sections = useSections();
  const framework = useFramework();
  const actions = useFrameworkActions();

  /* Tasks done counts the tasks done in Projects, and the server refuses a weight
     on it while Projects is off. Offering it would be offering what Save then
     refuses, with the way out in another part of the product. Only a known "off"
     counts: while the answer is on its way the choice is offered as before. */
  const gate = useProjectsGate();
  const projectsOff = !gate.loading && !gate.enabled;
  const tasksSaved = scored.rows.some(
    (row) =>
      row.component === "TASKS" && row.isPart !== false && row.weightBp > 0,
  );

  const choices = useMemo(() => choicesFrom(scored.rows), [scored.rows]);
  const nameOf = (source: ScoreComponent) =>
    choices.find((choice) => choice.source === source)?.name ?? source;

  const [initial] = useState(() => startingPoint(scored, projectsOff));
  const [picked, setPicked] = useState<ScoreComponent[]>(initial.ticked);
  const [weights, setWeights] = useState(initial.percents);
  const [touched, setTouched] = useState(initial.touched);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<Partial<Record<ScoreComponent, string[]>>>(
    {},
  );
  const [draft, setDraft] = useState("");
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* What has already landed, so pressing Save again after a failure finishes the
     rest and never makes one of these twice. */
  const landed = useRef(new Set<string>());

  /* What counts, in the order they are listed. Tasks done is never in it while
     Projects is off, whatever was ticked before the answer arrived. */
  const ticked = WIZARD_ORDER.filter(
    (source) => picked.includes(source) && !(projectsOff && source === "TASKS"),
  );

  const competencySteps = useMemo(
    () =>
      COMPETENCY_PARTS.filter(
        (source) =>
          ticked.includes(source) &&
          sections.sections.some((section) => section.component === source),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `ticked` is derived from `picked` and `projectsOff` each render; those are the inputs
    [picked, projectsOff, sections.sections],
  );
  const total = 3 + competencySteps.length;
  // 0 parts, 1 weights, 2.. competencies, last = done
  const kind =
    step === 0
      ? "parts"
      : step === 1
        ? "weights"
        : step === total - 1
          ? "done"
          : "competencies";
  const compSource = competencySteps[step - 2];

  const percent = (source: ScoreComponent) =>
    Math.max(0, Math.round(Number(weights[source]) || 0));
  const sum = ticked.reduce((n, source) => n + percent(source), 0);
  /* A part that is ticked and has nothing to count for would be saved as no part
     at all (a new one is never created at 0%), which is not what ticking says. */
  const empty = firstWithoutShare(ticked, percent);

  const toggle = (source: ScoreComponent) => {
    const next = picked.includes(source)
      ? picked.filter((one) => one !== source)
      : [...picked, source];
    setPicked(next);
    /* An untouched default is re-split evenly. A set the company chose keeps its
       numbers: the part just added starts without one, and says so. */
    if (!touched) {
      setWeights(
        evenly(
          WIZARD_ORDER.filter(
            (one) => next.includes(one) && !(projectsOff && one === "TASKS"),
          ),
        ),
      );
    }
  };

  const save = async () => {
    if (!scoring.editable) {
      setError(scoring.refusal);
      return;
    }
    setSaving(true);
    setError(null);
    let phase: "weights" | "parts" | "competencies" = "weights";
    try {
      /* Reading the parts is what makes the company own them, and it gives the
         ids of the ones that are being taken off. */
      const mine = await performanceApi.scoringParts();
      /* The whole set, in one write. If the server refuses it, nothing below
         has run and nothing has changed. */
      await scoring.save(weightBody(scored.rows, ticked, percent));

      phase = "parts";
      for (const part of mine.parts) {
        if (ticked.includes(part.source)) continue;
        try {
          await performanceApi.deleteScoringPart(part.id);
        } catch (caught) {
          /* Gone already is what was asked for. */
          if (kindOf(caught) === "missing") continue;
          throw new Error(
            `The weights are saved. "${part.name}" could not be taken off your parts and stays at 0%, which counts for nothing. ${actionMessage(caught, "that")} Press Save to try that again.`,
          );
        }
      }

      phase = "competencies";
      for (const id of removed) {
        if (landed.current.has(id)) continue;
        await actions.updateCompetency(id, { active: false });
        landed.current.add(id);
      }
      for (const source of COMPETENCY_PARTS) {
        const section = sections.sections.find(
          (one) => one.component === source,
        );
        if (!section) continue;
        for (const name of added[source] ?? []) {
          const key = `${source}|${name}`;
          if (landed.current.has(key)) continue;
          await actions.createCompetency({
            name,
            sectionId: section.id,
            scaleMax: 5,
          });
          landed.current.add(key);
        }
      }
      framework.reload();
      sections.reload();
      setStep(total - 1);
    } catch (caught) {
      if (
        phase === "parts" &&
        caught instanceof Error &&
        !serverSentence(caught)
      ) {
        setError(caught.message);
      } else if (phase === "competencies") {
        setError(
          `The weights are saved. ${actionMessage(caught, "the change to the competencies")} Press Save to finish the rest.`,
        );
      } else {
        const said = actionMessage(caught, "the setup");
        /* A refusal of the one write means nothing was written, which is the point
           of it being one write. A timeout means nobody can say, so it says nothing. */
        setError(
          serverSentence(caught) ? `${said} Nothing was changed.` : said,
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const next = () => {
    setError(null);
    if (step === total - 2) void save();
    else setStep(step + 1);
  };

  const addDraft = () => {
    const name = draft.trim();
    if (!name || !compSource) return;
    setAdded({ ...added, [compSource]: [...(added[compSource] ?? []), name] });
    setDraft("");
  };

  const chipsFor = (source: ScoreComponent) => {
    const sectionIds = sections.sections
      .filter((section) => section.component === source)
      .map((section) => section.id);
    const existing = framework.competencies.filter(
      (c) =>
        c.active &&
        !c.archived &&
        c.sectionId &&
        sectionIds.includes(c.sectionId),
    );
    return { existing, extra: added[source] ?? [] };
  };

  const title =
    kind === "parts"
      ? "What counts towards someone's score?"
      : kind === "weights"
        ? "How much does each count?"
        : kind === "done"
          ? "All set"
          : `What do you rate under ${nameOf(compSource ?? "CORE_COMPETENCY")}?`;

  return (
    <WizardShell
      open={open}
      onClose={onClose}
      step={step}
      total={total}
      title={title}
      onBack={() => setStep(step - 1)}
      onNext={next}
      canNext={
        kind === "parts"
          ? ticked.length > 0
          : kind === "weights"
            ? sum === 100 && empty === undefined
            : true
      }
      busy={saving}
      error={error}
      nextLabel={step === total - 2 ? "Save" : "Continue"}
      hideNext={kind === "done"}
    >
      {kind === "parts" && (
        <div className="grid gap-2">
          {choices.map((choice) => {
            const on = ticked.includes(choice.source);
            const blocked = projectsOff && choice.source === "TASKS";
            return (
              <button
                key={choice.source}
                type="button"
                aria-pressed={on}
                disabled={blocked}
                onClick={() => toggle(choice.source)}
                className={
                  "flex min-h-14 items-start justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed " +
                  (on
                    ? "border-accent bg-accent-soft text-accent-text"
                    : blocked
                      ? "border-line bg-sunken text-ink"
                      : "border-line bg-surface text-ink hover:border-accent")
                }
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span
                    className={
                      "text-body font-medium" + (blocked ? " text-muted" : "")
                    }
                  >
                    {choice.name}
                  </span>
                  {blocked ? (
                    <span className="text-body-sm text-muted">
                      Needs Projects, which is switched off for your company.
                      {tasksSaved
                        ? " What it was saved at counts for nothing now, and saving here takes it off your parts."
                        : ""}
                    </span>
                  ) : (
                    choice.description && (
                      <span className="text-body-sm text-muted">
                        {choice.description}
                      </span>
                    )
                  )}
                </span>
                {on && (
                  <Check aria-hidden="true" className="mt-1 size-4 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {kind === "weights" && (
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-10">
          <WeightsPie
            slices={ticked.map((source) => ({
              id: source,
              label: nameOf(source),
              percent: percent(source),
            }))}
          />
          <div className="flex flex-1 flex-col gap-3">
            {ticked.map((source, index) => (
              <label
                key={source}
                className="flex items-center justify-between gap-3"
              >
                <span className="flex items-center gap-2 text-body-md text-ink">
                  <span
                    aria-hidden="true"
                    className="size-2.5 rounded-full"
                    style={{ background: sliceColour(index) }}
                  />
                  {nameOf(source)}
                </span>
                <span className="w-28">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    suffix="%"
                    aria-label={nameOf(source)}
                    value={weights[source] ?? ""}
                    onChange={(event) => {
                      setTouched(true);
                      setWeights({ ...weights, [source]: event.target.value });
                    }}
                  />
                </span>
              </label>
            ))}
            {empty !== undefined && (
              <p role="status" className="text-body-sm text-warning-text">
                {nameOf(empty)} needs a share. Give it at least 1%, or take it
                off on the first page.
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                setTouched(false);
                setWeights(evenly(ticked));
              }}
              className="self-start text-body-sm text-accent-text hover:underline"
            >
              Split evenly
            </button>
          </div>
        </div>
      )}

      {kind === "competencies" && compSource && (
        <>
          <div className="flex flex-wrap gap-2">
            {chipsFor(compSource)
              .existing.filter((c) => !removed.has(c.id))
              .map((c) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  onRemove={() => setRemoved(new Set([...removed, c.id]))}
                />
              ))}
            {chipsFor(compSource).extra.map((name) => (
              <Chip
                key={name}
                label={name}
                onRemove={() =>
                  setAdded({
                    ...added,
                    [compSource]: (added[compSource] ?? []).filter(
                      (n) => n !== name,
                    ),
                  })
                }
              />
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              aria-label="Add one"
              placeholder="Add one"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                /* Enter adds the name; it does not move the wizard on. */
                event.preventDefault();
                event.stopPropagation();
                addDraft();
              }}
            />
            <Button type="button" variant="secondary" onClick={addDraft}>
              <Plus aria-hidden="true" className="size-4" />
              Add
            </Button>
          </div>
        </>
      )}

      {kind === "done" && (
        <div className="flex flex-col gap-3 sm:flex-row">
          <BigChoice selected onClick={() => onDone(true)}>
            Start an appraisal
          </BigChoice>
          <BigChoice onClick={() => onDone(false)}>Later</BigChoice>
        </div>
      )}
    </WizardShell>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface py-1.5 pl-3 pr-1.5 text-body-sm text-ink">
      {label}
      <button
        type="button"
        aria-label={`Remove ${label}`}
        onClick={onRemove}
        className="inline-flex size-5 items-center justify-center rounded-full text-muted hover:text-ink"
      >
        <X aria-hidden="true" className="size-3" />
      </button>
    </span>
  );
}

/**
 * Waits for what the company is scored on today, then starts from it.
 *
 * The weights are read here, once, and handed to the wizard: a component that
 * reads them itself renders first with no answer, and its starting state is set
 * on that first render. A read that fails says so and offers to try again, and
 * does not open the questions on defaults the company never chose: saving from
 * them would replace weights it never saw.
 */
export function SetupWizard(props: {
  open: boolean;
  onClose: () => void;
  onDone: (startPeriod: boolean) => void;
}) {
  const scoring = useScoringWeights();
  /* Held, because saving asks the hook to read again and a read in flight has no
     answer: without this the questions would be swapped for the loading screen
     in the middle of the save, and take what was typed with them. */
  const scored = useHeld(scoring.weights, scoring.weights !== null);
  if (!scored) {
    return (
      <WizardShell
        open={props.open}
        onClose={props.onClose}
        step={0}
        total={3}
        title="What counts towards someone's score?"
        hideNext
      >
        <LoadState
          loading={scoring.loading}
          error={scoring.error}
          subject="how scores are made up today"
          onRetry={scoring.reload}
          skeleton="list"
        >
          {null}
        </LoadState>
      </WizardShell>
    );
  }
  return <SetupWizardInner {...props} scoring={scoring} scored={scored} />;
}
