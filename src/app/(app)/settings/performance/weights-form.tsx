"use client";

import { sourceNote } from "@/lib/demo";
import { useState } from "react";
import { Info, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  DescriptionList,
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
  overFullWeightNote,
  weightLabel,
  type ApiScoringPart,
  type ApiScoringParts,
  type ScoreComponent,
} from "@/lib/api/performance";
import type { ManagerAppraisalPart } from "@/lib/performance/overall-mark-wording";
import { useCan } from "@/lib/permissions";
import { useScoringParts, useScoringWeights } from "@/lib/store/performance";
import { OverallMarkCard } from "./overall-mark-card";
import { SCORING_TABS, type ScoringTabId } from "./tabs";
import { WorkRecordCard } from "./work-record-card";

const TAB_ITEMS: TabItem[] = [
  { id: "weights", label: "Parts of a mark" },
  { id: "marks", label: "Names of marks" },
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
 * offered. Weights are proportional, as they always were: each part counts as
 * its weight over the total, and the share is shown on the row. Nothing here
 * computes anybody's mark; the API does that, once.
 */

/** One basis point, the smallest weight the API holds, as a percent step. */
const STEP = "0.01";

/** Percent text to integer basis points. Never a float in the payload. */
function toBp(text: string): number {
  const value = Number(text);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(FULL_WEIGHT_BP, Math.round(value * 100)));
}

function weightProblem(text: string): string | null {
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
  weight: string;
  description: string;
};

const draftOf = (part: ApiScoringPart): Draft => ({
  id: part.id,
  name: part.name,
  source: part.source,
  weight: String(part.weightBp / 100),
  description: part.description ?? "",
});

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
  const { weights, reload: reloadWeights } = useScoringWeights();

  const [draft, setDraft] = useState<Draft | null>(null);
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
      weightBp: toBp(draft.weight),
      description:
        draft.description.trim() === "" ? null : draft.description.trim(),
    };
    try {
      if (draft.id === null) {
        await add(body);
        reloadWeights();
        toast.push({
          tone: "success",
          title: `${body.name} added`,
          detail: "It applies to the next appraisal period you start.",
        });
      } else {
        await update(draft.id, body);
        reloadWeights();
        toast.push({
          tone: "success",
          title: `${body.name} saved`,
          detail: "It applies to the next appraisal period you start.",
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

  const onDelete = async () => {
    if (!deleting) return;
    setRemoving(true);
    try {
      await remove(deleting.id);
      reloadWeights();
      toast.push({
        tone: "success",
        title: `${deleting.name} deleted`,
        detail: "It no longer counts towards a mark.",
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
      weight: "",
      description: "",
    });

  return (
    <>
      {!editable && (
        <Callout tone="warning" title="Changing these needs the API">
          <p>{refusal}</p>
        </Callout>
      )}
      {editable && !canManage && (
        <Callout tone="info" title="Changing these needs settings permission">
          <p>
            How much each part counts decides pay, so it sits behind the same
            permission as the rest of company configuration. You can read them.
          </p>
        </Callout>
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
                title="The parts of a mark"
                description="A mark is the weighted average of these parts. Each counts in proportion to the total."
                action={
                  <span className="flex flex-wrap items-center gap-3">
                    <Total totalBp={view.totalBp} />
                    {manage && (
                      <Button
                        variant="accent"
                        size="sm"
                        disabled={free.length === 0}
                        title={
                          free.length === 0
                            ? "Every source already has a part. Edit or delete one first."
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
                {/* Said on the page, not behind an icon: it changes how every
                    figure below it is to be read. A warning, not a refusal. */}
                {overFullWeightNote(view.totalBp) && (
                  <p
                    role="status"
                    className="border-b border-line px-5 py-3 text-body-sm text-warning-text"
                  >
                    {overFullWeightNote(view.totalBp)}
                  </p>
                )}
                {view.parts.length === 0 ? (
                  <div className="p-6">
                    <EmptyState
                      title="No parts yet"
                      description="Add the parts your appraisals are marked on: a name, what it is scored from, its weight and a description. An appraisal period cannot start until at least one part has a weight."
                      {...(manage
                        ? {
                            action: (
                              <Button variant="accent" onClick={newPart}>
                                <Plus aria-hidden="true" className="size-4" />
                                Add the first part
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
                                <SavedWeightsNote
                                  note={weights.managerAppraisalNote}
                                  moved={false}
                                />
                              </div>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="tabular text-body-sm font-medium text-ink">
                              {weightLabel(part.weightBp)}
                            </p>
                            <p className="tabular text-meta text-muted">
                              {part.weightBp === 0
                                ? "Counts for nothing"
                                : `${weightLabel(part.shareBp)} of a mark`}
                            </p>
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

            <Card>
              <CardHeader
                title="A change here does not move a period that has started"
                description="The same rule payroll uses for its settings snapshot."
              />
              <CardBody className="flex flex-col gap-3 text-body-sm text-body">
                <p>
                  When a period starts, its parts and weights are copied onto
                  it. Changing or deleting a part afterwards cannot move a mark
                  that has already been awarded.
                </p>
                <p className="flex items-start gap-2 text-body-sm text-body">
                  <Lock
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-faint"
                  />
                  <span className="min-w-0">
                    A period screen says whether its weights are frozen, and{" "}
                    <TextLink href="/performance">the appraisals tab</TextLink>{" "}
                    is where appraisal periods are started.
                  </span>
                </p>
              </CardBody>
            </Card>
          </>
        )}
      </LoadState>

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

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        loading={removing}
        tone="danger"
        title={`Delete ${deleting?.name ?? "this part"}?`}
        confirmLabel="Delete the part"
        body={
          <p>
            It stops counting towards marks from the next appraisal period you
            start. Periods already running keep the parts they started with.
          </p>
        }
        onConfirm={() => void onDelete()}
      />
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
  const weightError = weightProblem(draft.weight);
  /* What the parts would add up to with this one as typed: the others as saved
     (this part's own saved weight is left out when it is being changed). Said
     while the number is still in the box, where it can be changed, and never a
     reason to keep Save shut. */
  const totalWithThis =
    weightError === null
      ? view.parts
          .filter((part) => part.id !== draft.id)
          .reduce((sum, part) => sum + part.weightBp, 0) + toBp(draft.weight)
      : 0;
  const overNote = overFullWeightNote(totalWithThis);
  const ready =
    nameProblem === null && weightError === null && draft.source !== "";

  return (
    <Modal
      open
      onClose={onClose}
      title={draft.id === null ? "Add a part" : "Edit the part"}
      description="It applies to the next appraisal period you start."
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
          help={chosen?.description || "Where this part's mark comes from."}
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
        <Field
          label="Weight"
          {...(draft.weight !== "" && weightError
            ? { error: weightError }
            : {})}
        >
          <Input
            type="number"
            min={0}
            max={100}
            step={STEP}
            suffix="%"
            value={draft.weight}
            placeholder="25"
            onChange={(event) =>
              onChange({ ...draft, weight: event.target.value })
            }
          />
        </Field>
        {overNote && (
          <p role="status" className="-mt-2 text-body-sm text-warning-text">
            {overNote}
          </p>
        )}
        <Field
          label="Description"
          help="Optional. Shown under the part's name."
        >
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

/** The running total. Weights are proportional, so only zero is a problem. */
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
 * What counting self-assessment does to a mark, stated on the screen. An
 * employee's own rating in their official mark rewards confidence over
 * delivery, so the cost is said where the decision is made.
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
        description="Whether it counts is decided by adding a part scored from it."
        action={
          <Badge tone={on ? "warning" : "neutral"} size="sm" dot>
            {on ? `Counting for ${weightLabel(weightBp)}` : "Not counted"}
          </Badge>
        }
      />
      <CardBody className="flex flex-col gap-3">
        <p className="flex items-start gap-2 text-body-sm text-body">
          <Info
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-faint"
          />
          <span>{note}</span>
        </p>
        {on ? (
          <p className="text-body-sm text-muted">
            At {weightLabel(weightBp)}, somebody who rates themselves 5 out of 5
            rather than 3 out of 5 moves their own final mark by{" "}
            {weightLabel(swingBp)}. Two people who delivered identically will
            not get the same mark.
          </p>
        ) : (
          <p className="text-body-sm text-body">
            Add a part scored from self-assessment and an employee&apos;s own
            opinion of themselves becomes part of the mark used to decide
            confirmation, promotion and bonus.
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
