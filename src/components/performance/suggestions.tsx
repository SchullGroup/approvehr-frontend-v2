"use client";

import { Sparkles } from "lucide-react";
import { Button, Callout, Disclosure, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ApiSuggestion } from "@/lib/api/ai";
import { useAssistantAvailable, type SuggestState } from "@/lib/store/ai";

/**
 * Shared AI suggestion panel, used by all three call sites (objectives,
 * progress notes, development areas) so the rules below hold identically
 * everywhere.
 *
 * - Nothing is applied automatically: `onUse` fires only on click, into an
 *   editable field, never straight to save.
 * - Always shows what it was grounded in (`groundedIn`), so a suggestion is
 *   never presented with no basis.
 * - With no assistant available, the button is absent, not disabled.
 * - A refusal is shown in the API's own words, unparaphrased.
 *
 * The facts list is behind a reveal (a detail); a refusal is not (a blocker
 * somebody must act on) — see `PARITY.md` Rule 5.
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

  /* Absent while unknown and absent when unavailable — never appears late and
     shifts the layout under someone mid-edit. */
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

  /* A refusal about the request (e.g. a frozen goal) — the API's own sentence. */
  if (state.error) {
    return (
      <Callout tone="warning" title="No suggestion this time">
        {state.error}
      </Callout>
    );
  }

  if (!state.outcome) return null;

  /* A refusal about the assistant itself, not the request — neutral tone since
     the form works fine without it. */
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
            Drafted from {groundedIn.summary}.{emptyHint ? ` ${emptyHint}` : ""}
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
 * `fields` is loosely typed (`Record<string, unknown>`) and read defensively
 * here rather than on the wire, so a malformed element renders nothing instead
 * of throwing. Deliberately renders no target figures — the API's prompt
 * forbids the model inventing them, and this component must not either.
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
