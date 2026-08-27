"use client";

import { Sparkles } from "lucide-react";
import { Button, Callout, Disclosure, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ApiSuggestion } from "@/lib/api/ai";
import { useAssistantAvailable, type SuggestState } from "@/lib/store/ai";

/**
 * One suggestion panel, used by all three call sites.
 *
 * Objectives under a goal, a progress note from a headline, development areas
 * behind a low score — three different asks and **one** component, because the
 * rules below have to hold identically in all three and three copies would
 * drift until one of them stopped saying where a sentence came from.
 *
 * ## The four rules, each visible on screen
 *
 * 1. **Nothing is applied on arrival.** A suggestion is a button somebody
 *    presses. `onUse` fires only from a click, and what it hands back goes into
 *    an editable field — never straight into a save. A panel that filled the
 *    form as it loaded would be submitting generated text under somebody's name
 *    by default, and at an appraisal that is a fabricated record.
 * 2. **It always says what it was based on.** `groundedIn.summary` is on the
 *    header and the exact facts are one reveal away, verbatim. A suggestion
 *    with nothing behind it is a guess wearing the product's authority.
 * 3. **Absent, not disabled.** With no assistant the button is not rendered at
 *    all — same rule as the nav and the dashboard tiles. A control that is
 *    always refused teaches people the product is broken.
 * 4. **A refusal is shown in the API's own words.** Whether a goal is frozen or
 *    nobody has been scored, the server wrote the sentence and it knows which
 *    fact is missing. Nothing here paraphrases it.
 *
 * ## Why the reveal is closed and the refusal is not
 *
 * `PARITY.md` Rule 5: a reveal may hide a detail and must never hide a blocker.
 * The facts list is a detail — most people will trust the one-line summary —
 * and a refusal is the thing somebody has to act on, so it renders open.
 */

export function SuggestButton({
  onClick,
  loading,
  label = "Suggest",
  size = "sm",
}: {
  onClick: () => void;
  loading: boolean;
  label?: string;
  size?: "sm" | "md";
}) {
  const { available, loading: checking } = useAssistantAvailable();

  /* Absent while we do not yet know, and absent when the answer is no. A button
     that appears a moment after the form has already been typed into moves the
     layout under somebody mid-sentence. */
  if (checking || !available) return null;

  return (
    <Button
      type="button"
      variant="secondary"
      size={size}
      loading={loading}
      onClick={onClick}
    >
      <Sparkles aria-hidden="true" className="size-3.5" />
      {label}
    </Button>
  );
}

/**
 * The result: a list to choose from, a refusal, or nothing yet.
 *
 * `renderTitle` exists because the three kinds read differently — an objective's
 * title is the objective, a development area's title is the competency it is
 * about, and a progress note has no title worth repeating because it is the
 * headline the person already typed. Passing a renderer rather than branching on
 * a `kind` keeps this file ignorant of what it is suggesting, which is what lets
 * a fourth call site arrive without editing it.
 */
export function SuggestionPanel({
  state,
  onUse,
  onDismiss,
  useLabel = "Use this",
  emptyHint,
}: {
  state: SuggestState;
  /** Fires only from a click. Hand the text to an editable field, never a save. */
  onUse: (suggestion: ApiSuggestion) => void;
  onDismiss: () => void;
  useLabel?: string;
  /** One line under the header, e.g. "You can edit it after." */
  emptyHint?: string;
}) {
  if (state.loading) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-line bg-canvas p-3 text-body-sm text-muted">
        <Spinner size="sm" />
        Drafting a few suggestions
      </div>
    );
  }

  /* A refusal about the request — a frozen goal, an unscored employee. The
     API's sentence, unchanged, and open rather than behind a reveal because it
     is the thing somebody has to act on. */
  if (state.error) {
    return (
      <Callout tone="warning" title="No suggestion this time">
        {state.error}
      </Callout>
    );
  }

  if (!state.outcome) return null;

  /* A refusal about the *assistant*, which is a different fact from the one
     above and is nobody on this screen's to fix. Neutral rather than a warning:
     the form works perfectly well without it. */
  if (!state.outcome.available) {
    return (
      <Callout tone="neutral" title="Suggestions are unavailable">
        {state.outcome.reason}
      </Callout>
    );
  }

  const { suggestions, groundedIn } = state.outcome;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-accent-line bg-accent-soft p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-body-sm font-medium text-ink">
            <Sparkles aria-hidden="true" className="size-3.5" />
            {suggestions.length} suggestion
            {suggestions.length === 1 ? "" : "s"}
          </span>
          {/* Rule 2. Never rendered without this line. */}
          <span className="mt-0.5 block text-meta text-muted">
            Drafted from {groundedIn.summary}.
            {emptyHint ? ` ${emptyHint}` : ""}
          </span>
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>

      <ul className="flex flex-col gap-2">
        {suggestions.map((suggestion, index) => (
          <li
            key={`${suggestion.title}-${String(index)}`}
            className={cn(
              "flex flex-wrap items-start justify-between gap-3",
              "rounded-md border border-line bg-surface p-3",
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-body-sm font-medium text-ink">
                {suggestion.title}
              </span>
              {suggestion.detail && (
                <span className="mt-1 block text-meta text-body">
                  {suggestion.detail}
                </span>
              )}
              <Measures suggestion={suggestion} />
            </span>
            {/* Rule 1: the only way a suggestion reaches a field. */}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onUse(suggestion)}
            >
              {useLabel}
            </Button>
          </li>
        ))}
      </ul>

      {groundedIn.facts.length > 0 && (
        <Disclosure
          title="What this was based on"
          meta={`${groundedIn.facts.length} fact${groundedIn.facts.length === 1 ? "" : "s"}`}
        >
          <ul className="flex list-disc flex-col gap-1 pl-4 text-meta text-muted">
            {groundedIn.facts.map((fact, index) => (
              <li key={`${String(index)}-${fact.slice(0, 24)}`}>{fact}</li>
            ))}
          </ul>
        </Disclosure>
      )}

      <p className="text-meta text-muted">
        Suggestions are a starting point. Nothing is saved until you edit it and
        submit it yourself.
      </p>
    </div>
  );
}

/**
 * An objective's measures, where the suggestion carried them.
 *
 * Read defensively rather than typed on the wire: `fields` is deliberately
 * loose (`Record<string, unknown>`) so a new kind of suggestion needs no change
 * to the API wrapper, and narrowing it is the one caller's job. A malformed
 * element renders nothing rather than throwing — a suggestion is not worth a
 * blank screen.
 *
 * **No target figures.** The API's prompt forbids the model putting numbers on
 * a suggested measure and this renders none, because a target somebody did not
 * choose is exactly the invented figure this whole module refuses to produce.
 */
function Measures({ suggestion }: { suggestion: ApiSuggestion }) {
  const raw = suggestion.fields?.["measures"];
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const measures = raw.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const row = entry as Record<string, unknown>;
    const label = typeof row["label"] === "string" ? row["label"].trim() : "";
    if (!label) return [];
    const unit = typeof row["unit"] === "string" ? row["unit"].trim() : "";
    return [{ label, unit }];
  });
  if (measures.length === 0) return null;

  return (
    <span className="mt-1.5 flex flex-wrap gap-1.5">
      {measures.map((measure, index) => (
        <span
          key={`${measure.label}-${String(index)}`}
          className="rounded border border-line px-1.5 py-0.5 text-meta text-muted"
        >
          {measure.label}
          {measure.unit ? ` (${measure.unit})` : ""}
        </span>
      ))}
    </span>
  );
}
