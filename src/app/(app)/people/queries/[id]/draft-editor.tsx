"use client";

import { useState } from "react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Field,
  FieldRow,
  Input,
  Modal,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import {
  QUERY_DATE_MAX,
  QUERY_DATE_MIN,
  QUERY_LIMITS,
  SERVED_HOW_HELP,
  SERVED_HOW_LABEL,
  type ApiQueryDetail,
  type IssueResult,
  type QueryServedHow,
} from "@/lib/api/queries";
import { isDayWarning } from "@/lib/api/query-ties";
import {
  counter,
  diffBody,
  draftFromDetail,
  saveProblem,
  type LetterDraft,
} from "@/lib/queries/draft";
import { useQueryActions } from "@/lib/store/queries";
import { useOrgTimezone } from "@/lib/store/session";
import { zoneLabel } from "@/lib/time";
import { actionMessage } from "@/lib/use-action";
import { QueryFiles } from "./query-files";

/**
 * The one place a letter is written.
 *
 * ## What it does not do
 *
 * It does not say whether the letter is complete. The server names **everything** missing at once
 * when the letter is issued, in its own sentence, and that is what is shown: a local checklist
 * would be a second copy of the rule and the first to drift. What it does show is the limits (a
 * counter near the end of a box, never a truncation) and the two warnings the server gives or the
 * page can honestly state.
 *
 * ## Typing is never thrown away by a refresh
 *
 * The form holds its own fields from the draft it was handed and is keyed by the query's id. The
 * page re-reads the query when somebody comes back to the window, and that must not wipe a letter
 * half written, so the fields are read from the detail once, and again only from a save's own
 * answer.
 *
 * ## Issuing freezes it
 *
 * The confirmation says what issuing does: the wording stops being editable, a reference is taken,
 * and (for a person with a sign-in, served in ApproveHR) they are told that **a letter** is
 * waiting, with nothing about what it is. Unsaved changes are saved first, in the same press, so
 * the letter issued is the letter on screen.
 */
export function DraftEditor({
  detail,
  publish,
  refresh,
  reread,
  onIssued,
}: {
  detail: ApiQueryDetail;
  publish: (detail: ApiQueryDetail) => void;
  /** Told the answer to issuing, so the screen can keep what it says about the references. */
  onIssued?: (result: IssueResult) => void;
  refresh: () => Promise<void>;
  /** Reads the query again and returns what the server holds, for after a refused issue. */
  reread: () => Promise<ApiQueryDetail>;
}) {
  const toast = useToast();
  const actions = useQueryActions();
  const timeZone = useOrgTimezone();

  const [saved, setSaved] = useState<LetterDraft>(() =>
    draftFromDetail(detail, timeZone),
  );
  const [draft, setDraft] = useState<LetterDraft>(() =>
    draftFromDetail(detail, timeZone),
  );
  const [busy, setBusy] = useState<"save" | "issue" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const set = <K extends keyof LetterDraft>(key: K, value: LetterDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const diff = diffBody(draft, saved, timeZone);
  const dirty = diff.ok && Object.keys(diff.body).length > 0;
  const refusal = saveProblem(draft) ?? (diff.ok ? null : diff.problem);

  const noSignIn = detail.served.subjectHasSignInNow === false;
  const how = draft.servedHow;
  /* A manager drafting is read from `can`, never from a permission: they may write the letter and
     nothing else, so `issue` is the server's one word for "this reader is the issuer". */
  const isIssuer = detail.can.issue;
  const dayWarnings = detail.warnings.filter((warning) =>
    isDayWarning(warning.code),
  );
  const timeWarnings = detail.warnings.filter(
    (warning) => !isDayWarning(warning.code),
  );

  /**
   * Saves what changed and returns the draft as the server now holds it (the one on the page when
   * nothing needed saving), or `null` when it could not be saved. The return value is what the
   * issue is measured against: `updatedAt` of the draft **as this person last saw it**.
   */
  async function save(): Promise<ApiQueryDetail | null> {
    if (!diff.ok) {
      setProblem(diff.problem);
      return null;
    }
    if (Object.keys(diff.body).length === 0) return detail;
    try {
      const next = await actions.update(detail.id, diff.body);
      publish(next);
      setSaved(draftFromDetail(next, timeZone));
      return next;
    } catch (error) {
      setProblem(actionMessage(error, "the draft"));
      return null;
    }
  }

  async function saveDraft() {
    setBusy("save");
    setProblem(null);
    if (await save()) toast.push({ tone: "success", title: "Draft saved" });
    setBusy(null);
  }

  async function issue() {
    setBusy("issue");
    setProblem(null);
    try {
      const seen = await save();
      if (!seen) {
        setAsking(false);
        return;
      }
      /* Sent only when the server sent one: a draft that changed while it was being issued is
         refused by the server and never served. */
      const result = await actions.issue(
        detail.id,
        seen.updatedAt ?? undefined,
      );
      publish(result.detail);
      onIssued?.(result);
      setAsking(false);
      /* An act, and a reference. Never the subject line, and never a warning's own words: they
         name dates of somebody's leave, and the issuer read them in the confirmation. */
      /* How many, never which: a reference's title is the issuer's to read on the page. */
      const changed = result.citations.filter(
        (citation) => citation.changed,
      ).length;
      /* What the issuer has not yet seen comes first, because a toast shows two lines: the warnings
         were read in the confirmation, and a copy that differs from the preview was not. */
      const notes = [
        result.nobodyToldInProduct === true
          ? "Nobody was told in ApproveHR."
          : null,
        changed > 0
          ? `${changed} ${changed === 1 ? "reference differs" : "references differ"} from the preview you saw.`
          : null,
        result.warnings.length > 0
          ? `${result.warnings.length} ${result.warnings.length === 1 ? "thing" : "things"} to check were shown before it was sent.`
          : null,
      ].filter((note): note is string => note !== null);
      toast.push({
        tone: notes.length > 0 ? "warning" : "success",
        title: result.detail.reference
          ? `${result.detail.reference} issued`
          : "Query issued",
        ...(notes.length > 0 ? { detail: notes.join(" ") } : {}),
      });
    } catch (error) {
      /* The server's own sentence, which names everything the letter still needs, or, for a 409,
         that the draft changed while it was being issued. A 409 is never retried from here: the
         draft is read again, shown as it now stands, and issuing it is a second decision. */
      setProblem(actionMessage(error, "the letter"));
      setAsking(false);
      if (error instanceof ApiError && error.status === 409) {
        try {
          const fresh = draftFromDetail(await reread(), timeZone);
          setSaved(fresh);
          setDraft(fresh);
        } catch {
          /* The sentence above stands; the page's own reload will bring the draft. */
        }
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader
        title="The letter"
        description="Write it here. Nothing is sent until you issue it, and once it is issued the wording cannot be changed."
      />
      <CardBody className="flex flex-col gap-5">
        <Field label="Subject line" required>
          <Input
            value={draft.subjectLine}
            onChange={(event) => set("subjectLine", event.target.value)}
          />
        </Field>

        <Field
          label="What happened"
          required
          help="What was done or not done, with the dates. The person reads this and answers it."
        >
          <Textarea
            rows={7}
            value={draft.whatHappened}
            onChange={(event) => set("whatHappened", event.target.value)}
          />
          <Counter
            value={draft.whatHappened}
            max={QUERY_LIMITS.whatHappened.max}
          />
        </Field>

        <FieldRow>
          <Field label="Date it happened" required>
            <Input
              type="date"
              min={QUERY_DATE_MIN}
              max={QUERY_DATE_MAX}
              value={draft.incidentOn}
              onChange={(event) => set("incidentOn", event.target.value)}
            />
          </Field>
          <Field
            label="Until"
            optional
            help="Only if it ran over several days."
          >
            <Input
              type="date"
              min={QUERY_DATE_MIN}
              max={QUERY_DATE_MAX}
              value={draft.incidentUntil}
              onChange={(event) => set("incidentUntil", event.target.value)}
            />
          </Field>
        </FieldRow>
        {dayWarnings.map((warning) => (
          /* Beside the dates they are about, as plain words. Nothing blocks. */
          <p
            key={warning.code + warning.message}
            className="-mt-3 text-body-sm text-warning-text"
          >
            {warning.message}
          </p>
        ))}

        <Field
          label="Rules or policies relied on"
          optional
          help="The policy, the contract clause or the rule this is measured against."
        >
          <Textarea
            rows={3}
            value={draft.rulesRelied}
            onChange={(event) => set("rulesRelied", event.target.value)}
          />
          <Counter
            value={draft.rulesRelied}
            max={QUERY_LIMITS.rulesRelied.max}
          />
        </Field>

        <Field
          label="The question"
          required
          help="What you are asking them to explain."
        >
          <Textarea
            rows={3}
            value={draft.question}
            onChange={(event) => set("question", event.target.value)}
          />
          <Counter value={draft.question} max={QUERY_LIMITS.question.max} />
        </Field>

        <FieldRow>
          <Field
            label="Reply by (date)"
            required
            help={`In ${zoneLabel(timeZone)}.`}
          >
            <Input
              type="date"
              min={QUERY_DATE_MIN}
              max={QUERY_DATE_MAX}
              value={draft.replyByDay}
              onChange={(event) => set("replyByDay", event.target.value)}
            />
          </Field>
          <Field label="Reply by (time)" required>
            <Input
              type="time"
              value={draft.replyByTime}
              onChange={(event) => set("replyByTime", event.target.value)}
            />
          </Field>
        </FieldRow>
        {timeWarnings.map((warning) => (
          /* The server's sentence, as plain words. It never blocks anything. */
          <p
            key={warning.code + warning.message}
            className="text-body-sm text-warning-text"
          >
            {warning.message}
          </p>
        ))}

        {/* How a letter is served is the issuer's to say. A manager drafting is never offered
            these boxes, because the server refuses them for a drafter. */}
        {isIssuer && (
          <>
            <Field label="How it will be served" required>
              <Select
                value={how}
                onChange={(event) =>
                  set("servedHow", event.target.value as QueryServedHow | "")
                }
              >
                <option value="">Choose how it will be served</option>
                {(Object.keys(SERVED_HOW_LABEL) as QueryServedHow[]).map(
                  (key) => (
                    <option key={key} value={key}>
                      {SERVED_HOW_LABEL[key]}
                    </option>
                  ),
                )}
              </Select>
            </Field>
            {how !== "" && (
              <p className="-mt-3 text-body-sm text-muted">
                {SERVED_HOW_HELP[how]}
              </p>
            )}
            {how === "IN_PRODUCT" && noSignIn && (
              <p className="text-body-sm text-warning-text">
                This person has no sign-in, so nobody can be told in ApproveHR.
                You can still issue it, and the record will say so. If you are
                going to hand them a printout, serve it in person instead.
              </p>
            )}

            {how === "IN_PERSON" && (
              <>
                <FieldRow>
                  <Field label="Handed over on" required>
                    <Input
                      type="date"
                      min={QUERY_DATE_MIN}
                      max={QUERY_DATE_MAX}
                      value={draft.servedAtDay}
                      onChange={(event) =>
                        set("servedAtDay", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="At" required>
                    <Input
                      type="time"
                      value={draft.servedAtTime}
                      onChange={(event) =>
                        set("servedAtTime", event.target.value)
                      }
                    />
                  </Field>
                </FieldRow>
                <FieldRow>
                  <Field label="Handed over by" required>
                    <Input
                      value={draft.servedHandedByName}
                      onChange={(event) =>
                        set("servedHandedByName", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Witness" optional>
                    <Input
                      value={draft.servedWitnessName}
                      onChange={(event) =>
                        set("servedWitnessName", event.target.value)
                      }
                    />
                  </Field>
                </FieldRow>
                <Checkbox
                  label="They refused to receive it"
                  description="A recorded fact about what happened at the hand-over. It is not a finding about them."
                  checked={draft.servedRefusedToReceive}
                  onChange={(event) =>
                    set("servedRefusedToReceive", event.target.checked)
                  }
                />
              </>
            )}
            {how !== "" && (
              <Field label="Note about how it was served" optional>
                <Textarea
                  rows={2}
                  value={draft.servedNote}
                  onChange={(event) => set("servedNote", event.target.value)}
                />
                <Counter
                  value={draft.servedNote}
                  max={QUERY_LIMITS.servedNote.max}
                />
              </Field>
            )}
          </>
        )}

        {isIssuer ? (
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <p className="text-body-sm font-medium text-ink">
              Company letter or attachments
            </p>
            <p className="text-body-sm text-muted">
              Attach the company&apos;s own letter or any document the person
              needs to read. They are frozen when you issue the query.
            </p>
            <QueryFiles
              queryId={detail.id}
              role="LETTER"
              files={detail.files.filter((file) => file.role === "LETTER")}
              canAdd
              canRemove
              onChanged={refresh}
            />
          </div>
        ) : (
          <p className="border-t border-line pt-4 text-body-sm text-muted">
            You are writing the letter and nothing else. HR reviews it, adds any
            records and files it refers to, and issues it. You cannot attach
            files or cite records, and you will not see it again once it is
            issued.
          </p>
        )}

        {problem && (
          <p role="alert" className="text-body-sm text-danger-text">
            {problem}
          </p>
        )}
        {refusal && dirty && (
          <p className="text-body-sm text-muted">{refusal}</p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => void saveDraft()}
            disabled={!dirty || refusal !== null || busy !== null}
            loading={busy === "save"}
          >
            Save the draft
          </Button>
          {/* Only for the issuer. A manager drafting has no button whose one outcome is a
              refusal: `can.issue` is the server's word for who may send it. */}
          {isIssuer && (
            <Button
              onClick={() => setAsking(true)}
              disabled={refusal !== null || busy !== null}
            >
              Issue the query
            </Button>
          )}
          {dirty && (
            <span className="text-body-sm text-muted">
              You have changes that are not saved yet.
            </span>
          )}
        </div>
      </CardBody>

      <Modal
        open={asking}
        onClose={() => {
          if (busy !== "issue") setAsking(false);
        }}
        title={`Issue this query to ${detail.subject.name}?`}
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setAsking(false)}
              disabled={busy === "issue"}
            >
              Not yet
            </Button>
            <Button onClick={() => void issue()} loading={busy === "issue"}>
              Issue it
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-body-sm text-body">
          <p>
            Issuing takes a reference number and freezes the wording: the letter
            cannot be edited afterwards, only extended, withdrawn or answered.
          </p>
          {detail.warnings.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="font-medium text-ink">Before it goes:</p>
              {detail.warnings.map((warning) => (
                <p
                  key={warning.code + warning.message}
                  className="text-warning-text"
                >
                  {warning.message}
                </p>
              ))}
            </div>
          )}
          {how === "IN_PRODUCT" && !noSignIn ? (
            <p>
              They are told that a letter from HR is waiting for them and when
              to reply by. The notification says nothing about what it is.
            </p>
          ) : (
            <p>Nobody is told in ApproveHR.</p>
          )}
          <p>
            A query changes no pay, no status and no exit. Anything that follows
            it is a separate decision.
          </p>
          {dirty && <p>Your unsaved changes are saved first.</p>}
        </div>
      </Modal>
    </Card>
  );
}

function Counter({ value, max }: { value: string; max: number }) {
  const text = counter(value, max);
  if (!text) return null;
  const over = value.trim().length > max;
  return (
    <span
      className={over ? "text-meta text-danger-text" : "text-meta text-muted"}
    >
      {text}
    </span>
  );
}
