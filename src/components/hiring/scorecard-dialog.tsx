"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import {
  Button,
  Callout,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
} from "@/components/ui";
import {
  RECOMMENDATION_LABEL,
  type ScorecardRecommendation,
} from "@/lib/api/recruitment";
import type { ScorecardInput } from "@/lib/hiring/comms/model";
import { scoreOfRatings } from "@/lib/hiring/comms/score";
import { sentenceOf } from "@/lib/hiring/pipeline/errors";

/**
 * Handing in a scorecard.
 *
 * Each thing rated has a score from 1 to 5 and a **weight**: how much it counts
 * towards the person's score. Everything starts at a weight of 1, so by default the
 * score is the plain average, and a panel that agreed "technical depth counts
 * double" can say so here. The score the ratings come to is shown as they are
 * typed, worked out the way the API works it out, so nobody submits a number that
 * surprises them afterwards.
 *
 * Only what is rated counts. A thing left as "Not rated" is not a zero.
 *
 * Used for an interview on the candidate's record and for a panelist's own page.
 */

const DEFAULTS = [
  "Technical depth",
  "Communication",
  "Ownership",
  "Culture fit",
];

type Row = {
  id: string;
  competency: string;
  custom: boolean;
  score: string;
  weight: string;
};

const MAX_ROWS = 30;
const MAX_WEIGHT = 9.9999;

const starting = (): Row[] =>
  DEFAULTS.map((competency, index) => ({
    id: `d${String(index)}`,
    competency,
    custom: false,
    score: "",
    weight: "1",
  }));

const weightOf = (text: string): number =>
  text.trim() === "" ? 1 : Number(text);

const weightProblem = (text: string): string | null => {
  const weight = weightOf(text);
  if (!Number.isFinite(weight) || weight <= 0)
    return "A weight of zero would drop it from the score. Use a number above 0.";
  if (weight > MAX_WEIGHT) return "Keep the weight to 9.9999 or less.";
  return null;
};

let added = 0;

export function ScorecardDialog({
  open,
  onClose,
  onConfirm,
  title = "Submit a scorecard",
  description,
}: {
  open: boolean;
  onClose: () => void;
  /** Rejects with the API's refusal, which is shown inside the dialog. */
  onConfirm: (input: ScorecardInput) => Promise<void>;
  title?: string;
  description?: string;
}) {
  const [rows, setRows] = useState<Row[]>(starting);
  const [recommendation, setRecommendation] = useState<
    ScorecardRecommendation | ""
  >("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(false);

  /* Each time it opens it starts blank, so the last interview's ratings are never
     offered for the next one. */
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setRows(starting());
      setRecommendation("");
      setNotes("");
      setBusy(false);
      setTried(false);
      setRefused(null);
    }
  }

  const rated = rows.filter((row) => row.score !== "");
  const badWeight = rated.some((row) => weightProblem(row.weight) !== null);
  const soFar = badWeight
    ? null
    : scoreOfRatings(
        rated.map((row) => ({
          competency: row.competency,
          score: Number(row.score),
          weight: weightOf(row.weight),
        })),
      );
  const nothing = rated.length === 0 && recommendation === "";
  const unnamed = rated.some((row) => row.competency.trim() === "");

  const patch = (id: string, change: Partial<Row>) =>
    setRows((list) =>
      list.map((row) => (row.id === id ? { ...row, ...change } : row)),
    );

  async function submit() {
    setTried(true);
    setRefused(null);
    if (nothing || badWeight || unnamed) return;
    setBusy(true);
    try {
      await onConfirm({
        recommendation: recommendation === "" ? null : recommendation,
        notes: notes.trim(),
        ratings: rated.map((row) => ({
          competency: row.competency.trim(),
          score: Number(row.score),
          weight: weightOf(row.weight),
          comment: "",
        })),
      });
    } catch (error) {
      setRefused(sentenceOf(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={title}
      {...(description ? { description } : {})}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="accent" loading={busy} onClick={() => void submit()}>
            Submit
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body-sm text-muted">
          Score each thing from 1 to 5. The weight is how much it counts: leave
          it at 1 unless the panel agreed otherwise.
        </p>
        <div
          aria-hidden="true"
          className="-mb-2 hidden gap-3 text-meta text-muted sm:grid sm:grid-cols-[minmax(0,1fr)_9rem_6rem]"
        >
          <span>What you are rating</span>
          <span>Score</span>
          <span>Weight</span>
        </div>
        <ul className="flex flex-col gap-3">
          {rows.map((row) => {
            const problem =
              tried && row.score !== "" ? weightProblem(row.weight) : null;
            return (
              <li
                key={row.id}
                className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_6rem] sm:items-end"
              >
                {row.custom ? (
                  <Field label="Competency">
                    <Input
                      value={row.competency}
                      maxLength={80}
                      placeholder="What are you rating?"
                      onChange={(event) =>
                        patch(row.id, { competency: event.target.value })
                      }
                    />
                  </Field>
                ) : (
                  <p className="text-body-sm font-medium text-ink sm:pb-2.5">
                    {row.competency}
                  </p>
                )}
                <div className="flex flex-col gap-1">
                  {/* A heading row names these on a wide screen; on a phone each
                      sits above its own box. The box's own name is the label. */}
                  <span
                    aria-hidden="true"
                    className="text-meta text-muted sm:hidden"
                  >
                    Score
                  </span>
                  <Select
                    aria-label={`Score for ${row.competency || "this competency"}`}
                    value={row.score}
                    placeholder="Not rated"
                    onChange={(event) =>
                      patch(row.id, { score: event.target.value })
                    }
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={String(n)}>
                        {n} / 5
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <span
                    aria-hidden="true"
                    className="text-meta text-muted sm:hidden"
                  >
                    Weight
                  </span>
                  <Input
                    inputMode="decimal"
                    aria-label={`Weight for ${row.competency || "this competency"}`}
                    aria-invalid={problem ? true : undefined}
                    value={row.weight}
                    onChange={(event) =>
                      patch(row.id, { weight: event.target.value })
                    }
                  />
                  {problem && (
                    <p role="alert" className="text-meta text-danger-text">
                      {problem}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div>
          <Button
            variant="ghost"
            size="sm"
            disabled={rows.length >= MAX_ROWS}
            onClick={() => {
              added += 1;
              setRows((list) => [
                ...list,
                {
                  id: `c${String(added)}`,
                  competency: "",
                  custom: true,
                  score: "",
                  weight: "1",
                },
              ]);
            }}
          >
            <Plus aria-hidden="true" className="size-3.5" />
            Rate something else
          </Button>
        </div>

        <p className="rounded-md bg-sunken px-3 py-2 text-body-sm text-body">
          {soFar !== null
            ? `Score so far: ${soFar.toFixed(2)} out of 5. Each rating counts in proportion to its weight, and what is not rated is left out.`
            : badWeight
              ? "Fix the weights to see the score."
              : "Rate something to see the score it comes to."}
        </p>

        <Field label="Recommendation" optional>
          <Select
            value={recommendation}
            onChange={(event) =>
              setRecommendation(event.target.value as ScorecardRecommendation)
            }
            placeholder="Not given"
          >
            {(
              Object.keys(RECOMMENDATION_LABEL) as ScorecardRecommendation[]
            ).map((r) => (
              <option key={r} value={r}>
                {RECOMMENDATION_LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notes" optional>
          <Textarea
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>

        {tried && nothing && (
          <p role="alert" className="text-body-sm text-danger-text">
            Rate at least one thing, or give a recommendation.
          </p>
        )}
        {tried && unnamed && (
          <p role="alert" className="text-body-sm text-danger-text">
            Name what you are rating, or clear its score.
          </p>
        )}
        {refused && (
          <Callout tone="danger" title="The scorecard was not accepted">
            {refused}
          </Callout>
        )}
      </div>
    </Modal>
  );
}
