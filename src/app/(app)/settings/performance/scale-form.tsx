"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  ConfirmDialog,
  Field,
  IconButton,
  Input,
  Modal,
  RowActions,
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
} from "@/lib/api/performance";
import { useCan } from "@/lib/permissions";
import { useRatingScale } from "@/lib/store/performance";
import { LOADING, NEXT_PERIOD, READ_ONLY_MANY } from "./setting-copy";

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
 * ## Five rows, and a pencil on each
 *
 * A row is a number and its word. The pencil opens that rating's word and what
 * it means, and saving there writes the whole set (below), so there is no page
 * of ten boxes to scan to change one word, no Save button waiting at the foot,
 * and no draft to lose. "Reset to built-in names" is in a menu, since it is
 * rare, and asks first because it saves at once.
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
 * defaults later move. That is why *Reset to built-in names* is a real action
 * with an observable effect rather than a cosmetic reset, and why it is offered
 * only to a company whose own words are saved: for one that follows the
 * defaults there is nothing to reset.
 *
 * ## A running period keeps the words it started with
 *
 * `ReviewCycle.scoringSnapshot` freezes the scale at activation. A mark from
 * 2026 has to explain itself in 2029, in the words it was given in — so
 * renaming a level here never rewrites a mark already awarded, and the toast
 * after a save says when it applies.
 */
/** The built-in word and meaning for every level of a scale of this size. */
const defaultLevels = (max: number): ApiRatingLevel[] =>
  Array.from({ length: max }, (_, index) => index + 1).map((level) => ({
    level,
    label: RATING_LABELS[level] ?? String(level),
    meaning: RATING_MEANING[level] ?? "",
  }));

/**
 * Why this set cannot be saved, in the API's own words, or null.
 *
 * Checked here **as well as** on the server, never instead of it: the server
 * is where the rule is real, and this exists so nobody meets the refusal by
 * surprise after pressing Save. The sentences match the service's, so the two
 * cannot come to disagree about what is wrong. The form does not print the
 * sentence: it marks the box that is the problem and leaves Save off.
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
    return "Two levels cannot share a word, a reader could not tell them apart.";
  }
  return null;
}

export function RatingScaleForm() {
  const canManage = useCan("MANAGE_SETTINGS");
  const { scale, loading, error, source, editable, refusal, save } =
    useRatingScale();
  const toast = useToast();
  const change = canManage && editable;

  /* The rating whose word is open in the dialog, and whether the built-in names
     are being offered. */
  const [editing, setEditing] = useState<number | null>(null);
  const [resetting, setResetting] = useState(false);
  const [saving, setSaving] = useState(false);

  /** Writes the whole set and says so, or says it was refused. */
  const write = async (entries: ApiRatingLevel[]) => {
    setSaving(true);
    try {
      await save(
        entries.map((entry) => ({
          level: entry.level,
          label: entry.label.trim(),
          meaning: entry.meaning.trim(),
        })),
      );
      setEditing(null);
      setResetting(false);
      toast.push({
        tone: "success",
        title: "Rating names saved",
        /* A period already running keeps its own copy, so nothing already
           awarded is re-worded under anybody. */
        detail: NEXT_PERIOD,
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

  const demo = sourceNote(source === "api");
  const canReset = change && scale.source === "saved";
  const open = scale.levels.find((entry) => entry.level === editing);

  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      <LoadFailure subject="the rating scale" error={error} />

      {loading ? (
        <span className="flex items-center gap-2 text-body-sm text-muted">
          <Spinner size="sm" />
          {LOADING}
        </span>
      ) : (
        <>
          {!editable && (
            <Callout tone="warning" title="You can't change these here">
              <p>{refusal}</p>
            </Callout>
          )}
          {editable && !canManage && (
            <p className="text-body-sm text-muted">{READ_ONLY_MANY}</p>
          )}

          {(demo || canReset) && (
            <div className="flex items-center justify-end gap-2">
              {demo && (
                <Badge tone="warning" size="sm" dot>
                  {demo}
                </Badge>
              )}
              {/* Rare, so in a menu; and absent when the company follows the
                  built-in names, since there is nothing to go back to. */}
              <RowActions
                label="More actions for rating names"
                items={[
                  {
                    label: "Reset to built-in names",
                    onSelect: () => setResetting(true),
                    available: canReset,
                  },
                ]}
              />
            </div>
          )}

          {/* Highest first. The list reads top-down as "best to worst", which is
              the order the company's own guide will be written in and the order
              a reader expects; the API stores and serves them ascending by
              level, and nothing about the order here changes what is sent. */}
          <ul className="divide-y divide-line">
            {[...scale.levels].reverse().map((entry) => (
              <li key={entry.level} className="flex items-center gap-4 py-2.5">
                <span className="tabular w-6 text-body-md font-semibold text-ink">
                  {entry.level}
                </span>
                <span className="min-w-0 flex-1 text-body-sm text-ink">
                  {entry.label}
                </span>
                {change && (
                  <IconButton
                    label={`Edit rating ${String(entry.level)}`}
                    size="sm"
                    onClick={() => setEditing(entry.level)}
                  >
                    <Pencil aria-hidden="true" />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {open && (
        <RatingDialog
          level={open}
          levels={scale.levels}
          saving={saving}
          onClose={() => setEditing(null)}
          onSave={(next) =>
            void write(
              scale.levels.map((entry) =>
                entry.level === next.level ? next : entry,
              ),
            )
          }
        />
      )}

      <ConfirmDialog
        open={resetting}
        onClose={() => setResetting(false)}
        title="Reset to the built-in names?"
        body={null}
        confirmLabel="Reset"
        tone="primary"
        loading={saving}
        onConfirm={() => void write(defaultLevels(scale.max))}
      />
    </div>
  );
}

/**
 * One rating's word and what it means.
 *
 * The word is the box that can be wrong: blank, or the same as another rating's
 * (a reader could not tell them apart). It is marked, with no sentence under it,
 * and Save stays off until it is right. Nothing is held between openings: it
 * starts from the saved rating each time.
 */
function RatingDialog({
  level,
  levels,
  saving,
  onClose,
  onSave,
}: {
  level: ApiRatingLevel;
  levels: ApiRatingLevel[];
  saving: boolean;
  onClose: () => void;
  onSave: (next: ApiRatingLevel) => void;
}) {
  const [label, setLabel] = useState(level.label);
  const [meaning, setMeaning] = useState(level.meaning);

  const next: ApiRatingLevel = { level: level.level, label, meaning };
  const problem = scaleProblem(
    levels.map((entry) => (entry.level === level.level ? next : entry)),
  );
  const changed = label !== level.label || meaning !== level.meaning;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Rating ${String(level.level)}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={saving}
            disabled={!changed || problem !== null}
            onClick={() => onSave(next)}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name">
          <Input
            autoFocus
            value={label}
            maxLength={40}
            aria-invalid={problem !== null ? true : undefined}
            onChange={(event) => setLabel(event.target.value)}
          />
        </Field>
        <Field label="Meaning" optional>
          <Textarea
            rows={3}
            value={meaning}
            maxLength={300}
            onChange={(event) => setMeaning(event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
