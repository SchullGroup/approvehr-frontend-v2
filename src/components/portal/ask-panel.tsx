"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button, Card, CardBody, CardHeader, Input, Spinner } from "@/components/ui";
import { useAsk, useAssistantAvailable } from "@/lib/store/ai";

/**
 * Ask a question about the company's own records.
 *
 * ## Absent, not disabled
 *
 * Renders nothing at all when no assistant is wired, which is the rule every
 * other suggestion surface in this product follows: a control that is present
 * and always refuses teaches people the product is broken. `/settings/ai` is
 * where somebody finds out the capability exists and how to switch it on —
 * discoverability and availability are two different jobs, and this component
 * only does the second.
 *
 * ## The reads are shown, not logged
 *
 * Every answer carries the reads it came from, on screen. An answer whose
 * working cannot be checked is an oracle, and this product is sold against a
 * competitor that shipped exactly that. It is also the honest way to explain a
 * short answer: "I looked at the headcount and did not find that" reads very
 * differently from a model shrugging.
 *
 * ## Not a conversation
 *
 * Each answer replaces the last. The API holds no history — every question
 * carries its own whole context — and a running transcript here would imply a
 * memory that does not exist, which is the kind of small lie that costs trust
 * the first time somebody says "as I mentioned above" and it means nothing.
 */
export function AskPanel() {
  const assistant = useAssistantAvailable();
  const { ask, answer, asking, error, clear } = useAsk();
  const [question, setQuestion] = useState("");

  if (assistant.loading || !assistant.available) return null;

  const send = () => {
    const trimmed = question.trim();
    if (trimmed.length < 3 || asking) return;
    void ask(trimmed);
  };

  return (
    <Card>
      <CardHeader
        level={3}
        title="Ask about your company"
        description="Your people, your payroll runs, and what you deduct. It reads your records — it does not change anything."
      />
      <CardBody className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={question}
            placeholder="How many people have no bank account?"
            aria-label="Your question"
            className="min-w-0 flex-1"
            onChange={(event) => setQuestion(event.target.value)}
            /* Enter sends. This is one field and one button, so there is no
               form to submit and nothing else Enter could reasonably do. */
            onKeyDown={(event) => {
              if (event.key === "Enter") send();
            }}
          />
          <Button
            variant="accent"
            size="sm"
            loading={asking}
            disabled={question.trim().length < 3}
            onClick={send}
          >
            {!asking && <Sparkles aria-hidden="true" className="size-3.5" />}
            Ask
          </Button>
        </div>

        {asking && (
          <span className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Looking through your records
          </span>
        )}

        {error && (
          <p
            role="status"
            className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-body-sm text-ink"
          >
            {error}
          </p>
        )}

        {answer && !asking && (
          <div className="rounded-md border border-line bg-canvas px-3 py-2">
            {/* The API's own sentence when it refused. Never paraphrased —
                it knows whether this was a missing key, a permission or a
                question about nothing, and nothing here does. */}
            <p className="text-body-sm leading-relaxed whitespace-pre-wrap text-ink">
              {answer.text ?? answer.reason}
            </p>
            {answer.used.length > 0 && (
              <p className="mt-2 text-meta text-muted">
                Read from: {answer.used.join(", ").replace(/_/g, " ")}
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                clear();
                setQuestion("");
              }}
              className="mt-2 text-meta text-muted underline-offset-2 hover:text-accent-text hover:underline"
            >
              Ask something else
            </button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
