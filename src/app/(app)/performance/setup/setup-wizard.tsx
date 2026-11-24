"use client";

import { useMemo, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { BigChoice, WizardShell } from "@/components/performance/wizard-shell";
import { WeightsPie, sliceColour } from "@/components/performance/weights-pie";
import { performanceApi, type ScoreComponent } from "@/lib/api/performance";
import { actionMessage } from "@/lib/use-action";
import {
  useFramework,
  useFrameworkActions,
  useScoringParts,
  useScoringWeights,
  useSections,
} from "@/lib/store/performance";
import { splitEvenly } from "@/lib/performance/setup-weights";

/**
 * Setting appraisals up, once, one question to a screen.
 *
 * What counts towards a mark, how much each counts, and what is rated under each
 * competency part. Every screen is pre-filled, so a company happy with the
 * defaults presses Continue. Nothing is written until the last question has been
 * answered, and what is written is the company's own scoring parts and
 * competencies, the same ones Settings and Competency ratings edit afterwards.
 */

const CHOICES: { source: ScoreComponent; label: string }[] = [
  { source: "OBJECTIVES", label: "Objectives they delivered" },
  { source: "CORE_COMPETENCY", label: "Core competencies" },
  { source: "BEHAVIOURAL_COMPETENCY", label: "Behaviour" },
  { source: "LEADERSHIP", label: "Leadership" },
  { source: "MANAGER_APPRAISAL", label: "Manager's overall rating" },
  { source: "SELF_ASSESSMENT", label: "Their own rating" },
  { source: "TASKS", label: "Tasks done" },
];

const COMPETENCY_PARTS: ScoreComponent[] = [
  "CORE_COMPETENCY",
  "BEHAVIOURAL_COMPETENCY",
  "LEADERSHIP",
];

const DEFAULT_TICKED: ScoreComponent[] = [
  "OBJECTIVES",
  "CORE_COMPETENCY",
  "BEHAVIOURAL_COMPETENCY",
  "LEADERSHIP",
];

const labelOf = (source: ScoreComponent) =>
  CHOICES.find((choice) => choice.source === source)?.label ?? source;

function SetupWizardInner({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  /** Called after everything is saved, when the person chooses to start an appraisal. */
  onDone: (startPeriod: boolean) => void;
}) {
  const parts = useScoringParts();
  const sections = useSections();
  const framework = useFramework();
  const actions = useFrameworkActions();

  /* What the company is scored on today, whether or not it ever saved its own
     parts: a company on the built-in weights sees those, not an even split. */
  const scoring = useScoringWeights();
  const current = (scoring.weights?.rows ?? []).filter(
    (row) => row.isPart !== false && row.weightBp > 0,
  );
  const [ticked, setTicked] = useState<ScoreComponent[]>(() =>
    current.length > 0 ? current.map((row) => row.component) : DEFAULT_TICKED,
  );
  const [weights, setWeights] = useState<
    Partial<Record<ScoreComponent, string>>
  >(() =>
    current.length > 0
      ? Object.fromEntries(
          current.map((row) => [
            row.component,
            String(Math.round(row.weightBp / 100)),
          ]),
        )
      : Object.fromEntries(
          Object.entries(splitEvenly(DEFAULT_TICKED)).map(([k, v]) => [
            k,
            String(v),
          ]),
        ),
  );
  const [touched, setTouched] = useState(false);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<Partial<Record<ScoreComponent, string[]>>>(
    {},
  );
  const [draft, setDraft] = useState("");
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const competencySteps = useMemo(
    () =>
      COMPETENCY_PARTS.filter(
        (source) =>
          ticked.includes(source) &&
          sections.sections.some((section) => section.component === source),
      ),
    [ticked, sections.sections],
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

  const toggle = (source: ScoreComponent) => {
    const next = ticked.includes(source)
      ? ticked.filter((one) => one !== source)
      : [...ticked, source];
    setTicked(next);
    if (!touched) {
      setWeights(
        Object.fromEntries(
          Object.entries(splitEvenly(next)).map(([k, v]) => [k, String(v)]),
        ),
      );
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const have = new Map(
        (await performanceApi.scoringParts()).parts.map((part) => [
          part.source,
          part,
        ]),
      );
      for (const source of ticked) {
        const weightBp = percent(source) * 100;
        const existing = have.get(source);
        if (existing) {
          if (existing.weightBp !== weightBp) {
            await parts.update(existing.id, { weightBp });
          }
        } else {
          await parts.add({ source, name: labelOf(source), weightBp });
        }
      }
      const fresh = await performanceApi.scoringParts();
      for (const part of fresh.parts) {
        if (!ticked.includes(part.source)) await parts.remove(part.id);
      }
      for (const id of removed) {
        await actions.updateCompetency(id, { active: false });
      }
      for (const source of COMPETENCY_PARTS) {
        const section = sections.sections.find(
          (one) => one.component === source,
        );
        if (!section) continue;
        for (const name of added[source] ?? []) {
          await actions.createCompetency({
            name,
            sectionId: section.id,
            scaleMax: 5,
          });
        }
      }
      framework.reload();
      sections.reload();
      setStep(total - 1);
    } catch (caught) {
      setError(actionMessage(caught, "the setup"));
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
          : `What do you rate under ${labelOf(compSource ?? "CORE_COMPETENCY")}?`;

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
            ? sum === 100
            : true
      }
      busy={saving}
      error={error}
      nextLabel={step === total - 2 ? "Save" : "Continue"}
      hideNext={kind === "done"}
    >
      {kind === "parts" && (
        <div className="grid gap-2 sm:grid-cols-2">
          {CHOICES.map((choice) => {
            const on = ticked.includes(choice.source);
            return (
              <button
                key={choice.source}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(choice.source)}
                className={
                  "flex min-h-14 items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-body font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 " +
                  (on
                    ? "border-accent bg-accent-soft text-accent-text"
                    : "border-line bg-surface text-ink hover:border-accent")
                }
              >
                {choice.label}
                {on && <Check aria-hidden="true" className="size-4" />}
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
              label: labelOf(source),
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
                  {labelOf(source)}
                </span>
                <span className="w-28">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    suffix="%"
                    aria-label={labelOf(source)}
                    value={weights[source] ?? ""}
                    onChange={(event) => {
                      setTouched(true);
                      setWeights({ ...weights, [source]: event.target.value });
                    }}
                  />
                </span>
              </label>
            ))}
            <button
              type="button"
              onClick={() => {
                setTouched(false);
                setWeights(
                  Object.fromEntries(
                    Object.entries(splitEvenly(ticked)).map(([k, v]) => [
                      k,
                      String(v),
                    ]),
                  ),
                );
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
 * Waits for what the company already has, so a company coming back to change
 * its marks sees its own parts and weights rather than the defaults.
 */
export function SetupWizard(props: {
  open: boolean;
  onClose: () => void;
  onDone: (startPeriod: boolean) => void;
}) {
  const parts = useScoringParts();
  const scoring = useScoringWeights();
  /* Keyed on whether the weights have arrived, so the first screen is built from
     them even if they land a moment after it opens. */
  return (
    <SetupWizardInner
      key={`${scoring.weights ? "w" : "-"}${parts.parts ? "p" : "-"}`}
      {...props}
    />
  );
}
