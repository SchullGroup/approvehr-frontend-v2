"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Spinner,
  Textarea,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { ApiError } from "@/lib/api/client";
import { sourceNote } from "@/lib/demo";
import {
  RATING_LABELS,
  RATING_MEANING,
  type ApiRatingLevel,
  type ApiRatingScale,
} from "@/lib/api/performance";
import { useCan } from "@/lib/permissions";
import { useRatingScale } from "@/lib/store/performance";

/**
 * What a mark is called, in this company's own words.
 *
 * ## Why this screen exists
 *
 * The scale was a constant in two repos. Christianah's document asked for
 * 1–5 with five specific words; the standup then asked for descriptive labels
 * *instead of* numbers, which is a different scale rather than different copy.
 * Neither is a decision this product should be making on a company's behalf —
 * "Meets Expectations" and "Meets expectation" and "On track" are the same
 * scale in three house styles, and the one that matters is the one already
 * written in the company's own appraisal guide.
 *
 * So the five words are configuration, and this is where they are set.
 *
 * ## The whole set, never one level
 *
 * `PUT /performance/rating-scale` takes all five for the same reason
 * `setScoringWeights` takes all five weights: the rule is about the **set** —
 * no two levels may share a word — and a field-at-a-time form could not check
 * it, so the check would end up here as a suggestion. Rename a 3 to "Exceeds
 * Expectations" and the set is momentarily ambiguous; there is no save in that
 * state to make.
 *
 * ## Saved and default are different states
 *
 * `source` says which. A company that has never chosen follows whatever the
 * product ships; one that has chosen keeps its words exactly, even if the
 * defaults later move. That is why *Use the built-in five* is a real action
 * with an observable effect rather than a cosmetic reset — and why the badge
 * says which state somebody is looking at.
 *
 * ## A running period keeps the words it started with
 *
 * `ReviewCycle.scoringSnapshot` freezes the scale at activation. A mark from
 * 2026 has to explain itself in 2029, in the words it was given in — so
 * renaming a level here never rewrites a mark already awarded, and the copy
 * below says so rather than leaving somebody to hope.
 */
type Draft = Record<number, { label: string; meaning: string }>;

const draftFrom = (scale: ApiRatingScale): Draft =>
  Object.fromEntries(
    scale.levels.map((entry) => [
      entry.level,
      { label: entry.label, meaning: entry.meaning },
    ]),
  );

const defaultsDraft = (max: number): Draft =>
  Object.fromEntries(
    Array.from({ length: max }, (_, index) => index + 1).map((level) => [
      level,
      {
        label: RATING_LABELS[level] ?? String(level),
        meaning: RATING_MEANING[level] ?? "",
      },
    ]),
  );

/**
 * Why this set cannot be saved, in the API's own words, or null.
 *
 * Checked here **as well as** on the server, never instead of it: the server
 * is where the rule is real, and this exists so nobody meets the refusal by
 * surprise after pressing Save. The sentences match the service's, so the two
 * cannot come to disagree about what is wrong.
 */
export function scaleProblem(
  entries: { level: number; label: string }[],
): string | null {
  const blank = entries.find((entry) => entry.label.trim().length === 0);
  if (blank) {
    return `Level ${String(blank.level)} needs a word.`;
  }
  const words = entries.map((entry) => entry.label.trim().toLowerCase());
  const clash = words.find((word, index) => words.indexOf(word) !== index);
  if (clash !== undefined) {
    return "Two levels cannot share a word — a reader could not tell them apart.";
  }
  return null;
}

export function RatingScaleForm() {
  const canManage = useCan("MANAGE_SETTINGS");
  const { scale, loading, error, source, editable, refusal, save } =
    useRatingScale();
  const toast = useToast();

  /* Keyed by the set it was started from, so a scale arriving or changing
     underneath replaces the draft instead of being edited blind. No setState
     in an effect, and no stale form after a save — the same shape as
     `weights-form.tsx`. */
  const [edited, setEdited] = useState<{
    from: ApiRatingScale;
    value: Draft;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const draft: Draft =
    edited && edited.from === scale ? edited.value : draftFrom(scale);

  const set = (level: number, part: "label" | "meaning", text: string) =>
    setEdited({
      from: scale,
      value: {
        ...draft,
        [level]: { ...draft[level], label: "", meaning: "", [part]: text },
      },
    });

  const entries: ApiRatingLevel[] = scale.levels.map((entry) => ({
    level: entry.level,
    label: draft[entry.level]?.label ?? "",
    meaning: draft[entry.level]?.meaning ?? "",
  }));

  const problem = scaleProblem(entries);
  const dirty = entries.some((entry) => {
    const saved = scale.levels.find((row) => row.level === entry.level);
    return (
      entry.label !== (saved?.label ?? "") ||
      entry.meaning !== (saved?.meaning ?? "")
    );
  });

  const onSave = async () => {
    setSaving(true);
    try {
      await save(
        entries.map((entry) => ({
          level: entry.level,
          label: entry.label.trim(),
          meaning: entry.meaning.trim(),
        })),
      );
      setEdited(null);
      toast.push({
        tone: "success",
        title: "The scale is saved",
        /* The rule somebody will otherwise ask about, in the same breath. A
           period already running keeps its own copy, so nothing already
           awarded is re-worded under anybody. */
        detail:
          "Appraisal periods already running keep the words they started " +
          "with, so no mark already given changes. This applies to the next " +
          "period you start.",
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
    <Card>
      <CardHeader
        title="What a mark is called"
        description="Every appraisal form shows these words instead of a bare number."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {sourceNote(source === "api") && (
              <Badge tone="warning" size="sm" dot>
                {sourceNote(source === "api")}
              </Badge>
            )}
            <Badge
              tone={scale.source === "saved" ? "accent" : "neutral"}
              size="sm"
            >
              {scale.source === "saved"
                ? "Your company's words"
                : "The built-in five"}
            </Badge>
          </div>
        }
      />
      <CardBody className="flex flex-col gap-5">
        <LoadFailure subject="the rating scale" error={error} />

        {loading ? (
          <span className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Reading the scale
          </span>
        ) : (
          <>
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
                  The words a mark is given in sit behind the same permission as
                  the rest of company configuration. Everybody can read them: a
                  scale you are measured against and not allowed to read would
                  be an odd thing to ship.
                </p>
              </Callout>
            )}

            <Callout
              tone="info"
              title="A period keeps the words it started with"
            >
              <p>
                Renaming a level here does not re-word a mark already given. An
                appraisal period freezes the scale when it starts, so a 4
                awarded last half still reads as whatever a 4 was called then.
              </p>
              <p className="mt-2">
                The sentence beside each word is what stops five managers
                reading the same label five ways — which is the whole reason an
                appraisal has a scale rather than a conversation.
              </p>
            </Callout>

            <div className="flex flex-col gap-5">
              {/* Highest first. The form reads top-down as "best to worst",
                  which is the order the company's own guide will be written in
                  and the order a reader expects; the API stores and serves them
                  ascending by level, and nothing about the order here changes
                  what is sent. */}
              {[...entries].reverse().map((entry) => (
                <div
                  key={entry.level}
                  className="grid gap-3 sm:grid-cols-[3rem_1fr] sm:items-start"
                >
                  <div className="pt-2 text-body-md font-semibold text-ink">
                    {entry.level}
                  </div>
                  <div className="flex min-w-0 flex-col gap-2">
                    <Field
                      label={`What level ${String(entry.level)} is called`}
                    >
                      <Input
                        value={entry.label}
                        disabled={!canManage || !editable}
                        maxLength={40}
                        onChange={(event) =>
                          set(entry.level, "label", event.target.value)
                        }
                      />
                    </Field>
                    <Field
                      optional
                      label="What it means"
                      help="Shown under the word on every form, so nobody has to guess."
                    >
                      <Textarea
                        rows={2}
                        value={entry.meaning}
                        disabled={!canManage || !editable}
                        maxLength={300}
                        onChange={(event) =>
                          set(entry.level, "meaning", event.target.value)
                        }
                      />
                    </Field>
                  </div>
                </div>
              ))}
            </div>

            {problem && (
              <Callout tone="warning" title="This set cannot be saved yet">
                <p>{problem}</p>
              </Callout>
            )}

            {canManage && editable && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="accent"
                  loading={saving}
                  disabled={!dirty || problem !== null}
                  onClick={() => void onSave()}
                >
                  Save the scale
                </Button>
                <Button
                  variant="secondary"
                  disabled={saving}
                  onClick={() =>
                    setEdited({ from: scale, value: defaultsDraft(scale.max) })
                  }
                >
                  <RotateCcw aria-hidden="true" className="size-3.5" />
                  Use the built-in five
                </Button>
                {dirty && (
                  <span className="text-meta text-muted">Not saved yet.</span>
                )}
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
