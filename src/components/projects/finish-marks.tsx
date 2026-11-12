"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Field, Modal, Textarea, useToast } from "@/components/ui";
import type { FinishRead } from "@/lib/api/projects";
import { projectsApi } from "@/lib/api/projects";
import {
  ACCEPTANCE_MEANS,
  TAKE_BACK_WONT_DO_MEANS,
  acceptedLine,
  wontDoCounter,
  wontDoLine,
  wontDoReasonState,
} from "@/lib/projects/finish-marks";
import type { AcceptedMark, WontDoMark } from "@/lib/projects/types";
import { useOrgTimezone } from "@/lib/store/session";
import { formatDateShort } from "@/lib/time";
import { actionMessage, useAction } from "@/lib/use-action";

/**
 * What happened to a finished task, and what the reader may do about it: close it as won't do (or take
 * that back), accept it (or take their acceptance back).
 *
 * ## The server decides, the screen follows
 *
 * `canMarkWontDo` and `canAccept` come with the task as the API read it for this reader, and a button
 * is drawn for exactly what they say. The screen works out no rule of its own (not who leads whom, not
 * whether the task is finished), because the server is the one that knows and refuses in its own
 * words. A refusal is shown as the server wrote it, and the screen holding the task reads it again
 * whether the write worked or not, because a refusal usually means what was on screen was not what the
 * server holds (somebody reopened it, accepted it, or took the mark back a moment ago).
 *
 * ## Two recordings, not assists
 *
 * Neither is behind the company's "assists" switch and neither feeds a number. Closing a task as won't
 * do takes it out of finished work everywhere finished work is read; the task stays in its column.
 * Accepting says a leader has seen it and it stands, and gates nothing. A button that writes on a
 * single press (Accept, Take back acceptance, Take back won't do) says what it does in one short line
 * on the page and not in a hover: Won't do… needs no line, because it asks before it writes.
 *
 * ## What it draws when there is nothing to say
 *
 * Nothing. A task with no mark that this reader may not mark or accept has no section at all, so a
 * board of unfinished work carries none of this.
 *
 * ## What was just answered is believed until the task moves
 *
 * After a write the section shows what the server answered (`answered`), so the words change at once
 * even for a reader whose screen has nothing to re-read (a leader's reduced view). It is kept with the
 * values it was made over (`base`) and dropped in render the moment the task holds anything else, so
 * it can never outlive the state it described. "Dropped" means cleared, not ignored: a task that moves
 * out of Done (the server clears the mark) and comes back to the state the answer was made over would
 * otherwise match it again and show a mark the server no longer holds.
 *
 * ## A dialog that is open is not taken from under the person
 *
 * The section draws nothing for a task with nothing to say, but not while the won't-do dialog is open:
 * the task is read again on window focus, and a reader whose flags go (somebody reopened it) must not
 * have what they typed, or the sentence the server answers with, vanish with the section. The dialog
 * goes when they close it or its own request is answered.
 *
 * ## Where focus goes
 *
 * A button that is off lets go of focus, and a request being out turns them off. So after a write,
 * worked or refused, focus goes back to the control of the pressed kind (Accept and Take back
 * acceptance are one kind, Won't do and Take back won't do the other), or to the other kind, or to the
 * section. Left on the page, the next key acts on whatever is behind the drawer. The same shape as
 * Stage 3's pins (`answer-pins.tsx`).
 */
export function FinishMarks({
  issue,
  canMarkWontDo,
  canAccept,
  onSettled,
}: {
  issue: {
    id: string;
    key: string;
    wontDo?: WontDoMark | null | undefined;
    accepted?: AcceptedMark | null | undefined;
  };
  /** From the task's own read. False where the server did not say. */
  canMarkWontDo: boolean;
  canAccept: boolean;
  /**
   * Runs after every write, worked or refused: `read` is what the server answered, or null when it
   * refused, so the screen holding the task can read it again either way.
   */
  onSettled?: (read: FinishRead | null) => void;
}) {
  const timeZone = useOrgTimezone();
  const toast = useToast();
  const { run, pending } = useAction();
  const [asking, setAsking] = useState(false);
  const wontDoRef = useRef<HTMLButtonElement>(null);
  const acceptRef = useRef<HTMLButtonElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  /* Bumped after a write; the effect below puts focus back where the person was working. */
  const [refocus, setRefocus] = useState<{
    tick: number;
    kind: FinishKind | null;
  }>({ tick: 0, kind: null });
  const bump = (kind: FinishKind) =>
    setRefocus((current) => ({ tick: current.tick + 1, kind }));
  const base = [
    issue.id,
    issue.wontDo?.at ?? "",
    issue.accepted?.at ?? "",
    canMarkWontDo ? "1" : "0",
    canAccept ? "1" : "0",
  ].join("|");
  const [answered, setAnswered] = useState<{
    base: string;
    read: FinishRead;
  } | null>(null);

  /* Dropped in render the moment the task holds anything else, not merely ignored: ignored, it would
     match again the next time the task came back to the state it was answered over. */
  if (answered && answered.base !== base) setAnswered(null);

  useEffect(() => {
    if (refocus.tick === 0) return;
    const first = refocus.kind === "accept" ? acceptRef : wontDoRef;
    const second = refocus.kind === "accept" ? wontDoRef : acceptRef;
    (
      [first.current, second.current].find(
        (button) => button && !button.disabled,
      ) ?? sectionRef.current
    )?.focus();
  }, [refocus]);

  const shown =
    answered && answered.base === base
      ? {
          wontDo: answered.read.issue.wontDo ?? null,
          accepted: answered.read.issue.accepted ?? null,
          canMarkWontDo: answered.read.canMarkWontDo,
          canAccept: answered.read.canAccept,
        }
      : {
          wontDo: issue.wontDo ?? null,
          accepted: issue.accepted ?? null,
          canMarkWontDo,
          canAccept,
        };

  const nothingToSay =
    !shown.wontDo &&
    !shown.accepted &&
    !shown.canMarkWontDo &&
    !shown.canAccept;
  if (nothingToSay && !asking) return null;

  const day = (iso: string) => formatDateShort(iso, timeZone);

  /** Run one of the four writes: its words, its refusal in the server's sentence, and the re-read. */
  async function write(
    kind: FinishKind,
    action: () => Promise<FinishRead>,
    success: string,
    subject: string,
  ) {
    const outcome = await run(action, { success, subject });
    if (outcome.ok) setAnswered({ base, read: outcome.value });
    bump(kind);
    onSettled?.(outcome.ok ? outcome.value : null);
  }

  const dialogFor = (
    <WontDoDialog
      open={asking}
      issueKey={issue.key}
      onClose={() => setAsking(false)}
      onConfirm={async (reason) => {
        /* A refusal throws out of here and is shown inside the dialog, which stays open with what
           was typed. The screen holding the task reads it again either way. */
        try {
          const read = await projectsApi.markWontDo(issue.id, reason);
          setAnswered({ base, read });
          toast.push({
            tone: "success",
            title: `${issue.key} closed as won't do`,
          });
          bump("wontDo");
          onSettled?.(read);
        } catch (error) {
          onSettled?.(null);
          throw error;
        }
      }}
    />
  );

  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      /* With nothing to say and a dialog open the section holds only the dialog, in the same place in
         the tree it always has, so what was typed in it is not remounted away. It is a landmark only
         while it says something. */
      aria-label={nothingToSay ? undefined : "How it finished"}
      className="space-y-2 text-body-sm outline-none"
    >
      {shown.wontDo && (
        <div>
          <p className="text-ink">{wontDoLine(shown.wontDo, day)}</p>
          {shown.wontDo.reason && (
            <p className="mt-0.5 whitespace-pre-line break-words text-muted">
              {shown.wontDo.reason}
            </p>
          )}
        </div>
      )}
      {shown.accepted && (
        <p className="text-ink">{acceptedLine(shown.accepted, day)}</p>
      )}
      {(shown.canMarkWontDo || shown.canAccept) && (
        <div className="flex flex-wrap gap-2">
          {shown.canMarkWontDo &&
            (shown.wontDo ? (
              <Button
                ref={wontDoRef}
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  void write(
                    "wontDo",
                    () => projectsApi.takeBackWontDo(issue.id),
                    `${issue.key} is finished work again`,
                    "that",
                  )
                }
              >
                Take back won&apos;t do
              </Button>
            ) : (
              <Button
                ref={wontDoRef}
                size="sm"
                variant="secondary"
                disabled={pending}
                title="Closes it without it having been done. It stays in its column and is no longer counted as finished work."
                onClick={() => setAsking(true)}
              >
                Won&apos;t do…
              </Button>
            ))}
          {shown.canAccept &&
            (shown.accepted ? (
              <Button
                ref={acceptRef}
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  void write(
                    "accept",
                    () => projectsApi.withdrawAcceptance(issue.id),
                    /* Not "your": the server lets any leader of the person it is credited to take an
                       acceptance back, whoever gave it. */
                    `The acceptance of ${issue.key} is taken back`,
                    "that",
                  )
                }
              >
                Take back acceptance
              </Button>
            ) : (
              <Button
                ref={acceptRef}
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  void write(
                    "accept",
                    () => projectsApi.acceptTask(issue.id),
                    `${issue.key} accepted`,
                    "that",
                  )
                }
              >
                Accept
              </Button>
            ))}
        </div>
      )}
      {/* What a single press does, said where it can be read first. */}
      {shown.canMarkWontDo && shown.wontDo && (
        <p className="text-meta text-muted">{TAKE_BACK_WONT_DO_MEANS}</p>
      )}
      {shown.canAccept && (
        <p className="text-meta text-muted">{ACCEPTANCE_MEANS}</p>
      )}

      {dialogFor}
    </section>
  );
}

/** The two pairs of controls: Won't do and its Take back, Accept and its Take back. */
type FinishKind = "wontDo" | "accept";

/**
 * Ask why a finished task is being closed as won't do.
 *
 * The server requires a reason of 3 to 280 characters in the person's own words, so the dialog asks
 * for it before sending, keeps the button off until it is long enough and not too long (a counter
 * near the limit, and no `maxLength`, which would cut a pasted reason without a word), and sends the
 * trimmed text. **A refusal is the server's sentence, shown in the dialog, and the dialog stays open
 * with what was typed.** It cannot be closed while the request is out, so an answer is never lost
 * behind a dialog that has gone.
 *
 * A new form every time it opens: `Modal` keeps its children only while it is open, but this
 * component's own state outlives a close, so a session counter starts the body afresh.
 */
export function WontDoDialog({
  open,
  issueKey,
  onClose,
  onConfirm,
}: {
  open: boolean;
  issueKey: string;
  onClose: () => void;
  /** Resolves when the server accepted it, and throws its refusal otherwise. */
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession((n) => n + 1);
  }
  return (
    <WontDoDialogBody
      key={session}
      open={open}
      issueKey={issueKey}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}

function WontDoDialogBody({
  open,
  issueKey,
  onClose,
  onConfirm,
}: {
  open: boolean;
  issueKey: string;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const state = wontDoReasonState(reason);
  const counter = wontDoCounter(reason);

  function close() {
    if (!busy) onClose();
  }

  async function confirm() {
    if (state !== "ok" || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (error) {
      setProblem(actionMessage(error, "that"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Close as won't do"
      description={`${issueKey} stays in its column and is no longer counted as finished work.`}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="accent"
            onClick={() => void confirm()}
            loading={busy}
            disabled={state !== "ok"}
          >
            Close as won&apos;t do
          </Button>
        </div>
      }
    >
      <Field
        label="Why is it not being done?"
        required
        {...(counter ? { help: counter } : {})}
        {...(problem ? { error: problem } : {})}
      >
        <Textarea
          rows={3}
          value={reason}
          aria-invalid={state === "long" ? true : undefined}
          onChange={(event) => {
            setReason(event.target.value);
            setProblem(null);
          }}
        />
      </Field>
    </Modal>
  );
}
