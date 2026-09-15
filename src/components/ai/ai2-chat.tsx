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
import { LiveTurn, Steps } from "@/components/ai/turn-progress";
import {
  useAi2Available,
  useAi2Chat,
  MAX_AI2_MESSAGE_CHARS,
  type Ai2Turn,
} from "@/lib/store/ai2-chat";

/**
 * A conversation with the `/ai2` assistant, watched as it happens.
 *
 * ## What streaming is actually for here
 *
 * Not the typewriter. A turn on this endpoint can spend most of its wall clock
 * running up to three rounds of lookups against the database, and the buffered
 * version says nothing for the whole of it — which is indistinguishable, from a
 * chair, from the product having hung. So the lookups are named as they run.
 * That is the part worth having; the prose arriving a word at a time is a
 * side effect of the same connection.
 *
 * ## The provisional answer is rendered differently, because it is different
 *
 * Text that is still streaming has not been confirmed as an answer — the model
 * may yet decide it needs to look something up, at which point what is on
 * screen was a preamble to work it had not done. The store drops it when the
 * server says so. Until a turn lands it is the live block below and it is not in
 * the transcript; nothing provisional is ever sent back to the API.
 *
 * ## Absent, not disabled
 *
 * Renders nothing at all when no assistant is wired — the rule every other
 * assistant surface in this codebase follows. A composer above a sentence
 * explaining that nothing will happen is worse than no composer.
 */

/** Openers, so an empty box is not a blank page. Questions this endpoint reads. */
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

  /* Bring the composer back into view when a turn lands. Not an inner scroll
     container: the page scrolls, so a long answer can simply be read down.
     Keyed on landed turns rather than on streaming text — scrolling on every
     delta would fight somebody reading back up mid-answer. */
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
        {chat.turns.length === 0 && !chat.sending ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              {/* `resting` — a still mark. An empty state that pulsed would
                  claim something is happening before anybody has asked. */}
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
            {/* The server's own sentence wherever it wrote one — it knows
                whether this was a spent budget, a missing permission or a
                transcript it would not take, and nothing here does. */}
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
            /* Enter sends, Shift+Enter is a new line. The usual arrangement,
               and the placeholder is a question rather than a paragraph. */
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
              {/* Stop rather than a disabled Send: there is something running
                  to stop, which is only true because this streams. */}
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

  return (
    <div className="flex flex-col gap-2">
      {/* Kept beside the answer rather than cleared when the turn lands: a
          refused lookup is the one case where the answer alone does not tell
          the whole story, and it is worth being able to see afterwards. */}
      {turn.steps && turn.steps.length > 0 && <Steps steps={turn.steps} />}
      <p className="max-w-[44rem] rounded-lg border border-line bg-canvas px-3 py-2 text-body-sm leading-relaxed whitespace-pre-wrap text-ink">
        {turn.content}
      </p>
    </div>
  );
}
