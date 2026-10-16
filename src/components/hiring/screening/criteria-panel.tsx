"use client";

import { useMemo, useState } from "react";
import { Save } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Skeleton,
  useToast,
} from "@/components/ui";
import { CriteriaEditor } from "@/components/hiring/screening/criteria-editor";
import { CriteriaPreviewPanel } from "@/components/hiring/screening/criteria-preview";
import { LoadFailure } from "@/components/portal/load-failure";
import { ApiError } from "@/lib/api/client";
import {
  cleaned,
  draftFrom,
  criteriaKey,
  hasProblems,
  isEmptyCriteria,
  sameCriteria,
  validateCriteria,
} from "@/lib/hiring/screening/criteria";
import type { Criteria } from "@/lib/hiring/screening/model";
import {
  useCriteria,
  usePreview,
  useSuggest,
  type useRescore,
} from "@/lib/hiring/screening/use-screening";
import { formatDateShort } from "@/lib/time";
import { useUnsavedGuard } from "@/lib/use-unsaved-guard";

/**
 * An advert's criteria: edit them, preview them, save them.
 *
 * ## Explicit save, a guard on the way out, and a preview first
 *
 * Nothing is written while somebody types. A save is a new version, it starts a
 * re-score of everybody who has applied, and it changes who is flagged, so it is a
 * deliberate button, with an "Unsaved changes" note beside it and a guard on
 * leaving the page. Before saving, "Preview on current applicants" shows how the
 * draft would score the people who have applied.
 *
 * ## Two people editing at once
 *
 * Every save names the version it started from. If somebody saved newer criteria
 * in the meantime the API refuses, and this says so and offers to reload rather
 * than letting the second save quietly win.
 */
export function CriteriaPanel({
  postingId,
  rescore,
}: {
  postingId: string;
  rescore: ReturnType<typeof useRescore>;
}) {
  const criteria = useCriteria(postingId);
  const suggest = useSuggest(postingId);
  const preview = usePreview(postingId);
  const toast = useToast();
  const [draft, setDraft] = useState<Criteria | null>(null);
  const [showProblems, setShowProblems] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<{
    message: string;
    conflict: boolean;
  } | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const view = criteria.view;
  /* Keyed chips for editing, made once per saved version: made on every render
     they would get a new key each time and the inputs would lose their place. */
  const saved = useMemo(() => (view ? draftFrom(view.criteria) : null), [view]);
  const effective = draft ?? saved;
  const dirty = draft !== null && saved !== null && !sameCriteria(draft, saved);
  useUnsavedGuard(dirty);

  if (criteria.error && !view) {
    return (
      <LoadFailure
        subject="the criteria"
        error={criteria.error}
        onRetry={criteria.reload}
      />
    );
  }
  if (!view || !effective || !saved) {
    return (
      <Card>
        <CardBody>
          <Skeleton className="h-48 w-full" />
          <span className="sr-only-focusable">Loading the criteria</span>
        </CardBody>
      </Card>
    );
  }

  const problems = validateCriteria(cleaned(effective));
  const shown = showProblems ? problems : {};
  const previewKey = criteriaKey(effective);

  const edit = (next: Criteria) => {
    setDraft(next);
    setRefusal(null);
  };

  function requestSave() {
    if (!draft) return;
    if (hasProblems(problems)) {
      setShowProblems(true);
      toast.push({
        title: "Not saved yet",
        tone: "warning",
        detail: "Something in the criteria needs fixing first.",
      });
      return;
    }
    setConfirming(true);
  }

  async function save() {
    if (!draft || !view) return;
    setSaving(true);
    try {
      const next = await criteria.save(cleaned(draft), view.version);
      setDraft(null);
      setShowProblems(false);
      setRefusal(null);
      setConfirming(false);
      rescore.watch();
      toast.push({
        title: "Criteria saved",
        tone: "success",
        detail: `This is version ${String(next.version ?? 1)}. Everybody who has applied is being scored against it.`,
      });
    } catch (error) {
      setConfirming(false);
      setRefusal({
        message:
          error instanceof ApiError
            ? (error.fieldErrors[0]?.message ?? error.message)
            : "The criteria were not saved. Try again.",
        conflict: error instanceof ApiError && error.status === 409,
      });
    } finally {
      setSaving(false);
    }
  }

  const none = view.version === null;
  const outOfDate = preview.status === "ready" && preview.asked !== previewKey;

  return (
    <Card>
      <CardHeader
        title="Criteria"
        description="What each applicant's CV is matched against. The score is a count of what the CV mentions, and every score says which."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {dirty && (
              <Badge tone="warning" size="sm" dot>
                Unsaved changes
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={!dirty || saving}
              onClick={() => setDiscarding(true)}
            >
              Discard
            </Button>
            <Button
              variant="accent"
              size="sm"
              loading={saving}
              disabled={!dirty}
              onClick={requestSave}
            >
              {!saving && <Save aria-hidden="true" className="size-3.5" />}
              Save criteria
            </Button>
          </div>
        }
      />
      <CardBody className="flex flex-col gap-6">
        <p className="text-body-sm text-muted" data-testid="criteria-version">
          {none
            ? "No criteria saved yet. Nobody has a score until you save some."
            : `Version ${String(view.version)}${
                view.updatedAt
                  ? `, saved ${formatDateShort(view.updatedAt, "Africa/Lagos")}`
                  : ""
              }${view.updatedBy ? ` by ${view.updatedBy}` : ""}.`}
        </p>

        {none && isEmptyCriteria(effective) && (
          <Callout tone="info" title="No criteria yet">
            Add what you are looking for, preview how it would score the people
            who have applied, then save. Until then applicants show no score,
            and nobody is flagged.
          </Callout>
        )}

        {refusal && (
          <Callout
            tone="danger"
            title={refusal.conflict ? "Somebody saved first" : "Not saved"}
          >
            <div className="flex flex-col items-start gap-2">
              <p>{refusal.message}</p>
              {refusal.conflict && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setDraft(null);
                    setRefusal(null);
                    criteria.reload();
                  }}
                >
                  Reload the newest version
                </Button>
              )}
            </div>
          </Callout>
        )}

        <CriteriaEditor
          value={effective}
          onChange={edit}
          problems={shown}
          scale={view.scale}
          defaults={view.defaults}
          neverUsed={view.neverUsed}
          onSuggest={suggest}
        />

        <CriteriaPreviewPanel
          status={preview.status}
          preview={preview.preview}
          message={preview.message}
          outOfDate={outOfDate}
          disabled={hasProblems(problems)}
          onRun={() => void preview.run(cleaned(effective), previewKey)}
        />

        {view.formula && (
          <p className="text-meta text-muted">
            How the score is worked out: {view.formula}
          </p>
        )}
      </CardBody>

      <ConfirmDialog
        open={discarding}
        onClose={() => setDiscarding(false)}
        title="Throw away your changes?"
        confirmLabel="Discard changes"
        tone="danger"
        body="The criteria go back to how they were when you last saved them."
        onConfirm={() => {
          setDraft(null);
          setShowProblems(false);
          setRefusal(null);
          setDiscarding(false);
        }}
      />

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Save these as version ${String((view.version ?? 0) + 1)}?`}
        confirmLabel="Save and score"
        tone="primary"
        loading={saving}
        body="Everybody who has applied is scored again against these criteria. It can take a while for a big advert, and you can keep working while it runs. Nobody is rejected by a score."
        onConfirm={() => void save()}
      />
    </Card>
  );
}
