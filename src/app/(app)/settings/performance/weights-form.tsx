"use client";

import { sourceNote } from "@/lib/demo";
import { useState } from "react";
import { Info, Lock, RotateCcw } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  Field,
  Input,
  Textarea,
  Spinner,
  Tabs,
  TextLink,
  useToast,
} from "@/components/ui";
import type { TabItem } from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { useUrlTab } from "@/hooks/use-url-tab";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import {
  FULL_WEIGHT_BP,
  scoringWeightProblem,
  shareOfTotalBp,
  weightLabel,
  weightSetFromRows,
  type ApiScoringWeights,
  type ScoreComponent,
} from "@/lib/api/performance";
import { SavedWeightsNote } from "@/components/performance/saved-weights-note";
import { useCan } from "@/lib/permissions";
import { useScoringWeights } from "@/lib/store/performance";
import { OverallMarkCard } from "./overall-mark-card";
import { SCORING_TABS, type ScoringTabId } from "./tabs";

const TAB_ITEMS: TabItem[] = [
  { id: "weights", label: "Weights" },
  { id: "marks", label: "Names of marks" },
];

/**
 * How much each part of an appraisal counts.
 *
 * ## Proportional weights, saved as one set
 *
 * The weights need not make 100%. Each part counts in proportion to the total,
 * so 2, 1 and 1 are 50%, 25% and 25% of a mark, and each row shows the share it
 * comes to. The one set refused is every part at zero, locally in the server's
 * own words (`scoringWeightProblem`) as well as by the server.
 * `PUT /performance/scoring-weights` still takes the **whole set**, names
 * included, so a company's set is never half-saved.
 *
 * ## The parts' names are the company's
 *
 * Each part can be renamed. An empty name goes back to the built-in one. A
 * period freezes the names with the weights when it starts, so renaming a part
 * never re-words a period already running.
 *
 * ## Integers, in basis points
 *
 * The draft holds the text somebody typed and every derived figure is an integer
 * number of basis points. Nothing here divides a weight, and nothing computes
 * anybody's score — the composite lives in the API, once, and a second
 * implementation on this side is how two screens end up disagreeing about the
 * same person. The one piece of arithmetic on this page is the self-assessment
 * sentence, and it is a multiplication over a hypothetical rather than anybody's
 * mark.
 */

/**
 * One basis point, which is the smallest weight the API can hold.
 *
 * Not `1`: a whole-percent step would make 33.33% untypeable with the arrows.
 * `toBp`
 * rounds to the same resolution, so nothing a field can produce is a figure the
 * payload has to lose.
 */
const STEP = "0.01";

/**
 * What each component is scored from, for an API from before descriptions were
 * editable. The API now sends each part's description (the company's own, or
 * this same built-in text), and that is what the screen shows and edits.
 */
const COMPONENT_SOURCE: Record<ScoreComponent, string> = {
  OBJECTIVES:
    "Progress on the objectives agreed for the cycle. Draft and unapproved ones are not read.",
  TASKS:
    "How the weekly tasks graded against this period's objectives were rated. Starts at 0%.",
  CORE_COMPETENCY: "Ratings against competencies filed under Core competency.",
  BEHAVIOURAL_COMPETENCY:
    "Ratings against competencies filed under Behavioural competency.",
  LEADERSHIP:
    "Ratings under Leadership, and only for people who lead others: somebody reports to them, they lead a team, or they head a department.",
  MANAGER_APPRAISAL:
    "The overall mark each appraiser gave, weighted by their share when a person has more than one. Starts at 0%.",
  SELF_ASSESSMENT:
    "How somebody rated themselves: their overall mark if they gave one, otherwise their own answers to the rated subsections their manager answers too.",
};

/** A part's description as the API has it, or the built-in text from an older API. */
const savedDescription = (row: {
  component: ScoreComponent;
  description?: string;
}): string => row.description ?? COMPONENT_SOURCE[row.component];

/** The built-in description, to go back to when the box is cleared. */
const builtInDescription = (row: {
  component: ScoreComponent;
  defaultDescription?: string;
}): string => row.defaultDescription ?? COMPONENT_SOURCE[row.component];

/** Percent text to integer basis points. Never a float in the payload. */
function toBp(text: string): number {
  const value = Number(text);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(FULL_WEIGHT_BP, Math.round(value * 100)));
}

/** Basis points back to the text a field shows. */
function toText(bp: number): string {
  return String(bp / 100);
}

function invalid(text: string): boolean {
  const value = Number(text);
  return (
    text.trim() === "" || !Number.isFinite(value) || value < 0 || value > 100
  );
}

type Draft = {
  weights: Record<ScoreComponent, string>;
  labels: Record<ScoreComponent, string>;
  descriptions: Record<ScoreComponent, string>;
};

const draftFrom = (weights: ApiScoringWeights): Draft =>
  weights.rows.reduce<Draft>(
    (out, row) => ({
      weights: { ...out.weights, [row.component]: toText(row.weightBp) },
      labels: { ...out.labels, [row.component]: row.label },
      descriptions: {
        ...out.descriptions,
        [row.component]: savedDescription(row),
      },
    }),
    { weights: {}, labels: {}, descriptions: {} } as Draft,
  );

/** A part's name as it would be saved: trimmed, and the built-in one when blank. */
const nameOf = (
  typed: string | undefined,
  row: { label: string; defaultLabel?: string },
): string => {
  const trimmed = (typed ?? row.label).trim();
  return trimmed === "" ? (row.defaultLabel ?? row.label) : trimmed;
};

export function ScoringWeightsForm({
  scale,
  initialTab = "weights",
}: {
  /** The "what a mark is called" form, shown on its own tab. */
  scale: React.ReactNode;
  initialTab?: ScoringTabId;
}) {
  const [tab, changeTab] = useUrlTab<ScoringTabId>(initialTab, SCORING_TABS);
  const canManage = useCan("MANAGE_SETTINGS");
  const { weights, loading, error, source, editable, refusal, save, reload } =
    useScoringWeights();
  const toast = useToast();

  /* Keyed by the set it was started from, so weights arriving or changing
     underneath replace the draft instead of being edited blind. No setState in
     an effect, and no stale form after a save. Same shape as
     `/settings/overtime`. */
  const [edited, setEdited] = useState<{
    from: ApiScoringWeights;
    value: Draft;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const draft: Draft | null =
    weights === null
      ? null
      : edited && edited.from === weights
        ? edited.value
        : draftFrom(weights);

  const set = (component: ScoreComponent, text: string) => {
    if (weights === null || draft === null) return;
    setEdited({
      from: weights,
      value: { ...draft, weights: { ...draft.weights, [component]: text } },
    });
  };

  const rename = (component: ScoreComponent, text: string) => {
    if (weights === null || draft === null) return;
    setEdited({
      from: weights,
      value: { ...draft, labels: { ...draft.labels, [component]: text } },
    });
  };

  const describe = (component: ScoreComponent, text: string) => {
    if (weights === null || draft === null) return;
    setEdited({
      from: weights,
      value: {
        ...draft,
        descriptions: { ...draft.descriptions, [component]: text },
      },
    });
  };

  const rows = weights?.rows ?? [];
  const entries = rows.map((row) => ({
    ...row,
    text: draft?.weights[row.component] ?? "0",
    weightBp: toBp(draft?.weights[row.component] ?? "0"),
    name: draft?.labels[row.component] ?? row.label,
    about: draft?.descriptions[row.component] ?? savedDescription(row),
  }));
  const totalBp = entries.reduce((sum, row) => sum + row.weightBp, 0);
  const problem = scoringWeightProblem(entries);
  const anyInvalid = entries.some((row) => invalid(row.text));
  const renamed = entries.filter((row) => nameOf(row.name, row) !== row.label);
  /* A blank description goes back to the built-in one, the same as a name. */
  const redescribed = entries.filter(
    (row) =>
      (row.about.trim() === "" ? builtInDescription(row) : row.about.trim()) !==
      savedDescription(row),
  );
  /* Whether any weight, as typed, differs from the saved one. What the API says
     about the Manager appraisal weight depends on the weights beside it too, so
     it is said to be about the saved set whenever any of them has moved. */
  const weightsMoved = entries.some(
    (row) =>
      row.weightBp !==
      (weights?.rows.find((saved) => saved.component === row.component)
        ?.weightBp ?? 0),
  );
  const dirty = renamed.length > 0 || redescribed.length > 0 || weightsMoved;
  /* Whether this server has the Manager appraisal part at all: it sends a row
     for it. A server that predates it sends none, and nothing here is drawn or
     sent for a part it has not heard of. */
  const managerAppraisalLabel =
    rows.find((row) => row.component === "MANAGER_APPRAISAL")?.label ?? null;

  /* The gap a self-rating can move, expressed once. A person who rates
     themselves 5 out of 5 instead of 3 out of 5 moves that component by half its
     range — 5000 of 10000 basis points — so the effect on the final mark is half
     the component's share. Integer arithmetic on a hypothetical, not a score. */
  const selfBp = entries.find((row) => row.component === "SELF_ASSESSMENT");
  const selfShareBp = shareOfTotalBp(selfBp?.weightBp ?? 0, totalBp);
  const selfSwingBp = Math.round(selfShareBp / 2);
  const savedTotalBp = (weights?.rows ?? []).reduce(
    (sum, row) => sum + row.weightBp,
    0,
  );
  const savedSelfBp = shareOfTotalBp(
    weights?.rows.find((row) => row.component === "SELF_ASSESSMENT")
      ?.weightBp ?? 0,
    savedTotalBp,
  );

  const onSave = async () => {
    if (draft === null) return;
    setSaving(true);
    try {
      /* Every part the server has always had, even when its rows did not carry
         one (Weekly tasks is sent so a save can never leave the set one key
         short), and Manager appraisal only when the server sent a row for it:
         a part it has not heard of is left out, never written as 0. */
      const payload = weightSetFromRows(entries);
      /* Only the parts whose name changed: one left out keeps its name, and a
         blank goes back to the built-in one (the API reads "" that way). */
      const labels = Object.fromEntries(
        renamed.map((row) => [row.component, row.name.trim()]),
      ) as Partial<Record<ScoreComponent, string>>;
      /* Only the descriptions that changed, the same rule as the names. */
      const descriptions = Object.fromEntries(
        redescribed.map((row) => [row.component, row.about.trim()]),
      ) as Partial<Record<ScoreComponent, string>>;
      const saved =
        redescribed.length > 0
          ? await save(
              payload,
              renamed.length > 0 ? labels : undefined,
              descriptions,
            )
          : renamed.length > 0
            ? await save(payload, labels)
            : await save(payload);
      setEdited(null);
      toast.push({
        tone: "success",
        title: "Weights saved",
        /* The API names the running cycles this cannot reach. Naming them beats
           the general rule: "periods keep their own weights" has to be taken on
           trust, and "H2 2026 appraisal keeps its own" can be checked. */
        detail:
          saved.frozenCycles.length === 0
            ? "This applies to the next appraisal period you start."
            : `${saved.frozenCycles.join(", ")} ${saved.frozenCycles.length === 1 ? "keeps the weights it" : "keep the weights they"} started with, so no mark already awarded moves. This applies to the next appraisal period you start.`,
      });
    } catch (caught) {
      toast.push({
        tone: "danger",
        title: "That did not save",
        detail:
          caught instanceof ApiError
            ? caught.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Appraisal scoring"
        breadcrumb={[{ href: "/settings", label: "Settings" }]}
        meta={
          <>
            {sourceNote(source === "api") && (
              <Badge tone="warning" size="sm" dot>
                {sourceNote(source === "api")}
              </Badge>
            )}
            {weights && (
              <Badge
                tone={weights.source === "saved" ? "accent" : "neutral"}
                size="sm"
              >
                {weights.source === "saved"
                  ? "Set by your company"
                  : "Our recommended set"}
              </Badge>
            )}
          </>
        }
      />

      <PageBody className="flex flex-col gap-6">
        {/* Two tabs because they are two halves of one question: how a mark is
            assembled, and what the result is called. Both stay mounted and the
            other is hidden, so a half-typed weight survives a look at the names
            and the other way round. */}
        <Tabs items={TAB_ITEMS} value={tab} onChange={changeTab}>
          <div hidden={tab !== "weights"} className="flex flex-col gap-6">
            <LoadFailure subject="the scoring weights" error={error} />

            {loading ? (
              <span className="flex items-center gap-2 text-body-sm text-muted">
                <Spinner size="sm" />
                Reading the weights
              </span>
            ) : draft === null ? (
              <Callout tone="warning" title="No weights to show">
                The scoring weights could not be read, so nothing is rendered
                here rather than a set that might not be yours.
              </Callout>
            ) : (
              <>
                <Callout tone="info" title="What these weights do">
                  <p>
                    A mark is the weighted average of the parts below. The
                    weights do not have to make 100%: each part counts in
                    proportion to the total, so weights of 2, 1 and 1 come to
                    50%, 25% and 25% of a mark. The share each part comes to is
                    shown beside it. You can rename any part, and set one to 0%
                    to leave it out of the mark.
                  </p>
                  <p className="mt-2">
                    A part with{" "}
                    <strong>nothing recorded against it is left out</strong> and
                    the rest are spread over the whole mark. Somebody who
                    manages nobody is not rated on leadership, and they are not
                    scored nought for it either: those are different claims
                    about a person.
                  </p>
                </Callout>

                {!editable && (
                  <Callout tone="warning" title="Saving needs the API">
                    <p>{refusal}</p>
                  </Callout>
                )}
                {editable && !canManage && (
                  <Callout
                    tone="info"
                    title="Changing these needs settings permission"
                  >
                    <p>
                      How much each part counts decides pay, so it sits behind
                      the same permission as the rest of company configuration.
                      You can read the set: a scale you are measured against and
                      not allowed to read would be an odd thing to ship.
                    </p>
                  </Callout>
                )}

                <Card>
                  <CardHeader
                    title="The parts of a mark"
                    description="Each part counts in proportion to the total. Rename any part, or set it to 0% to leave it out."
                    action={<Total totalBp={totalBp} />}
                  />
                  <CardBody className="flex flex-col gap-5">
                    <p className="text-meta text-muted">
                      This is the starting point for new appraisal periods.
                    </p>
                    {entries.map((row) => (
                      <div
                        key={row.component}
                        data-part={row.component}
                        className="grid gap-3 sm:grid-cols-[1fr_9rem] sm:items-start"
                      >
                        <div className="flex min-w-0 flex-col gap-1.5">
                          {canManage && editable ? (
                            <Field
                              label="Part name"
                              help={
                                row.defaultLabel &&
                                row.defaultLabel !== nameOf(row.name, row)
                                  ? `Built-in name: ${row.defaultLabel}. Clear the box to go back to it.`
                                  : undefined
                              }
                            >
                              <Input
                                value={row.name}
                                maxLength={60}
                                placeholder={row.defaultLabel ?? row.label}
                                onChange={(event) => {
                                  const next = event.target.value;
                                  rename(row.component, next);
                                }}
                              />
                            </Field>
                          ) : (
                            <p className="text-body-sm font-medium text-ink">
                              {row.label}
                            </p>
                          )}
                          {canManage && editable ? (
                            <Field
                              label="Description"
                              help={
                                row.about.trim() !== builtInDescription(row)
                                  ? "Clear the box to go back to the built-in description."
                                  : undefined
                              }
                            >
                              <Textarea
                                rows={2}
                                maxLength={300}
                                value={row.about}
                                placeholder={builtInDescription(row)}
                                onChange={(event) =>
                                  describe(row.component, event.target.value)
                                }
                              />
                            </Field>
                          ) : (
                            <p className="text-meta text-muted">
                              {savedDescription(row)}
                            </p>
                          )}
                          <p className="tabular text-meta text-muted">
                            {row.weightBp === 0
                              ? "Left out of the mark"
                              : `${weightLabel(shareOfTotalBp(row.weightBp, totalBp))} of a mark`}
                          </p>
                          {/* What this weight does to a mark, in the API's own
                              words, beside the weight that causes it: that a
                              manager's judgement then reaches the score both
                              through the levels they record and through this
                              overall mark. Nothing here writes a sentence of
                              its own about it. It is about the **saved** set,
                              and says so whenever a weight has been moved. */}
                          {row.component === "MANAGER_APPRAISAL" &&
                            weights?.managerAppraisalNote && (
                              <SavedWeightsNote
                                note={weights.managerAppraisalNote}
                                moved={weightsMoved}
                              />
                            )}
                        </div>
                        {canManage && editable ? (
                          <Field
                            label="Weight"
                            {...(invalid(row.text)
                              ? { error: "A number between 0 and 100." }
                              : {})}
                          >
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              step={STEP}
                              suffix="%"
                              value={row.text}
                              onChange={(event) => {
                                /* Read the value before any updater runs: React
                               nulls `currentTarget` once the event finishes
                               dispatching, and this crashed the payroll
                               settings form once. */
                                const next = event.target.value;
                                set(row.component, next);
                              }}
                            />
                          </Field>
                        ) : (
                          <p className="tabular text-body-sm font-medium text-ink sm:pt-1.5 sm:text-right">
                            {weightLabel(row.weightBp)}
                          </p>
                        )}
                      </div>
                    ))}
                  </CardBody>
                </Card>

                <SelfAssessment
                  note={weights?.selfAssessmentNote ?? ""}
                  weightBp={selfShareBp}
                  savedWeightBp={savedSelfBp}
                  swingBp={selfSwingBp}
                />

                <Card>
                  <CardHeader
                    title="A change here does not move a period that has started"
                    description="The same rule payroll uses for its settings snapshot."
                  />
                  <CardBody className="flex flex-col gap-3 text-body-sm text-body">
                    <p>
                      When a period starts, the weights are copied onto it.
                      Changing them afterwards cannot move a mark that has
                      already been awarded: a rating from this quarter has to
                      keep explaining itself against the weights that produced
                      it, years later.
                    </p>
                    <p className="flex items-start gap-2 text-body-sm text-body">
                      <Lock
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-faint"
                      />
                      {/* One element, not loose text and a link. The paragraph is a
                      flex row so the lock sits beside the words, and a flex row
                      turns every direct child into its own column: the sentence
                      used to render as three blocks side by side, with the link
                      alone in the middle one. */}
                      <span className="min-w-0">
                        A period screen says whether its weights are frozen, and{" "}
                        <TextLink href="/performance">
                          the appraisals tab
                        </TextLink>{" "}
                        is where appraisal periods are started.
                      </span>
                    </p>
                  </CardBody>
                </Card>

                {canManage && editable && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4">
                    <div className="min-w-0">
                      {problem ? (
                        <p className="text-body-sm text-warning-text">
                          {problem}
                        </p>
                      ) : dirty ? (
                        <p className="text-body-sm text-muted">
                          Saving replaces the whole set, names included.
                        </p>
                      ) : (
                        <p className="text-body-sm text-muted">
                          Nothing changed. This is the set a new period starts
                          with.
                        </p>
                      )}
                    </div>
                    {/* No `shrink-0`: it held this group at its full width, so on a
                    320px phone the two buttons ran 23px out of the card instead
                    of the second one wrapping under the first. */}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        disabled={!dirty || saving}
                        onClick={() => setEdited(null)}
                      >
                        <RotateCcw aria-hidden="true" className="size-4" />
                        Discard
                      </Button>
                      <Button
                        variant="accent"
                        loading={saving}
                        disabled={problem !== null || anyInvalid || !dirty}
                        onClick={() => void onSave()}
                      >
                        Save the whole set
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <div hidden={tab !== "marks"} className="flex flex-col gap-6">
            {/* First, because it decides whether the names below are ever
                offered on a form. */}
            <OverallMarkCard
              connected={source === "api"}
              onChanged={reload}
              managerAppraisalLabel={managerAppraisalLabel}
            />
            {scale}
          </div>
        </Tabs>
      </PageBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The running total. Any total above zero makes a mark, since weights are
 * proportional, so only zero is shown as a problem.
 */
function Total({ totalBp }: { totalBp: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="text-meta text-muted">Total</span>
      <Badge tone={totalBp > 0 ? "neutral" : "danger"} size="md" dot>
        {weightLabel(totalBp)}
      </Badge>
    </span>
  );
}

/**
 * What turning self-assessment on does to a mark, stated on the screen.
 *
 * `PERFORMANCE.md` §4.3 is explicit that this reasoning belongs here rather than
 * in a document nobody administering the product will read. The incumbent's
 * shipped formula gives an employee's own rating 20% of their official score, so
 * two people who delivered identically get different marks according to how
 * generously they rated themselves — and "your score is lower because you were
 * more modest about yourself" is not an answer anybody can defend.
 *
 * The figure is live, because the argument is much less persuasive in the
 * abstract than as "10 percentage points of somebody's mark".
 *
 * ## The draft and the saved value are labelled apart
 *
 * They have to be. `selfAssessmentNote` is the API's sentence about what is
 * **saved**; the badge and the warning are about the **draft**. Rendering both
 * unlabelled put "Counting for 20%" directly above "Self-assessment is weighted
 * at 0%… it does not change the score" — two mutually exclusive claims on one
 * screen, which is precisely the defect `PERFORMANCE.md` §1.1 catalogues on the
 * incumbent's own weights page ("Weights are properly configured" above "No
 * Active Review Cycle", with the save button live). Caught in a browser, not by
 * a type.
 */
function SelfAssessment({
  note,
  weightBp,
  savedWeightBp,
  swingBp,
}: {
  note: string;
  weightBp: number;
  savedWeightBp: number;
  swingBp: number;
}) {
  const on = weightBp > 0;
  const changed = weightBp !== savedWeightBp;

  return (
    <Card>
      <CardHeader
        title="Self-assessment"
        description="Whether it counts is the decision on this screen."
        action={
          <Badge tone={on ? "warning" : "neutral"} size="sm" dot>
            {on
              ? `${changed ? "Would count for" : "Counting for"} ${weightLabel(weightBp)}`
              : changed
                ? "Would not count"
                : "Not counted"}
          </Badge>
        }
      />
      <CardBody className="flex flex-col gap-3">
        {/* The API's own sentence about the **saved** value, said to be that
            whenever the draft has moved away from it. */}
        <p className="flex items-start gap-2 text-body-sm text-body">
          <Info
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-faint"
          />
          <span>
            {changed && (
              <span className="font-medium text-ink">
                Saved now, not yet changed:{" "}
              </span>
            )}
            {note}
          </span>
        </p>

        {on ? (
          <p className="text-body-sm text-muted">
            {changed ? "If you save this: at" : "At"} {weightLabel(weightBp)},
            somebody who rates themselves 5 out of 5 rather than 3 out of 5
            moves their own final mark by {weightLabel(swingBp)}, more if any
            other part has nothing recorded against it, because the remaining
            weights are spread over the whole mark. Two people who delivered
            identically will not get the same mark.
          </p>
        ) : (
          <p className="text-body-sm text-body">
            Set this above 0% and an employee&apos;s own opinion of themselves
            becomes part of the mark used to decide confirmation, promotion and
            bonus. It rewards confidence over delivery, and it cannot be
            explained to the person who rated themselves honestly.
          </p>
        )}

        <DescriptionList
          columns={2}
          items={[
            {
              term: "What we do instead",
              value:
                "Their own answers are shown beside the manager's, so the gap between them is visible and can be discussed.",
            },
            {
              term: "Why it is a setting at all",
              value:
                "A company that insists can weight it. It is off by default, deliberately, and this screen says what turning it on costs.",
            },
          ]}
        />
      </CardBody>
    </Card>
  );
}
