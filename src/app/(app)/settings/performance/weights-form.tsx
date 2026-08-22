"use client";

import { useState } from "react";
import Link from "next/link";
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
  Spinner,
  useToast,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import {
  FULL_WEIGHT_BP,
  scoringWeightProblem,
  weightLabel,
  type ApiScoringWeights,
  type ScoreComponent,
} from "@/lib/api/performance";
import { useCan } from "@/lib/permissions";
import { useScoringWeights } from "@/lib/store/performance";

/**
 * How much each part of an appraisal counts.
 *
 * ## Why this is one form and not five fields
 *
 * The API refuses any set that does not total exactly 10000 basis points, so a
 * field-at-a-time form would be unsubmittable at every intermediate state: move
 * objectives from 40% to 30% and the set is at 90% until the second field is
 * saved, and there is no second save. `PUT /performance/scoring-weights` takes
 * the **whole set** for that reason, and this screen is shaped by that endpoint
 * rather than in spite of it.
 *
 * That is also why there is no *Resolve weights* button here. The incumbent ships
 * one, and an `Avg Weight Used` column beside it, because their weights are
 * allowed to drift out of balance and then need patching after the fact — and a
 * mark assembled from weights that drifted is exactly the indefensible artefact
 * this module exists to beat. There is never an unbalanced state to resolve.
 *
 * ## The running total is the whole interface
 *
 * It is the first thing rendered and it refuses locally in the server's own
 * words, character for character (`scoringWeightProblem`). Checking here as well
 * as on the server, never instead of it: the server is where the rule is real,
 * and this exists so nobody meets the refusal by surprise after pressing Save.
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
 * Not `1`: a whole-percent step would make 33.33% untypeable with the arrows,
 * and a three-way split has to be reachable or the rule that the set totals
 * exactly 100% becomes a rule that only round numbers can satisfy. `toBp`
 * rounds to the same resolution, so nothing a field can produce is a figure the
 * payload has to lose.
 */
const STEP = "0.01";

/**
 * What each component is scored from. One line, in the words a manager uses.
 *
 * Deliberately **not** a second copy of the labels: `ApiScoringWeights.rows`
 * carries the label the API sends and this screen renders that. What is here is
 * the *provenance* of each figure, which the API has no field for and which is
 * the thing somebody deciding a weight actually needs to know.
 */
const COMPONENT_SOURCE: Record<ScoreComponent, string> = {
  OBJECTIVES:
    "Progress on the objectives agreed for the cycle. Draft and unapproved ones are not read.",
  CORE_COMPETENCY: "Ratings against competencies filed under Core competency.",
  BEHAVIOURAL_COMPETENCY:
    "Ratings against competencies filed under Behavioural competency.",
  LEADERSHIP:
    "Ratings under Leadership, and only for people who manage others or lead a team.",
  SELF_ASSESSMENT: "The overall rating somebody gave themselves on their own form.",
};

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
  return text.trim() === "" || !Number.isFinite(value) || value < 0 || value > 100;
}

type Draft = Record<ScoreComponent, string>;

const draftFrom = (weights: ApiScoringWeights): Draft =>
  weights.rows.reduce<Draft>(
    (out, row) => ({ ...out, [row.component]: toText(row.weightBp) }),
    {} as Draft,
  );

export function ScoringWeightsForm() {
  const canManage = useCan("MANAGE_SETTINGS");
  const { weights, loading, error, source, editable, refusal, save } =
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
    setEdited({ from: weights, value: { ...draft, [component]: text } });
  };

  const rows = weights?.rows ?? [];
  const entries = rows.map((row) => ({
    ...row,
    text: draft?.[row.component] ?? "0",
    weightBp: toBp(draft?.[row.component] ?? "0"),
  }));
  const totalBp = entries.reduce((sum, row) => sum + row.weightBp, 0);
  const problem = scoringWeightProblem(entries);
  const anyInvalid = entries.some((row) => invalid(row.text));
  const dirty = entries.some(
    (row) =>
      row.weightBp !==
      (weights?.rows.find((saved) => saved.component === row.component)?.weightBp ??
        0),
  );

  /* The gap a self-rating can move, expressed once. A person who rates
     themselves 5 out of 5 instead of 3 out of 5 moves that component by half its
     range — 5000 of 10000 basis points — so the effect on the final mark is half
     the component's weight. Integer arithmetic on a hypothetical, not a score. */
  const selfBp = entries.find((row) => row.component === "SELF_ASSESSMENT");
  const selfSwingBp = Math.round((selfBp?.weightBp ?? 0) / 2);

  const onSave = async () => {
    if (draft === null) return;
    setSaving(true);
    try {
      const payload = entries.reduce<Record<ScoreComponent, number>>(
        (out, row) => ({ ...out, [row.component]: row.weightBp }),
        {} as Record<ScoreComponent, number>,
      );
      const saved = await save(payload);
      setEdited(null);
      toast.push({
        tone: "success",
        title: "Weights saved",
        /* The API names the running cycles this cannot reach. Naming them beats
           the general rule: "cycles keep their own weights" has to be taken on
           trust, and "H2 2026 appraisal keeps its own" can be checked. */
        detail:
          saved.frozenCycles.length === 0
            ? "This applies to the next cycle you start."
            : `${saved.frozenCycles.join(", ")} ${saved.frozenCycles.length === 1 ? "keeps the weights it" : "keep the weights they"} started with, so no mark already awarded moves. This applies to the next cycle you start.`,
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
        description="How much each part of an appraisal counts towards somebody's mark."
        breadcrumb={[{ href: "/settings", label: "Settings" }]}
        meta={
          <>
            <Badge tone={source === "api" ? "success" : "warning"} size="sm" dot>
              {source === "api"
                ? "Live from the API"
                : "Demo data, this browser only"}
            </Badge>
            {weights && (
              <Badge tone={weights.source === "saved" ? "accent" : "neutral"} size="sm">
                {weights.source === "saved"
                  ? "Set by your company"
                  : "Our recommended set"}
              </Badge>
            )}
          </>
        }
      />

      <PageBody className="flex flex-col gap-6">
        {error && (
          <Callout tone="danger" title="Could not read the weights">
            {error.message}
          </Callout>
        )}

        {loading ? (
          <span className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Reading the weights
          </span>
        ) : draft === null ? (
          <Callout tone="warning" title="No weights to show">
            The scoring weights could not be read, so nothing is rendered here
            rather than a set that might not be yours.
          </Callout>
        ) : (
          <>
            <Callout tone="info" title="What these weights do">
              <p>
                A mark is the weighted average of the parts below. They have to
                make 100% exactly, checked when they are saved, so there is never
                an unbalanced set to patch up afterwards.
              </p>
              <p className="mt-2">
                A part with <strong>nothing recorded against it is left out</strong>{" "}
                and the rest are spread over the whole mark. Somebody who manages
                nobody is not rated on leadership, and they are not scored nought
                for it either — those are different claims about a person.
              </p>
            </Callout>

            {!editable && (
              <Callout tone="warning" title="Saving needs the API">
                <p>{refusal}</p>
              </Callout>
            )}
            {editable && !canManage && (
              <Callout tone="info" title="Changing these needs settings permission">
                <p>
                  How much each part counts decides pay, so it sits behind the
                  same permission as the rest of company configuration. You can
                  read the set — a scale you are measured against and not allowed
                  to read would be an odd thing to ship.
                </p>
              </Callout>
            )}

            <Card>
              <CardHeader
                title="The parts of a mark"
                description="Percentages. They must total 100% exactly."
                action={<Total totalBp={totalBp} />}
              />
              <CardBody className="flex flex-col gap-5">
                {entries.map((row) => (
                  <div
                    key={row.component}
                    className="grid gap-3 sm:grid-cols-[1fr_9rem] sm:items-start"
                  >
                    <div className="min-w-0">
                      <p className="text-body-sm font-medium text-ink">{row.label}</p>
                      <p className="mt-0.5 text-meta text-muted">
                        {COMPONENT_SOURCE[row.component]}
                      </p>
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
              weightBp={selfBp?.weightBp ?? 0}
              savedWeightBp={
                weights?.rows.find((row) => row.component === "SELF_ASSESSMENT")
                  ?.weightBp ?? 0
              }
              swingBp={selfSwingBp}
            />

            <Card>
              <CardHeader
                title="A change here does not move a running cycle"
                description="The same rule payroll uses for its settings snapshot."
              />
              <CardBody className="flex flex-col gap-3 text-body-sm text-body">
                <p>
                  When a cycle starts, the weights are copied onto it. Changing
                  them afterwards cannot move a mark that has already been
                  awarded — a rating from this quarter has to keep explaining
                  itself against the weights that produced it, years later.
                </p>
                <p className="flex items-start gap-2 text-body-sm text-body">
                  <Lock
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-faint"
                  />
                  A cycle screen says whether its weights are frozen, and{" "}
                  <Link
                    href="/performance"
                    className="font-medium text-accent-text underline-offset-2 hover:underline"
                  >
                    the appraisals tab
                  </Link>{" "}
                  is where cycles are started.
                </p>
              </CardBody>
            </Card>

            {canManage && editable && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4">
                <div className="min-w-0">
                  {problem ? (
                    <p className="text-body-sm text-danger-text">{problem}</p>
                  ) : dirty ? (
                    <p className="text-body-sm text-muted">
                      These make 100%. Saving replaces the whole set.
                    </p>
                  ) : (
                    <p className="text-body-sm text-muted">
                      Nothing changed. This is the set new cycles start with.
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
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
      </PageBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */

/** The running total, and the only place the local refusal shows a figure. */
function Total({ totalBp }: { totalBp: number }) {
  const whole = totalBp === FULL_WEIGHT_BP;
  return (
    <span className="flex items-center gap-2">
      <span className="text-meta text-muted">Total</span>
      <Badge tone={whole ? "success" : "danger"} size="md" dot>
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
        description="Collected either way. Whether it counts is the decision on this screen."
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
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-faint" />
          <span>
            {changed && (
              <span className="font-medium text-ink">Saved now, not yet changed: </span>
            )}
            {note}
          </span>
        </p>

        {on ? (
          <p className="rounded-md border border-warning-line bg-warning-soft px-3.5 py-2.5 text-body-sm text-ink">
            {changed ? "If you save this: at" : "At"} {weightLabel(weightBp)},
            somebody who rates themselves 5 out of 5 rather than 3 out of 5 moves
            their own final mark by {weightLabel(swingBp)} — more if any other
            part has nothing recorded against it, because the remaining weights
            are spread over the whole mark. Two people who delivered identically
            will not get the same mark.
          </p>
        ) : (
          <p className="text-body-sm text-body">
            Set this above 0% and an employee&apos;s own opinion of themselves
            becomes part of the mark used to decide confirmation, promotion and
            bonus. It rewards confidence over delivery, and it cannot be explained
            to the person who rated themselves honestly.
          </p>
        )}

        <DescriptionList
          columns={2}
          items={[
            {
              term: "What we do instead",
              value:
                "The self-rating is shown beside the manager's, so the gap between them is visible and can be discussed.",
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
