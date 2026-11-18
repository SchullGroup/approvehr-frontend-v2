"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Modal,
  Radio,
  Textarea,
  useToast,
} from "@/components/ui";
import {
  OUTCOME_HELP,
  OUTCOME_LABEL,
  QUERY_CHANGES_NOTHING,
  QUERY_LIMITS,
  type ApiQueryDetail,
  type QueryOutcome,
} from "@/lib/api/queries";
import { counter } from "@/lib/queries/draft";
import { useQueryActions } from "@/lib/store/queries";
import { useOrgTimezone } from "@/lib/store/session";
import { formatDateTime } from "@/lib/time";
import { actionMessage } from "@/lib/use-action";
import { Typed } from "./letter-view";

const OUTCOMES = Object.keys(OUTCOME_LABEL) as QueryOutcome[];

/**
 * The outcome: one decision, with its reasons in writing.
 *
 * ## What recording it does, and the sentence that says so
 *
 * It closes the query and nothing else. A `WARNING` or a `HEARING` is **recorded and performed by
 * nothing**: no warning letter is issued from here, no hearing is arranged, and no pay, status or
 * exit moves. Going and doing it is a person's act in the module that owns it. The sentence says
 * so before the button is pressed and again on the read-back, because the outcome is what the
 * person reads and it must not be mistaken for the act itself.
 *
 * ## Who is offered the form: the server's answer, and nothing else
 *
 * `can.decide` is computed by the same rules the guard enforces, **including the maker/checker
 * rule** (whoever issued a query cannot decide it unless nobody else could, counted from the
 * database at that moment). This card never works that out. When the person looking holds the
 * permission and issued the query, the rule is *stated*, as text, so the missing form is not a
 * mystery; the server's own refusal is what arrives if the count changes between the page and the
 * press.
 *
 * ## "Silence is not a finding"
 *
 * The outcome can be recorded once the reply-by time has passed with no reply, and the form says
 * what it is being decided on: the word it never uses is "refused". The reasons are the decider's
 * own words and the server requires them (ten characters).
 */
export function OutcomeCard({
  detail,
  holdsDecide,
  issuedByMe,
  publish,
}: {
  detail: ApiQueryDetail;
  /** Whether the viewer holds `DECIDE_QUERIES` (the permission, not whether they may decide this one). */
  holdsDecide: boolean;
  /** Whether the viewer issued this query: states the maker/checker rule in words. */
  issuedByMe: boolean;
  publish: (detail: ApiQueryDetail) => void;
}) {
  const timeZone = useOrgTimezone();
  const outcome = detail.outcome;

  if (outcome) {
    return (
      <Card>
        <CardHeader
          title="Outcome"
          description={
            outcome.decidedByName
              ? `Recorded by ${outcome.decidedByName}${outcome.decidedAt ? ` on ${formatDateTime(outcome.decidedAt, timeZone)}` : ""}.`
              : undefined
          }
        />
        <CardBody className="flex flex-col gap-3">
          <div>
            <Badge tone="accent">
              {OUTCOME_LABEL[outcome.outcome] ?? outcome.outcome}
            </Badge>
          </div>
          <Typed>{outcome.reasons}</Typed>
          {OUTCOME_HELP[outcome.outcome] && (
            <p className="text-meta text-muted">
              {OUTCOME_HELP[outcome.outcome]}
            </p>
          )}
          <p className="text-meta text-muted">{QUERY_CHANGES_NOTHING}</p>
        </CardBody>
      </Card>
    );
  }

  if (detail.can.decide) {
    return <OutcomeForm key={detail.id} detail={detail} publish={publish} />;
  }

  /* The rule, as text, only where it is the reason: somebody who may decide queries, who wrote
     this one, looking at a query that is waiting for a decision. The server counts whether
     anybody else could; this does not. */
  const waiting =
    detail.status === "REPLIED" ||
    (detail.status === "ISSUED" &&
      detail.replyState === "no_reply_by_deadline");
  if (holdsDecide && issuedByMe && waiting) {
    return (
      <Card>
        <CardHeader title="Outcome" />
        <CardBody>
          <p className="text-body-sm text-body">
            You issued this query, so somebody else who can decide queries
            records the outcome, unless nobody else could. The server checks
            that when the outcome is recorded.
          </p>
        </CardBody>
      </Card>
    );
  }

  return null;
}

function OutcomeForm({
  detail,
  publish,
}: {
  detail: ApiQueryDetail;
  publish: (detail: ApiQueryDetail) => void;
}) {
  const toast = useToast();
  const actions = useQueryActions();
  const [choice, setChoice] = useState<QueryOutcome | null>(null);
  const [reasons, setReasons] = useState("");
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const trimmed = reasons.trim();
  const ready =
    choice !== null &&
    trimmed.length >= QUERY_LIMITS.outcomeReasons.min &&
    trimmed.length <= QUERY_LIMITS.outcomeReasons.max;
  const noReply = detail.reply?.sent !== true;
  const count = counter(reasons, QUERY_LIMITS.outcomeReasons.max, 3200);

  async function record() {
    if (!choice) return;
    setBusy(true);
    setProblem(null);
    try {
      publish(
        await actions.outcome(detail.id, { outcome: choice, reasons: trimmed }),
      );
      setAsking(false);
      toast.push({ tone: "success", title: "Outcome recorded" });
    } catch (error) {
      /* The server's own sentence, including the maker/checker refusal if the count changed. */
      setProblem(actionMessage(error, "the outcome"));
      setAsking(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Record the outcome"
        description={
          noReply
            ? "The reply-by time has passed and no reply was sent. You can record an outcome on that basis, in your own words."
            : "Read their reply, then record one outcome and say why."
        }
      />
      <CardBody className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-body-sm font-medium text-ink">
            Outcome
          </legend>
          {OUTCOMES.map((key) => (
            <Radio
              key={key}
              name="query-outcome"
              label={OUTCOME_LABEL[key]}
              description={OUTCOME_HELP[key]}
              checked={choice === key}
              onChange={() => setChoice(key)}
            />
          ))}
        </fieldset>

        <Field
          label="Reasons"
          required
          help="Written so they can be read back later: what you decided, and on what."
        >
          <Textarea
            rows={6}
            value={reasons}
            onChange={(event) => setReasons(event.target.value)}
          />
          {count && <span className="text-meta text-muted">{count}</span>}
        </Field>

        <p className="text-body-sm text-body">
          Recording the outcome closes the query. {QUERY_CHANGES_NOTHING}
        </p>

        {problem && (
          <p role="alert" className="text-body-sm text-danger-text">
            {problem}
          </p>
        )}
        <div>
          <Button onClick={() => setAsking(true)} disabled={!ready || busy}>
            Record the outcome
          </Button>
        </div>
      </CardBody>

      <Modal
        open={asking}
        onClose={() => {
          if (!busy) setAsking(false);
        }}
        title="Record this outcome?"
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setAsking(false)}
              disabled={busy}
            >
              Not yet
            </Button>
            <Button onClick={() => void record()} loading={busy}>
              Record it
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-body-sm text-body">
          <p>
            The outcome, <strong>{choice ? OUTCOME_LABEL[choice] : ""}</strong>,
            and your reasons are read by {detail.subject.name}. This closes the
            query.
          </p>
          {choice && <p>{OUTCOME_HELP[choice]}</p>}
          <p>{QUERY_CHANGES_NOTHING}</p>
        </div>
      </Modal>
    </Card>
  );
}
