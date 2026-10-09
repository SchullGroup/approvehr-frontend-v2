"use client";

import { useEffect, useRef } from "react";
import { FileField, RadioCard } from "@/components/ui";
import type { ApiFormQuestion, ApiRatingScale } from "@/lib/api/performance";
import {
  AttachedEvidence,
  type Draft,
} from "@/app/(app)/performance/review-parts";
import { TEXT_LIMIT } from "./focus-logic";

/**
 * The input for one question, big enough to be the only thing on the page.
 *
 * What a question *is* — its kinds, how a draft becomes an answer, what counts
 * as filled — stays in `review-parts.tsx`, shared with the popup form and the
 * record. This file only decides what it looks like when it has the page to
 * itself, and which keys pick which option.
 */

/** One pickable option, with the key that picks it. */
export type PickOption = {
  value: string;
  label: string;
  /** What the option means, where it has a longer explanation. */
  meaning?: string;
  key: string;
};

/** A, B, C… for the Nth option of a list. */
const letter = (index: number) => String.fromCharCode(65 + index);

/** The company's own rating scale as options, each picked with its number. */
export function ratingOptions(scale: ApiRatingScale): PickOption[] {
  return scale.levels
    .filter((entry) => entry.level >= 0 && entry.level <= 9)
    .map((entry) => ({
      value: String(entry.level),
      label: entry.label,
      ...(entry.meaning ? { meaning: entry.meaning } : {}),
      key: String(entry.level),
    }));
}

/**
 * The options of a one-of-several question, or null for any other kind.
 *
 * A rating is picked with its number, because that is how people say it out
 * loud ("I gave her a four"); a yes/no with Y and N; a list with letters.
 */
export function pickOptions(
  question: ApiFormQuestion,
  scale: ApiRatingScale,
): PickOption[] | null {
  if (question.kind === "RATING") return ratingOptions(scale);
  if (question.kind === "BOOLEAN") {
    return [
      { value: "yes", label: "Yes", key: "Y" },
      { value: "no", label: "No", key: "N" },
    ];
  }
  if (question.kind === "CHOICE") {
    return question.options.slice(0, 26).map((option, index) => ({
      value: option,
      label: option,
      key: letter(index),
    }));
  }
  return null;
}

/** The draft that picking `value` makes. */
export function draftForPick(question: ApiFormQuestion, value: string): Draft {
  if (question.kind === "RATING") return { rating: value };
  if (question.kind === "BOOLEAN") return { bool: value };
  return { choice: value };
}

/** Which option a draft currently has picked. */
export function pickedValue(
  question: ApiFormQuestion,
  held: Draft,
): string | undefined {
  if (question.kind === "RATING") return held.rating;
  if (question.kind === "BOOLEAN") return held.bool;
  return held.choice;
}

function KeyBadge({ children }: { children: string }) {
  return (
    <span className="inline-flex size-6 items-center justify-center rounded-md border border-line bg-surface text-meta font-medium text-muted">
      {children}
    </span>
  );
}

/**
 * Options as large cards, with their keys.
 *
 * `RadioCard` is the card the popup form already uses, so a checked option
 * looks the same in both. The key sits in the card's icon slot.
 */
export function PickList({
  name,
  options,
  value,
  onPick,
  columns = 1,
}: {
  name: string;
  options: PickOption[];
  value: string | undefined;
  onPick: (value: string) => void;
  columns?: 1 | 2;
}) {
  return (
    <div
      role="radiogroup"
      className={columns === 2 ? "grid gap-3 sm:grid-cols-2" : "grid gap-3"}
    >
      {options.map((option) => (
        <RadioCard
          key={option.value}
          name={name}
          value={option.value}
          label={option.label}
          {...(option.meaning ? { description: option.meaning } : {})}
          icon={<KeyBadge>{option.key}</KeyBadge>}
          checked={value === option.value}
          onChange={() => onPick(option.value)}
        />
      ))}
    </div>
  );
}

/**
 * A paragraph box with no box: a line to write on.
 *
 * Grows with what is typed rather than scrolling inside itself, so a long
 * answer reads as a page and not as a small window onto one.
 */
export function WriteBox({
  value,
  onChange,
  labelledBy,
  placeholder = "Type your answer here",
}: {
  value: string;
  onChange: (next: string) => void;
  labelledBy: string;
  placeholder?: string;
}) {
  const box = useRef<HTMLTextAreaElement>(null);

  /* Fit the box to its text. A DOM measurement, not state: nothing about it
     needs to be rendered, only applied. */
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${String(element.scrollHeight)}px`;
  }, [value]);

  /* Arriving on a writing step puts the cursor in it. */
  useEffect(() => {
    box.current?.focus();
  }, []);

  /* The API refuses more than this, and it refuses the whole save — so a
     person who had written past it would have had nothing save, and no way to
     see why. The box stops at the limit, and says how close they are once they
     are near it. */
  const nearLimit = value.length >= TEXT_LIMIT - 500;

  return (
    <div>
      <textarea
        ref={box}
        rows={2}
        value={value}
        maxLength={TEXT_LIMIT}
        aria-labelledby={labelledBy}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="block max-h-[60dvh] min-h-24 w-full resize-none overflow-y-auto border-0 border-b-2 border-line bg-transparent px-0 py-2 text-lead text-ink placeholder:text-muted focus:border-accent focus:outline-none"
      />
      {nearLimit && (
        <p
          className={`mt-1.5 text-meta ${value.length >= TEXT_LIMIT ? "font-medium text-danger-text" : "text-muted"}`}
        >
          {value.length.toLocaleString("en-GB")} of{" "}
          {TEXT_LIMIT.toLocaleString("en-GB")} characters
        </p>
      )}
    </div>
  );
}

export function FocusQuestion({
  question,
  held,
  reviewId,
  headingId,
  scale,
  editable,
  onChange,
  onPick,
  onBusyChange,
}: {
  question: ApiFormQuestion;
  held: Draft;
  reviewId: string;
  /** Read once by the form and handed down, not asked for again on every page. */
  scale: ApiRatingScale;
  /** Whether an attached file can be opened from here. */
  editable: boolean;
  /** The id of the heading that carries the prompt, for the field's label. */
  headingId: string;
  /** A change that is not a pick: typing, or a file. */
  onChange: (next: Draft) => void;
  /** A pick from a list. The page moves on shortly after one. */
  onPick: (value: string) => void;
  /** So the page can hold Send while a file is still being read. */
  onBusyChange: (busy: boolean) => void;
}) {
  const options = pickOptions(question, scale);

  if (options) {
    return (
      <PickList
        name={`question-${question.id}`}
        options={options}
        value={pickedValue(question, held)}
        onPick={onPick}
        columns={question.kind === "BOOLEAN" ? 2 : 1}
      />
    );
  }

  if (question.kind === "FILE") {
    const attached = question.answer?.attachment ?? null;
    return (
      <div className="flex flex-col gap-3">
        <FileField
          label="Attach a file"
          help={
            attached
              ? "Choosing another file replaces the one on this answer."
              : "A report, a dashboard, a screenshot. PDFs, images and Office documents."
          }
          onAttached={(file) => onChange({ file: file ?? undefined })}
          onBusyChange={onBusyChange}
        />
        {attached && !held.file && (
          <AttachedEvidence
            reviewId={reviewId}
            questionId={question.id}
            attachment={attached}
            canOpen={editable}
          />
        )}
      </div>
    );
  }

  return (
    <WriteBox
      value={held.text ?? ""}
      onChange={(text) => onChange({ text })}
      labelledBy={headingId}
    />
  );
}
