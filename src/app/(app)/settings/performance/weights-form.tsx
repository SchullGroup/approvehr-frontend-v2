"use client";

import { sourceNote } from "@/lib/demo";
import { useState } from "react";
import { Pencil, Plus, Scale, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  LoadState,
  Modal,
  Select,
  Tabs,
  Textarea,
  TextLink,
  useToast,
} from "@/components/ui";
import type { TabItem } from "@/components/ui";
import { SavedWeightsNote } from "@/components/performance/saved-weights-note";
import { useUrlTab } from "@/hooks/use-url-tab";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import {
  FULL_WEIGHT_BP,
  SCORE_COMPONENT_ORDER,
  isLaterComponent,
  weightLabel,
  weightProblem as totalProblem,
  weightTotalNote,
  type ApiScoringPart,
  type ApiScoringParts,
  type ScoreComponent,
  type WeightSet,
} from "@/lib/api/performance";
import { useHeld } from "@/lib/use-held";
import type { ManagerAppraisalPart } from "@/lib/performance/overall-mark-wording";
import { WeightsPie } from "@/components/performance/weights-pie";
import { useCan } from "@/lib/permissions";
import { useScoringParts, useScoringWeights } from "@/lib/store/performance";
import { OverallMarkCard } from "./overall-mark-card";
import { WorkAssistsCard } from "./work-assists-card";
import { WorkInAnswersCard } from "./work-in-answers-card";
import { SCORING_TABS, type ScoringTabId } from "./tabs";
import { WorkRecordCard } from "./work-record-card";
import { NEXT_PERIOD, READ_ONLY_MANY } from "./setting-copy";
import { WEIGHTS_RULE } from "@/lib/performance/score-wording";

const TAB_ITEMS: TabItem[] = [
  { id: "weights", label: "Parts of the score" },
  { id: "marks", label: "Rating names" },
  { id: "records", label: "Records" },
];

/** The source the appraisers' overall mark is scored from. */
const MANAGER_SOURCE: ScoreComponent = "MANAGER_APPRAISAL";

/**
 * The parts an appraisal mark is made of, as a list the company writes.
 *
 * Each part has the company's own name, a description, a weight and the source
 * its mark is scored from. Saved parts show as plain rows with an edit and a
 * delete icon; nothing is an open box until somebody chooses to edit. A company
 * that signs up starts with no parts.
 *
 * Each source backs one part at most, so a source another part uses is not
 * offered. Nothing here computes anybody's mark; the API does that, once.
 *
 * ## The weights add up to 100%, and nothing else is saved (L14)
 *
 * The owner's rule (UAT 23 Nov): a part's weight is its share of the score, so
 * the weights add up to exactly 100%, here and on a period. Parts are saved
 * one at a time, and a total cannot be checked one part at a time: adding a
 * part, or lowering one, moves the total off 100% on the way to the next one.
 * So a weight is never changed in a part's own dialog. A new part starts at 0%,
 * the weights are changed together in one editor whose Save stays shut until
 * they add up to 100%, and that editor sends the whole set in one write
 * (`PUT /performance/scoring-weights`). A part that still counts for something
 * is not deleted; its weight goes to the others first.
 */

/** One basis point, the smallest weight the API holds, as a percent step. */
const STEP = "0.01";

/** Percent text to integer basis points. Never a float in the payload. */
function toBp(text: string): number {
  const value = Number(text);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(FULL_WEIGHT_BP, Math.round(value * 100)));
}

function weightTextProblem(text: string): string | null {
  const value = Number(text);
  if (text.trim() === "" || !Number.isFinite(value)) return "Enter a weight.";
  if (value < 0 || value > 100) return "A number between 0 and 100.";
  return null;
}

type Draft = {
  /** The part being edited, or null for a new one. */
  id: string | null;
  name: string;
  source: ScoreComponent | "";
  description: string;
};

const draftOf = (part: ApiScoringPart): Draft => ({
  id: part.id,
  name: part.name,
  source: part.source,
  description: part.description ?? "",
});

/** A part's saved weight as the text its field starts with. 2500 becomes "25". */
const textOf = (part: ApiScoringPart): string => String(part.weightBp / 100);

/**
 * The whole set the weights editor sends: each part's typed weight under its
 * source, 0 for a source with no part, and Manager appraisal only where the
 * server lists it (a server that predates it drops the key, and a 0 sent to one
 * that has it would write over a weight). The API skips a 0 for a source the
 * company has no part for, so this never brings a deleted part back.
 */
export function weightSetOf(
  view: ApiScoringParts,
  typed: Record<string, string>,
): WeightSet {
  const set: Partial<Record<ScoreComponent, number>> = {};
  for (const component of SCORE_COMPONENT_ORDER) {
    const part = view.parts.find((one) => one.source === component);
    if (part) set[component] = toBp(typed[part.id] ?? textOf(part));
    else if (
      !isLaterComponent(component) ||
      view.sources.some((one) => one.source === component)
    )
      set[component] = 0;
  }
  return set as WeightSet;
}

export function ScoringWeightsForm({
  scale,
  initialTab = "weights",
}: {
  /** The "what a mark is called" form, shown on its own tab. */
  scale: React.ReactNode;
  initialTab?: ScoringTabId;
}) {
  const [tab, changeTab] = useUrlTab<ScoringTabId>(initialTab, SCORING_TABS);
  const scoring = useScoringParts();

  /* What this side knows about the Manager appraisal source, for the overall-mark
     card: a server that lists it as a source has the part, whether or not the
     company has written a part from it yet; one that does not list it predates it;
     and with the parts not in (loading, or failed) nothing is known, so nothing
     is said about whether a manager's form asks for a mark. Treating "not in yet"
     as "no part" printed "is not counted in it" on a server that has it. The
     company's own name for the part is what the card uses when there is one. */
  const managerSource = scoring.parts?.sources.find(
    (source) => source.source === MANAGER_SOURCE,
  );
  const managerPart = scoring.parts?.parts.find(
    (part) => part.source === MANAGER_SOURCE,
  );
  const managerAppraisal: ManagerAppraisalPart =
    scoring.parts === null
      ? { state: "unknown" }
      : managerSource
        ? { state: "has", label: managerPart?.name ?? managerSource.label }
        : { state: "none" };

  return (
    <>
      <PageHeader
        title="Appraisal scoring"
        breadcrumb={[{ href: "/settings", label: "Settings" }]}
        meta={
          sourceNote(scoring.source === "api") && (
            <Badge tone="warning" size="sm" dot>
              {sourceNote(scoring.source === "api")}
            </Badge>
          )
        }
      />

      <PageBody className="flex flex-col gap-6">
        <Tabs items={TAB_ITEMS} value={tab} onChange={changeTab}>
          <div hidden={tab !== "weights"} className="flex flex-col gap-6">
            <PartsPanel scoring={scoring} />
          </div>
          <div hidden={tab !== "marks"} className="flex flex-col gap-6">
            {/* First, because it decides whether the names below are ever
                offered on a form. */}
            <OverallMarkCard
              connected={scoring.source === "api"}
              onChanged={scoring.reload}
              managerAppraisal={managerAppraisal}
            />
            {scale}
          </div>
          <div hidden={tab !== "records"} className="flex flex-col gap-6">
            <WorkRecordCard connected={scoring.source === "api"} />
            <WorkInAnswersCard connected={scoring.source === "api"} />
            <WorkAssistsCard connected={scoring.source === "api"} />
          </div>
        </Tabs>
      </PageBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function PartsPanel({
  scoring,
}: {
  scoring: ReturnType<typeof useScoringParts>;
}) {
  const {
    parts: view,
    loading,
    error,
    editable,
    refusal,
    add,
    update,
    remove,
    reload,
  } = scoring;
  const canManage = useCan("MANAGE_SETTINGS");
  const manage = canManage && editable;
  const toast = useToast();
  /* Read for one thing: the API's sentence about what weighting the Manager
     appraisal part does, which the parts read does not carry. It is about the
     saved set, so it is read again after every write below. Nothing here writes
     a sentence about it. */
  const {
    weights,
    reload: reloadWeights,
    save: saveWeights,
  } = useScoringWeights();

  const [draft, setDraft] = useState<Draft | null>(null);
  /* The weights editor: open or not, and what was typed over the saved weights,
     by part id. A diff, so a part the list gains while it is open (the one just
     added) comes in at its saved 0. */
  const [weighing, setWeighing] = useState<Record<string, string> | null>(null);
  const [savingWeights, setSavingWeights] = useState(false);
  /* The list blanks while it is read again after a write, and the editor must
     not close under the person, so it is drawn from the last complete list. */
  const held = useHeld(view, view !== null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<ApiScoringPart | null>(null);
  const [removing, setRemoving] = useState(false);

  /* Nothing is known until the parts have answered, and a failed read is not an
     empty list: both are `LoadState`'s to say, below, so a count, "No parts yet"
     and the Add button are never drawn under a failure or before an answer. */
  const free = view?.sources.filter((source) => source.usedBy === null) ?? [];
  const selfPart = view?.parts.find(
    (part) => part.source === "SELF_ASSESSMENT",
  );
  const selfShareBp = selfPart?.shareBp ?? 0;

  const onSave = async () => {
    if (!draft || draft.source === "") return;
    setSaving(true);
    const body = {
      name: draft.name.trim(),
      source: draft.source,
      description:
        draft.description.trim() === "" ? null : draft.description.trim(),
    };
    try {
      if (draft.id === null) {
        /* At 0%, so the weights still add up to 100%. Its share is given in
           the weights editor, which opens next. */
        await add({ ...body, weightBp: 0 });
        reloadWeights();
        toast.push({
          tone: "success",
          title: `${body.name} added at 0%`,
          detail: "Set its weight next.",
        });
        setDraft(null);
        setWeighing({});
        return;
      } else {
        await update(draft.id, body);
        reloadWeights();
        toast.push({
          tone: "success",
          title: `${body.name} saved`,
          detail: NEXT_PERIOD,
        });
      }
      setDraft(null);
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

  const onSaveWeights = async () => {
    if (!held || weighing === null) return;
    setSavingWeights(true);
    try {
      const saved = await saveWeights(weightSetOf(held, weighing));
      reload();
      const kept = saved.frozenCycles;
      toast.push({
        tone: "success",
        title: "Weights saved",
        detail:
          kept.length === 0
            ? NEXT_PERIOD
            : `${NEXT_PERIOD} ${kept.join(", ")} ${kept.length === 1 ? "keeps its" : "keep their"} old weights.`,
      });
      setWeighing(null);
    } catch (caught) {
      toast.push({
        tone: "danger",
        title: "The weights did not save",
        detail:
          caught instanceof ApiError
            ? caught.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setSavingWeights(false);
    }
  };

  const onDelete = async () => {
    if (!deleting) return;
    /* A part that still counts is not deleted: the others would then add up
       to less than 100%. Its weight goes to them first, in the editor. */
    if (deleting.weightBp > 0) {
      setWeighing({ [deleting.id]: "0" });
      setDeleting(null);
      return;
    }
    setRemoving(true);
    try {
      await remove(deleting.id);
      reloadWeights();
      toast.push({
        tone: "success",
        title: `${deleting.name} deleted`,
        detail: "It no longer counts towards the score.",
      });
      setDeleting(null);
    } catch (caught) {
      toast.push({
        tone: "danger",
        title: "That did not delete",
        detail:
          caught instanceof ApiError
            ? caught.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setRemoving(false);
    }
  };

  const newPart = () =>
    setDraft({
      id: null,
      name: "",
      source: free[0]?.source ?? "",
      description: "",
    });

  return (
    <>
      {!editable && (
        <Callout tone="warning" title="You can't change these here">
          <p>{refusal}</p>
        </Callout>
      )}
      {editable && !canManage && (
        <p className="text-body-sm text-muted">{READ_ONLY_MANY}</p>
      )}

      <LoadState
        loading={loading}
        error={error}
        hasData={view !== null}
        subject="the scoring parts"
        onRetry={reload}
        skeleton="list"
      >
        {view && (
          <>
            <Card>
              <CardHeader
                title="Parts of the score"
                info={`The score is the weighted average of these parts. ${WEIGHTS_RULE}`}
                action={
                  <span className="flex flex-wrap items-center gap-3">
                    <Total totalBp={view.totalBp} />
                    {manage && view.parts.length > 0 && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setWeighing({})}
                      >
                        <Scale aria-hidden="true" className="size-4" />
                        Edit weights
                      </Button>
                    )}
                    {manage && (
                      <Button
                        variant="accent"
                        size="sm"
                        disabled={free.length === 0}
                        title={
                          free.length === 0
                            ? "Every source is in use. Edit or delete a part first."
                            : undefined
                        }
                        onClick={newPart}
                      >
                        <Plus aria-hidden="true" className="size-4" />
                        Add part
                      </Button>
                    )}
                  </span>
                }
              />
              <CardBody className="flex flex-col gap-0 p-0">
                {/* Said on the page, not behind an icon: a set saved before the
                    100% rule still scores in proportion to its total, which
                    changes how every figure below it is to be read. */}
                {view.parts.length > 0 &&
                  weightTotalNote(view.totalBp, { canChange: manage }) && (
                    <p
                      role="status"
                      className="border-b border-line px-5 py-3 text-body-sm text-warning-text"
                    >
                      {weightTotalNote(view.totalBp, { canChange: manage })}
                    </p>
                  )}
                {view.parts.length > 0 && (
                  <div className="flex justify-center border-b border-line px-5 py-5">
                    <WeightsPie
                      slices={view.parts.map((part) => ({
                        id: part.id,
                        label: part.name,
                        percent: Math.round(part.weightBp / 100),
                      }))}
                    />
                  </div>
                )}
                {view.parts.length === 0 ? (
                  <div className="p-6">
                    <EmptyState
                      plain
                      title="No parts yet"
                      description="Add the parts a score is made of, then give them weights that add up to 100%."
                      {...(manage
                        ? {
                            action: (
                              <Button variant="accent" onClick={newPart}>
                                <Plus aria-hidden="true" className="size-4" />
                                Add a part
                              </Button>
                            ),
                          }
                        : {})}
                    />
                  </div>
                ) : (
                  <ul className="divide-y divide-line">
                    {view.parts.map((part) => (
                      <li
                        key={part.id}
                        data-part={part.source}
                        className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-4"
                      >
                        <div className="min-w-0 flex-1 basis-64">
                          <p className="text-body-sm font-medium text-ink">
                            {part.name}
                          </p>
                          <p className="text-meta text-muted">
                            Scored from {part.sourceLabel}
                          </p>
                          {part.description && (
                            <p className="mt-1 text-body-sm text-body">
                              {part.description}
                            </p>
                          )}
                          {/* The API's own sentence about what weighting this part does,
                        beside the weight that causes it: that a manager's judgement
                        then reaches the score both through the levels they record
                        and through this overall mark. It is about the saved set,
                        which is what this row shows, so it never says "moved". */}
                          {part.source === MANAGER_SOURCE &&
                            weights?.managerAppraisalNote && (
                              <div className="mt-2">
                                <SavedWeightsNote moved={false} />
                              </div>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="tabular text-body-sm font-medium text-ink">
                              {weightLabel(part.weightBp)}
                            </p>
                            {/* The share only where it differs from the
                                weight: "45%" over "45% of a mark" said one
                                thing twice (L14 / PERF-39). */}
                            {part.weightBp > 0 &&
                              part.shareBp !== part.weightBp && (
                                <p className="tabular text-meta text-muted">
                                  {`${weightLabel(part.shareBp)} of the score`}
                                </p>
                              )}
                          </div>
                          {manage && (
                            <span className="flex gap-1">
                              <IconButton
                                label={`Edit ${part.name}`}
                                size="sm"
                                className="size-11 sm:size-8"
                                onClick={() => setDraft(draftOf(part))}
                              >
                                <Pencil aria-hidden="true" className="size-4" />
                              </IconButton>
                              <IconButton
                                label={`Delete ${part.name}`}
                                size="sm"
                                className="size-11 sm:size-8"
                                onClick={() => setDeleting(part)}
                              >
                                <Trash2 aria-hidden="true" className="size-4" />
                              </IconButton>
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>

            <SelfAssessment
              note={view.selfAssessmentNote}
              weightBp={selfShareBp}
              swingBp={Math.round(selfShareBp / 2)}
            />

            <p className="text-body-sm text-muted">
              A period keeps the parts and weights it started with. Periods are
              started in <TextLink href="/performance">Performance</TextLink>.
            </p>
          </>
        )}
      </LoadState>

      {weighing !== null && held && (
        <WeightsModal
          view={held}
          typed={weighing}
          saving={savingWeights}
          onChange={setWeighing}
          onClose={() => setWeighing(null)}
          onSave={() => void onSaveWeights()}
        />
      )}

      {draft && view && (
        <PartModal
          draft={draft}
          view={view}
          saving={saving}
          onChange={setDraft}
          onClose={() => setDraft(null)}
          onSave={() => void onSave()}
        />
      )}

      {deleting !== null && deleting.weightBp > 0 ? (
        <ConfirmDialog
          open
          onClose={() => setDeleting(null)}
          title={`Move ${deleting.name}'s weight first`}
          confirmLabel="Edit weights"
          body={
            <p>
              {deleting.name} counts for {weightLabel(deleting.weightBp)}. Set
              it to 0% and give its weight to the other parts, then delete it.
            </p>
          }
          onConfirm={() => void onDelete()}
        />
      ) : (
        <ConfirmDialog
          open={deleting !== null}
          onClose={() => setDeleting(null)}
          loading={removing}
          tone="danger"
          title={`Delete ${deleting?.name ?? "this part"}?`}
          confirmLabel="Delete part"
          body={
            <p>
              It goes from the next period you start. Periods already running
              keep it.
            </p>
          }
          onConfirm={() => void onDelete()}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

function PartModal({
  draft,
  view,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  draft: Draft;
  view: ApiScoringParts;
  saving: boolean;
  onChange: (next: Draft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  /* A source is offered when it is free, or when it is this part's own. */
  const offered = view.sources.filter(
    (source) => source.usedBy === null || source.usedBy === draft.id,
  );
  const chosen = view.sources.find((source) => source.source === draft.source);
  const nameProblem = draft.name.trim() === "" ? "Give the part a name." : null;
  const ready = nameProblem === null && draft.source !== "";

  return (
    <Modal
      open
      onClose={onClose}
      title={draft.id === null ? "Add a part" : "Edit the part"}
      description={
        draft.id === null
          ? "It starts at 0%. Set its weight next."
          : NEXT_PERIOD
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={saving}
            disabled={!ready}
            onClick={onSave}
          >
            {draft.id === null ? "Add part" : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="Name"
          {...(draft.name !== "" && nameProblem ? { error: nameProblem } : {})}
        >
          <Input
            value={draft.name}
            maxLength={60}
            placeholder="Delivery against objectives"
            onChange={(event) =>
              onChange({ ...draft, name: event.target.value })
            }
          />
        </Field>
        <Field
          label="Scored from"
          help={chosen?.description || "Where this part's score comes from."}
        >
          <Select
            value={draft.source}
            onChange={(event) =>
              onChange({
                ...draft,
                source: event.target.value as ScoreComponent,
              })
            }
          >
            {offered.map((source) => (
              <option key={source.source} value={source.source}>
                {source.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Description" optional help="Shown under the name.">
          <Textarea
            rows={3}
            maxLength={300}
            value={draft.description}
            onChange={(event) =>
              onChange({ ...draft, description: event.target.value })
            }
          />
        </Field>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Every part's weight at once, and nothing saved until they add up to 100%.
 *
 * What is typed is held as text over the saved weights, by part id, so a
 * half-typed field is never rewritten under the person. The rule is said in
 * the API's own words for the appraiser weights ("These add up to 90%. Add
 * 10%."), beside the total, while the numbers can still be changed.
 */
function WeightsModal({
  view,
  typed,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  view: ApiScoringParts;
  typed: Record<string, string>;
  saving: boolean;
  onChange: (next: Record<string, string>) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const textFor = (part: ApiScoringPart) => typed[part.id] ?? textOf(part);
  const rowProblems = view.parts.map((part) =>
    weightTextProblem(textFor(part)),
  );
  const rowsOk = rowProblems.every((problem) => problem === null);
  const totalBp = rowsOk
    ? view.parts.reduce((sum, part) => sum + toBp(textFor(part)), 0)
    : null;
  const problem =
    totalBp === null ? null : totalProblem([{ weightBp: totalBp }]);
  const ready = totalBp === FULL_WEIGHT_BP;

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit weights"
      description={`They must add up to 100%. ${NEXT_PERIOD}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={saving}
            disabled={!ready}
            onClick={onSave}
          >
            Save weights
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {view.parts.map((part, index) => (
          <Field
            key={part.id}
            label={part.name}
            {...(rowProblems[index] ? { error: rowProblems[index] } : {})}
          >
            <Input
              type="number"
              min={0}
              max={100}
              step={STEP}
              suffix="%"
              value={textFor(part)}
              onChange={(event) =>
                onChange({ ...typed, [part.id]: event.target.value })
              }
            />
          </Field>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <Total totalBp={totalBp ?? 0} />
          {problem && (
            <p role="status" className="text-body-sm text-warning-text">
              {problem}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** The running total of the weights. */
function Total({ totalBp }: { totalBp: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="text-meta text-muted">Total</span>
      <Badge
        tone={totalBp === FULL_WEIGHT_BP ? "neutral" : "warning"}
        size="md"
        dot
      >
        {weightLabel(totalBp)}
      </Badge>
    </span>
  );
}

/**
 * Whether a person's own rating counts, in one line. The API's sentence about
 * what the part is read from, and what counting it costs, sit behind the info
 * icon: the badge and the line say the state, which is what a visit needs.
 */
function SelfAssessment({
  note,
  weightBp,
  swingBp,
}: {
  note: string;
  weightBp: number;
  swingBp: number;
}) {
  const on = weightBp > 0;
  return (
    <Card>
      <CardHeader
        title="Self-assessment"
        info={`${note} Either way, a person's own answers are shown beside the manager's.`}
        description={
          on
            ? `Rating themselves 5 instead of 3 moves a person's own score by ${weightLabel(swingBp)}.`
            : "To count it, add a part scored from self-assessment."
        }
        action={
          <Badge tone={on ? "warning" : "neutral"} size="sm" dot>
            {on ? `Counts for ${weightLabel(weightBp)}` : "Not counted"}
          </Badge>
        }
      />
    </Card>
  );
}
