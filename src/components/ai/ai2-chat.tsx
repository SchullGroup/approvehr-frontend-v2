"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCw, Send, Square } from "lucide-react";
import {
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Textarea,
} from "@/components/ui";
import { AssistantOrb } from "@/components/portal/assistant-orb";
import { LiveTurn } from "@/components/ai/turn-progress";
import { UsageGauge } from "@/components/ai/usage-gauge";
import {
  useAi2Available,
  useAi2Chat,
  MAX_AI2_MESSAGE_CHARS,
  type Ai2Turn,
} from "@/lib/store/ai2-chat";

/**
 * A conversation with the `/ai2` assistant, watched as it happens. Streaming
 * narrates lookups that can take several seconds each, not a typewriter
 * effect. Renders nothing when no assistant is wired.
 */

/** Openers, so an empty box is not a blank page. */
const OPENERS = [
  "How many people are on the payroll?",
  "Whose leave requests are still waiting?",
  "What did we spend on overtime last month?",
];

export function Ai2Chat() {
  const assistant = useAi2Available();
  const chat = useAi2Chat();
  const [draft, setDraft] = useState("");
  const composer = useRef<HTMLDivElement>(null);

  // Keyed on landed turns, not streaming text, so scrolling doesn't fight
  // somebody reading back up mid-answer.
  const landed = chat.turns.length;
  useEffect(() => {
    if (landed === 0) return;
    composer.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [landed]);

  if (assistant.loading || !assistant.available) return null;

  const send = async () => {
    if (await chat.send(draft)) setDraft("");
  };

  const overLimit = draft.length > MAX_AI2_MESSAGE_CHARS;
  const nearLimit = draft.length > MAX_AI2_MESSAGE_CHARS * 0.9;

  return (
    <Card>
      <CardHeader
        level={2}
        title="Ask about your records"
        description="It reads what you are allowed to see, and answers from that. It cannot change anything."
        action={
          chat.turns.length > 0 && !chat.sending ? (
            <Button variant="ghost" size="sm" onClick={chat.reset}>
              Start again
            </Button>
          ) : undefined
        }
      />

      <CardBody className="flex flex-col gap-4">
        <UsageGauge compact />

        {chat.turns.length === 0 && !chat.sending ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <AssistantOrb size={36} className="mt-0.5 shrink-0" />
              <p className="text-body-sm text-muted">
                Ask about your people, your leave, your payroll runs, or what
                you deduct. Try one of these:
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {OPENERS.map((opener) => (
                <button
                  key={opener}
                  type="button"
                  onClick={() => setDraft(opener)}
                  className="rounded-full border border-line bg-canvas px-3 py-1.5 text-body-sm text-body transition-colors hover:border-control-line hover:text-ink"
                >
                  {opener}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ol className="flex flex-col gap-4">
            {chat.turns.map((turn) => (
              <li key={turn.id}>
                <Turn turn={turn} />
              </li>
            ))}
            {chat.live && (
              <li>
                <LiveTurn live={chat.live} />
              </li>
            )}
          </ol>
        )}

        {chat.error && (
          <Callout tone="danger" title="No answer">
            <p>{chat.error}</p>
            {!chat.sending && (
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={() => void chat.retry()}
              >
                <RotateCw aria-hidden="true" className="size-3.5" />
                Ask it again
              </Button>
            )}
          </Callout>
        )}

        <div ref={composer} className="flex flex-col gap-2">
          <Textarea
            rows={2}
            value={draft}
            aria-label="Your question"
            placeholder="Ask a question about your records"
            disabled={chat.full}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-meta text-muted">
              Nothing here is saved. Closing this page ends the conversation.
            </p>
            <div className="flex items-center gap-3">
              {nearLimit && (
                <span
                  className={
                    overLimit
                      ? "text-meta text-danger-text"
                      : "text-meta text-muted"
                  }
                >
                  {draft.length.toLocaleString()} /{" "}
                  {MAX_AI2_MESSAGE_CHARS.toLocaleString()}
                </span>
              )}
              {chat.sending ? (
                <Button variant="secondary" size="sm" onClick={chat.stop}>
                  <Square aria-hidden="true" className="size-3.5" />
                  Stop
                </Button>
              ) : (
                <Button
                  variant="accent"
                  size="sm"
                  disabled={draft.trim().length === 0 || chat.full}
                  onClick={() => void send()}
                >
                  <Send aria-hidden="true" className="size-3.5" />
                  Send
                </Button>
              )}
            </div>
          </div>

          {chat.full && (
            <p className="text-body-sm text-muted">
              This conversation has reached its length limit. Start again to
              carry on: nothing here was saved either way.
            </p>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function Turn({ turn }: { turn: Ai2Turn }) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[40rem] rounded-lg bg-accent-soft px-3 py-2 text-body-sm whitespace-pre-wrap text-ink">
          {turn.content}
        </p>
      </div>
    );
  }

  /* No step list here: what it read is narrated while it reads, beside the
     orb, and a landed turn is just the answer. */
  return (
    <p className="max-w-[44rem] rounded-lg border border-line bg-canvas px-3 py-2 text-body-sm leading-relaxed whitespace-pre-wrap text-ink">
      {turn.content}
    </p>
  );
}
