"use client";

import { useState } from "react";
import { Lightbulb } from "lucide-react";
import {
  Button,
  Callout,
  Checkbox,
  Disclosure,
  Field,
  FieldRow,
  Input,
  Select,
} from "@/components/ui";
import { ChipInput } from "@/components/hiring/screening/chip-input";
import {
  LIMITS,
  WEIGHT_LABEL,
  parseWeight,
  weightsLine,
  withChips,
  type CriteriaProblems,
} from "@/lib/hiring/screening/criteria";
import {
  WEIGHT_KEYS,
  type Criteria,
  type EducationLevel,
  type Keyword,
  type Suggestion,
  type Weights,
} from "@/lib/hiring/screening/model";

/**
 * What an advert's applicants are matched against.
 *
 * A controlled form: it shows the draft it is given and hands every change back.
 * Saving, previewing and the "unsaved changes" guard belong to the panel around
 * it (`criteria-panel.tsx`), so the form can be tested on its own.
 *
 * ## Written down, not learned
 *
 * Every box here is something a person typed: a list of skills, a number of years,
 * a level, a place. The score is a count of how many of them a CV mentions, and
 * the explanation says which. There is nothing hidden for it to weigh.
 *
 * ## Level, never school
 *
 * Education is a step on an ordered scale, because "a bachelor's degree" is a fair
 * thing to ask for and "from a particular university" is not. The list of what the
 * score never looks at is printed at the foot of the form, from the API's own
 * list, so nobody has to take that on trust.
 */

export function CriteriaEditor({
  value,
  onChange,
  problems,
  scale,
  defaults,
  neverUsed,
  onSuggest,
  disabled = false,
}: {
  value: Criteria;
  onChange: (next: Criteria) => void;
  problems: CriteriaProblems;
  scale: EducationLevel[];
  defaults: Weights;
  /** What the score never uses, as the API lists it. */
  neverUsed: string[];
  /** Absent hides the button. */
  onSuggest?: (() => Promise<Suggestion>) | undefined;
  disabled?: boolean;
}) {
  const set = <K extends keyof Criteria>(key: K, next: Criteria[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <div className="flex flex-col gap-6">
      {onSuggest && (
        <Suggest
          criteria={value}
          onSuggest={onSuggest}
          onAccept={onChange}
          scale={scale}
          disabled={disabled}
        />
      )}

      <ChipInput
        label="Must-have skills"
        help="Things the person has to show. Press Enter or a comma after each one. The pencil adds other spellings."
        placeholder="For example Payroll, PAYE"
        value={value.mustHave}
        error={problems.mustHave}
        disabled={disabled}
        onChange={(next) => set("mustHave", next)}
      />

      <ChipInput
        label="Nice-to-have skills"
        help="Things that count in their favour but are not required."
        placeholder="For example Excel, ICAN"
        value={value.niceToHave}
        error={problems.niceToHave}
        disabled={disabled}
        onChange={(next) => set("niceToHave", next)}
      />

      <FieldRow>
        <Field
          label="Years of experience, at least"
          optional
          {...(problems.minYears ? { error: problems.minYears } : {})}
        >
          <Input
            inputMode="numeric"
            value={value.minYears === null ? "" : String(value.minYears)}
            disabled={disabled}
            placeholder="3"
            onChange={(event) => {
              const text = event.target.value.replace(/[^0-9]/g, "");
              set("minYears", text === "" ? null : Number(text));
            }}
          />
        </Field>
        <Field
          label="Education level, at least"
          optional
          help="A level only. The score never looks at which school."
        >
          <Select
            value={value.education ?? ""}
            disabled={disabled}
            onChange={(event) => set("education", event.target.value || null)}
          >
            <option value="">Not asked</option>
            {scale.map((level) => (
              <option key={level.value} value={level.value}>
                {level.label}
              </option>
            ))}
          </Select>
        </Field>
      </FieldRow>

      <div className="flex flex-col gap-3">
        <Field
          label="Where the job is"
          optional
          {...(problems.place ? { error: problems.place } : {})}
        >
          <Input
            value={value.place ?? ""}
            disabled={disabled}
            maxLength={LIMITS.place + 20}
            placeholder="Lagos"
            onChange={(event) => set("place", event.target.value || null)}
          />
        </Field>
        <Checkbox
          label="Count people elsewhere who say they would relocate"
          checked={value.relocation}
          disabled={disabled || !value.place}
          onChange={(event) => set("relocation", event.target.checked)}
        />
      </div>

      <WeightsField
        value={value.weights}
        defaults={defaults}
        problem={problems.weights}
        disabled={disabled}
        onChange={(next) => set("weights", next)}
      />

      <div>
        <h4 className="text-body-sm font-semibold text-ink">
          What the score never uses
        </h4>
        <ul className="mt-1.5 list-disc pl-5 text-body-sm text-body">
          {neverUsed.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      {problems.form && (
        <p role="alert" className="text-body-sm text-danger-text">
          {problems.form}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- weights */

function WeightsField({
  value,
  defaults,
  problem,
  disabled,
  onChange,
}: {
  value: Weights | null;
  defaults: Weights;
  problem: string | undefined;
  disabled: boolean;
  onChange: (next: Weights | null) => void;
}) {
  /* What is in each box as text, so a half-typed figure is not snapped to a
     number the moment it is typed. */
  const [text, setText] = useState<Partial<Record<keyof Weights, string>>>({});

  return (
    <Disclosure
      title="Weights"
      meta={value ? "Your own" : "The defaults"}
      keepMounted
    >
      <div className="flex flex-col gap-4">
        <p className="text-body-sm text-body">
          By default each part counts like this: {weightsLine(defaults)}. They
          count in proportion, so they do not have to add up to 100, and a part
          you have not asked for does not count at all. Leave them alone unless
          you have a reason.
        </p>
        <Checkbox
          label="Set my own weights"
          checked={value !== null}
          disabled={disabled}
          onChange={(event) => {
            setText({});
            onChange(event.target.checked ? { ...defaults } : null);
          }}
        />
        {value && (
          <FieldRow cols={3} phone="pair">
            {WEIGHT_KEYS.map((key) => {
              const shown = text[key] ?? String(value[key]);
              const bad = parseWeight(shown) === null;
              return (
                <Field
                  key={key}
                  label={WEIGHT_LABEL[key]}
                  {...(bad ? { error: "0 to 100" } : {})}
                >
                  <Input
                    inputMode="numeric"
                    value={shown}
                    disabled={disabled}
                    onChange={(event) => {
                      const next = event.target.value;
                      setText((now) => ({ ...now, [key]: next }));
                      const parsed = parseWeight(next);
                      if (parsed !== null)
                        onChange({ ...value, [key]: parsed });
                    }}
                  />
                </Field>
              );
            })}
          </FieldRow>
        )}
        {problem && (
          <p role="alert" className="text-body-sm text-danger-text">
            {problem}
          </p>
        )}
      </div>
    </Disclosure>
  );
}

/* ----------------------------------------------------------------- suggesting */

function Suggest({
  criteria,
  onSuggest,
  onAccept,
  scale,
  disabled,
}: {
  criteria: Criteria;
  onSuggest: () => Promise<Suggestion>;
  onAccept: (next: Criteria) => void;
  scale: EducationLevel[];
  disabled: boolean;
}) {
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ready"; suggestion: Suggestion }
    | { status: "failed"; message: string }
  >({ status: "idle" });

  async function ask() {
    setState({ status: "loading" });
    try {
      setState({ status: "ready", suggestion: await onSuggest() });
    } catch (error) {
      setState({
        status: "failed",
        message:
          error instanceof Error && error.message
            ? error.message
            : "No suggestions could be made. Try again.",
      });
    }
  }

  const accept = (list: "mustHave" | "niceToHave", chips: Keyword[]): void =>
    onAccept(withChips(criteria, list, chips));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          loading={state.status === "loading"}
          disabled={disabled}
          onClick={() => void ask()}
        >
          <Lightbulb aria-hidden="true" className="size-3.5" />
          Suggest from the job description
        </Button>
        <p className="text-meta text-muted">
          It reads the words in the advert. You choose which to keep.
        </p>
      </div>

      {state.status === "failed" && (
        <p role="alert" className="text-body-sm text-danger-text">
          {state.message}
        </p>
      )}

      {state.status === "ready" && (
        <SuggestionList
          suggestion={state.suggestion}
          criteria={criteria}
          scale={scale}
          onAccept={accept}
          onAcceptYears={(years) => onAccept({ ...criteria, minYears: years })}
          onAcceptEducation={(level) =>
            onAccept({ ...criteria, education: level })
          }
          onClose={() => setState({ status: "idle" })}
        />
      )}
    </div>
  );
}

function SuggestionList({
  suggestion,
  criteria,
  scale,
  onAccept,
  onAcceptYears,
  onAcceptEducation,
  onClose,
}: {
  suggestion: Suggestion;
  criteria: Criteria;
  scale: EducationLevel[];
  onAccept: (list: "mustHave" | "niceToHave", chips: Keyword[]) => void;
  onAcceptYears: (years: number) => void;
  onAcceptEducation: (level: string) => void;
  onClose: () => void;
}) {
  const have = new Set(
    [...criteria.mustHave, ...criteria.niceToHave].map((chip) =>
      chip.label.toLowerCase(),
    ),
  );
  const fresh = (chips: Keyword[]) =>
    chips.filter((chip) => !have.has(chip.label.toLowerCase()));
  const must = fresh(suggestion.mustHave);
  const nice = fresh(suggestion.niceToHave);
  const yearsNew =
    suggestion.minYears !== null && criteria.minYears !== suggestion.minYears;
  const educationNew =
    suggestion.education !== null &&
    criteria.education !== suggestion.education;
  const nothing =
    must.length === 0 && nice.length === 0 && !yearsNew && !educationNew;

  return (
    <Callout tone="neutral" title="Suggestions from the advert">
      <div className="flex flex-col gap-3">
        {suggestion.note && <p>{suggestion.note}</p>}
        {nothing && (
          <p>
            Nothing new to add: either the advert names nothing specific, or
            what it names is already in the lists.
          </p>
        )}
        {must.length > 0 && (
          <SuggestionGroup
            title="Must-have"
            chips={must}
            onAdd={(chips) => onAccept("mustHave", chips)}
          />
        )}
        {nice.length > 0 && (
          <SuggestionGroup
            title="Nice-to-have"
            chips={nice}
            onAdd={(chips) => onAccept("niceToHave", chips)}
          />
        )}
        {yearsNew && suggestion.minYears !== null && (
          <p className="flex flex-wrap items-center gap-2">
            The advert mentions {suggestion.minYears}{" "}
            {suggestion.minYears === 1 ? "year" : "years"}.
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onAcceptYears(suggestion.minYears ?? 0)}
            >
              Ask for at least {suggestion.minYears}
            </Button>
          </p>
        )}
        {educationNew && suggestion.education !== null && (
          <p className="flex flex-wrap items-center gap-2">
            The advert mentions a qualification.
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onAcceptEducation(suggestion.education ?? "")}
            >
              Ask for{" "}
              {scale.find((level) => level.value === suggestion.education)
                ?.label ?? "that level"}
            </Button>
          </p>
        )}
        <div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Callout>
  );
}

function SuggestionGroup({
  title,
  chips,
  onAdd,
}: {
  title: string;
  chips: Keyword[];
  onAdd: (chips: Keyword[]) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
        {title}
        <Button variant="secondary" size="sm" onClick={() => onAdd(chips)}>
          Add all {chips.length}
          <span className="sr-only"> {title.toLowerCase()} suggestions</span>
        </Button>
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <li key={chip.id}>
            <button
              type="button"
              onClick={() => onAdd([chip])}
              className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-meta font-medium text-ink hover:bg-sunken focus-visible:outline-2 focus-visible:outline-accent-text"
              aria-label={`Add ${chip.label} to ${title.toLowerCase()}`}
            >
              + {chip.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
