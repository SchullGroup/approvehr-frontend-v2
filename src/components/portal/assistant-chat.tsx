"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  CircleSlash,
  RotateCw,
  Send,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Spinner,
  Textarea,
} from "@/components/ui";
import { MAX_CHAT_MESSAGE_CHARS } from "@/lib/api/ai";
import { useAssistantAvailable } from "@/lib/store/ai";
import { useAssistantChat, type ChatTurn } from "@/lib/store/ai-chat";

/**
 * A conversation with the assistant, and the one place it can propose a change.
 *
 * ## Why this is not `ask-panel.tsx` with more in it
 *
 * `AskPanel` is a one-shot lookup box on both dashboards, and its own header
 * argues — correctly, for the endpoint it calls — that a transcript there would
 * *"imply a memory that does not exist"*. `/ai/ask` takes one question and holds
 * nothing between them, so each answer replacing the last is the honest shape.
 *
 * `/ai/chat` is a different endpoint with a different contract. The whole
 * conversation is sent every turn, so a transcript on screen is not a claim
 * about a memory — it is literally the request body. And this one can propose a
 * **write**, which is a control that has no business appearing on a dashboard
 * beside the weather. Two surfaces, because they are two surfaces: a question
 * you ask in passing, and a conversation you sit down to have.
 *
 * `AskPanel` is unchanged apart from a link up here, which is the other half of
 * the same argument — a chat findable only by knowing the URL is the
 * discoverability defect this module has recorded four times.
 *
 * ## Absent, not disabled
 *
 * Renders nothing at all when no assistant is wired, the rule every other
 * suggestion surface follows. `/settings/ai` is where somebody learns the
 * capability exists and how to switch it on; the nav item for this page is
 * hidden by the same status, so nobody is shown a door with nothing behind it.
 *
 * ## The confirm step is the feature
 *
 * `/ai/chat` cannot write. It can come back describing a change, and the
 * description — the summary, the details, the irreversible warning — is read out
 * of the database by the API and rendered here **verbatim**. Nothing in this
 * file paraphrases it, summarises it, or writes a button label that describes
 * the act. That is the entire point: the words beside the button come from the
 * company's own records rather than from a model, so what somebody agrees to is
 * a fact rather than a sentence that was generated.
 *
 * The button therefore says "Confirm", which names the *decision* and not the
 * act. If you ever find yourself writing "Approve Grace's leave" on it, the
 * proposal above it has stopped being the thing being agreed to.
 */

/** Three openers, so an empty box is not a blank page. */
const OPENERS = [
  "How many people have no bank account?",
  "Whose leave requests are still waiting?",
  "What can you do for me?",
];

export function AssistantChat() {
  const assistant = useAssistantAvailable();
  const chat = useAssistantChat();
  const [draft, setDraft] = useState("");
  const composer = useRef<HTMLDivElement>(null);

  /* Bring the composer back into view when a turn lands. Not an inner scroll
     container: the page scrolls, so a long answer can simply be read down. */
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
        description="It reads your records to answer, and it can offer to make a change — which only happens if you confirm it."
        action={
          chat.turns.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={chat.reset}>
              Start again
            </Button>
          ) : undefined
        }
      />

      <CardBody className="flex flex-col gap-4">
        {chat.turns.length === 0 ? (
          <div className="flex flex-col gap-3">
            <p className="text-body-sm text-muted">
              Ask about your people, your leave, your payroll runs, or what you
              deduct. Try one of these:
            </p>
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
          </ol>
        )}

        {chat.sending && (
          <span className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Looking through your records
          </span>
        )}

        {chat.error && (
          <Callout tone="danger" title="That turn did not go through">
            {/* The API's own sentence wherever it wrote one — it knows whether
                this was a rate limit, a refusal or a transcript it would not
                take, and nothing here does. */}
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
            /* Enter sends, Shift+Enter is a new line. The usual arrangement for
               a chat composer, and the placeholder is a question rather than a
               paragraph — somebody typing several lines here is the exception. */
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-meta text-muted">
              {/* Said once, quietly, because it is true and it is unusual: the
                  API keeps no transcript on purpose, so nothing here is written
                  down anywhere. */}
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
              <Button
                variant="accent"
                size="sm"
                loading={chat.sending}
                disabled={draft.trim().length === 0 || chat.full}
                onClick={() => void send()}
              >
                {!chat.sending && (
                  <Send aria-hidden="true" className="size-3.5" />
                )}
                Send
              </Button>
            </div>
          </div>

          {chat.full && (
            <p className="text-body-sm text-muted">
              This conversation has reached its length limit. Start again to
              carry on — nothing here was saved either way.
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
  /** Another proposal on this page is being performed. One write at a time. */
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

  /* A receipt is not an answer, and rendering it as one would make the API's
     sentence about what happened look like something the model said. */
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

  /*
   * A proposing turn carries the proposal's own summary as its content — the
   * store needs a non-empty message for the wire, and the API omits `text`
   * whenever it proposes. Rendering both put the same sentence on screen twice,
   * once as prose and once inside the card, which read as the assistant saying
   * the same thing to itself. Found by looking at it; no type could.
   *
   * Compared rather than gated on `proposed`, so that prose which is genuinely
   * different from the summary still renders. The API says it sends one or the
   * other today; a screen that silently dropped the other if that ever changed
   * would be hiding something a person was told.
   */
  const echoesProposal = turn.content === turn.proposed?.proposal.summary;

  return (
    <div className="flex flex-col gap-2">
      {turn.content && !echoesProposal && (
        <p className="max-w-[44rem] rounded-lg border border-line bg-canvas px-3 py-2 text-body-sm leading-relaxed whitespace-pre-wrap text-ink">
          {turn.content}
        </p>
      )}

      {/* The working, shown rather than logged. An answer whose reads cannot be
          checked is an oracle, and this product is sold against one. Same
          wording as `ask-panel.tsx` so the two surfaces read alike. */}
      {turn.used.length > 0 && (
        <p className="text-meta text-muted">
          Read from: {turn.used.join(", ").replace(/_/g, " ")}
        </p>
      )}

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

/**
 * The change being offered, in the API's own words.
 *
 * Every string in here that describes the act comes off the wire. The only
 * sentences this file writes are about the *state* of the decision — waiting,
 * set aside, done — which are facts about somebody's own click rather than
 * claims about a record.
 */
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
  /* Once it is done, the sentence to show is the API's re-read at the moment of
     the write, not the one from the proposal. A record can move between an offer
     and a press, and `confirmed` is the description that is true now. */
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

      {/* Verbatim. One sentence, read out of the database by the API. */}
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
              {/* Verbatim, and each one is a specific somebody checks. */}
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Present only when the act cannot be undone, so its presence is the
          signal. Loud on purpose — it is the one thing on this card that a
          person cannot fix afterwards. */}
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
          {/* The API's own sentence. It names the permission, the conflict or
              the argument it would not take; nothing on this side knows any of
              that, so nothing on this side rewords it. */}
          {turn.actionError}
        </Callout>
      )}

      {!settled && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {/* No Confirm button after a refusal the API will make again. It said
              no because of a permission, a conflict or an argument it will not
              take, and none of those change while somebody presses a button —
              offering the press anyway is the dead control this codebase keeps
              finding. A transient failure keeps it, reading "Try again",
              because there the request was sound and the moment was wrong.
              Discard is always the way out. */}
          {!turn.actionRefused && (
            <Button
              variant="accent"
              size="sm"
              loading={confirming}
              /* Disabled while another proposal on the page is being performed:
                 two writes in flight is two records moving with one person's
                 attention on neither. */
              disabled={busy && !confirming}
              onClick={onConfirm}
            >
              {/* Names the decision, never the act — the act is the sentence
                  above, which came from the database. */}
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
            There is nothing to press again — it will refuse the same way until
            whatever it names above is dealt with. Set this aside, or sort that
            out and ask again.
          </span>
        </p>
      )}

      {turn.discarded && (
        <p className="mt-2 flex items-center gap-2 text-meta text-muted">
          <CircleSlash aria-hidden="true" className="size-3.5" />
          You set this aside. Nothing was changed, and the assistant was not
          told — say so if you want it to know.
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
