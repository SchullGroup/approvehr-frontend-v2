"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  CircleSlash,
  RotateCw,
  Send,
  Sparkles,
  Square,
  TriangleAlert,
} from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Textarea,
} from "@/components/ui";
import { MAX_CHAT_MESSAGE_CHARS } from "@/lib/api/ai";
import { useAssistantAvailable } from "@/lib/store/ai";
import {
  useAssistantChat,
  type ChatTurn,
  type Usage,
} from "@/lib/store/ai-chat";
import { LiveTurn, Steps } from "@/components/ai/turn-progress";
import { AssistantOrb } from "./assistant-orb";

const OPENERS = SALES_SCRIPT_ENABLED
  ? [
      "How many people have no bank account?",
      "Whose leave requests are still waiting?",
      "Is anyone missing something before payday?",
      "How's the H2 2026 review going?",
    ]
  : [
      "How many people have no bank account?",
      "Whose leave requests are still waiting?",
      "What can you do for me?",
    ];

export function AssistantChat() {
  const assistant = useAssistantAvailable();
  const chat = useAssistantChat();
  const [draft, setDraft] = useState("");
  const composer = useRef<HTMLDivElement>(null);

  const landed = chat.turns.length;
  useEffect(() => {
    if (landed === 0) return;
    composer.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [landed]);

  if (assistant.loading || !assistant.available) return null;

  const send = async () => {
    if (await chat.send(draft)) setDraft("");
  };

  const overLimit = draft.length > MAX_CHAT_MESSAGE_CHARS;
  const nearLimit = draft.length > MAX_CHAT_MESSAGE_CHARS * 0.9;

  return (
    <Card>
      <CardHeader
        level={2}
        title="Ask the assistant"
        description="It reads your records to answer, and it can offer to make a change, which only happens if you confirm it."
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
                <Turn
                  turn={turn}
                  confirming={chat.confirming === turn.id}
                  busy={chat.confirming !== null}
                  onConfirm={() => void chat.confirm(turn.id)}
                  onDiscard={() => chat.discard(turn.id)}
                />
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
          <Callout tone="danger" title="That turn did not go through">
            <p>{chat.error}</p>
            {!chat.sending && (
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={() => void chat.retry()}
              >
                <RotateCw aria-hidden="true" className="size-3.5" />
                Send it again
              </Button>
            )}
          </Callout>
        )}

        <div ref={composer} className="flex flex-col gap-2">
          <Textarea
            rows={2}
            value={draft}
            aria-label="Your message"
            placeholder="Ask a question, or ask it to do something"
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
                  {MAX_CHAT_MESSAGE_CHARS.toLocaleString()}
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

function Turn({
  turn,
  confirming,
  busy,
  onConfirm,
  onDiscard,
}: {
  turn: ChatTurn;
  confirming: boolean;
  busy: boolean;
  onConfirm: () => void;
  onDiscard: () => void;
}) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[40rem] rounded-lg bg-accent-soft px-3 py-2 text-body-sm whitespace-pre-wrap text-ink">
          {turn.content}
        </p>
      </div>
    );
  }

  if (turn.receipt) {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-success-line bg-success-soft px-3 py-2 text-body-sm text-ink">
        <CheckCircle2
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-success-text"
        />
        <span>{turn.content}</span>
      </p>
    );
  }

  const echoesProposal = turn.content === turn.proposed?.proposal.summary;

  return (
    <div className="flex flex-col gap-2">
      {turn.content && !echoesProposal && (
        <p className="max-w-[44rem] rounded-lg border border-line bg-canvas px-3 py-2 text-body-sm leading-relaxed whitespace-pre-wrap text-ink">
          {turn.content}
        </p>
      )}

      {(turn.steps?.length ?? 0) > 0 && <Steps steps={turn.steps ?? []} />}

      {(turn.steps?.length ?? 0) === 0 && (turn.used?.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-meta text-muted">
          <span>Read from: {turn.used?.join(", ").replace(/_/g, " ")}</span>
        </div>
      )}

      {turn.usage && <UsageLine usage={turn.usage} />}

      {turn.proposed && (
        <Proposal
          turn={turn}
          confirming={confirming}
          busy={busy}
          onConfirm={onConfirm}
          onDiscard={onDiscard}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** What the turn cost, in the model's own counting. */
function UsageLine({ usage }: { usage: Usage }) {
  const total = usage.promptTokens + usage.outputTokens + usage.thinkingTokens;
  if (total === 0) return null;

  const parts = [
    `${usage.promptTokens.toLocaleString()} in`,
    `${usage.outputTokens.toLocaleString()} out`,
    ...(usage.thinkingTokens > 0
      ? [`${usage.thinkingTokens.toLocaleString()} thinking`]
      : []),
  ];

  return (
    <p
      className="text-meta text-faint"
      title={`${total.toLocaleString()} tokens in total`}
    >
      {total.toLocaleString()} tokens ({parts.join(" · ")})
    </p>
  );
}

/* -------------------------------------------------------------------------- */

function Proposal({
  turn,
  confirming,
  busy,
  onConfirm,
  onDiscard,
}: {
  turn: Extract<ChatTurn, { role: "assistant" }>;
  confirming: boolean;
  busy: boolean;
  onConfirm: () => void;
  onDiscard: () => void;
}) {
  const proposed = turn.proposed;
  if (!proposed) return null;

  const done = turn.done;
  const detail = done ? done.confirmed : proposed.proposal;
  const settled = done !== undefined || turn.discarded === true;

  return (
    <section
      className={[
        "max-w-[44rem] rounded-lg border p-4",
        done
          ? "border-success-line bg-success-soft"
          : turn.discarded
            ? "border-line bg-canvas"
            : "border-accent-line bg-accent-soft",
      ].join(" ")}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-body-sm font-semibold text-ink">
          {done
            ? "Done"
            : turn.discarded
              ? "Set aside"
              : turn.actionRefused
                ? "Refused"
                : "Waiting for you to confirm"}
        </h3>
        {!settled && detail.irreversible && (
          <Badge tone="warning" size="sm">
            Cannot be undone
          </Badge>
        )}
      </header>

      <p
        className={[
          "mt-2 text-body-sm text-ink",
          turn.discarded ? "line-through opacity-70" : "",
        ].join(" ")}
      >
        {detail.summary}
      </p>

      {detail.details.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {detail.details.map((line) => (
            <li key={line} className="flex gap-2 text-body-sm text-body">
              <span aria-hidden="true" className="text-faint">
                ·
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}

      {detail.irreversible && !turn.discarded && (
        <Callout
          tone={done ? "neutral" : "warning"}
          title="This cannot be undone"
          className="mt-3"
        >
          {detail.irreversible}
        </Callout>
      )}

      {turn.actionError && (
        <Callout tone="danger" title="It was not done" className="mt-3">
          {turn.actionError}
        </Callout>
      )}

      {!settled && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!turn.actionRefused && (
            <Button
              variant="accent"
              size="sm"
              loading={confirming}
              disabled={busy && !confirming}
              onClick={onConfirm}
            >
              {turn.actionError ? "Try again" : "Confirm"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={confirming}
            onClick={onDiscard}
          >
            Discard
          </Button>
        </div>
      )}

      {!settled && turn.actionRefused && (
        <p className="mt-2 flex items-start gap-2 text-meta text-muted">
          <TriangleAlert
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0"
          />
          <span>
            There is nothing to press again: it will refuse the same way until
            whatever it names above is dealt with. Set this aside, or sort that
            out and ask again.
          </span>
        </p>
      )}

      {turn.discarded && (
        <p className="mt-2 flex items-center gap-2 text-meta text-muted">
          <CircleSlash aria-hidden="true" className="size-3.5" />
          You set this aside. Nothing was changed, and the assistant was not
          told. Say so if you want it to know.
        </p>
      )}

      {!settled && !turn.actionError && (
        <p className="mt-2 flex items-center gap-2 text-meta text-muted">
          <Sparkles aria-hidden="true" className="size-3.5" />
          Nothing has changed yet.
        </p>
      )}
    </section>
  );
}
