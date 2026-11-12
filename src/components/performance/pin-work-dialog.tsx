"use client";

import { useEffect, useRef, useState } from "react";
import {
  Button,
  LoadFailure,
  Modal,
  Radio,
  Skeleton,
  Textarea,
} from "@/components/ui";
import { Field } from "@/components/ui";
import {
  PIN_NOTE_MAX,
  PINS_PER_ANSWER,
  type ApiPin,
} from "@/lib/api/work-pins";
import { kindOf } from "@/lib/api/failure";
import { actionMessage } from "@/lib/use-action";
import {
  noteCounter,
  noteProblem,
  PIN_NO_MARK,
  PIN_PURPOSE,
  PIN_TITLE_NOTE,
  pinCountLine,
} from "@/lib/performance/work-in-answers";
import type { Completion } from "@/lib/projects/completions";
import { useWorkThisCycle } from "@/lib/store/completions";
import { useOrgTimezone } from "@/lib/store/session";
import { formatDateShort } from "@/lib/time";

/**
 * Choosing finished work to put beside an answer.
 *
 * ## What it shows, and what it does not keep
 *
 * The list is the person's own finished work in this review's period: the same list their review
 * shows (`useWorkThisCycle`), so what can be pinned is what is listed, and nothing else. A row has
 * the live title so the person can tell their tasks apart, and **the pin keeps no title**: the dialog
 * says so, because a person who types something private into a task title should know it does not
 * travel with the pin. The reader sees the task's key, the day it was finished and the person's note.
 *
 * ## One at a time, and the dialog stays
 *
 * Pick a task, write a note if there is something to say, add it. The dialog stays open so a second
 * and third can follow without reopening it, and a status line says what was added. Each pin is saved
 * as it is added, so closing the dialog loses nothing. At the limit the button is off and says why;
 * the server's own sentence is shown for any refusal, **with the pick and the note still there**.
 *
 * ## A list that cannot be read says nothing about the work
 *
 * The read answers `null` when the period states no dates, when the answer cannot be read, and for the
 * moment `Modal` keeps its children while it fades out. **None of those is "no tasks were recorded"**,
 * which is a claim about the person's work and is made only for an answer that is a list with nothing in
 * it. The read is asked for for as long as the dialog has been open and not only while it is, so
 * closing it does not turn a list into a sentence for the length of its exit, and a `null` says that
 * this period's work cannot be read here and nothing more.
 *
 * ## It does not throw away what was picked
 *
 * Done, the cross, Escape and the backdrop all come to one place. With a task picked, or a note typed,
 * that has not been added, it asks first, as the Questions dialog does with a question not yet kept:
 * keep editing, discard, or add it and close. And while a request is out **nothing closes it**, so a
 * refusal is always seen, in the server's own sentence, with the pick and the note still there.
 *
 * ## Where focus goes
 *
 * Asking replaces the footer, which removes the button that was pressed, and focus on a button that has
 * gone falls to the page behind the open dialog. So when the question appears focus goes to **Keep
 * editing**, the way back that loses nothing, and when it is answered with Keep editing (or a refusal)
 * it goes back to **Done**. After a pin is added it goes to the list's heading, for the same reason.
 *
 * ## A fresh dialog every time it opens
 *
 * `Modal` stays mounted while it fades out, and a component that stays mounted keeps its `useState`s.
 * The body is one level down and `session` changes when the dialog opens, so the previous pick and
 * note are not there next time. A list that is read again while somebody is choosing does not start a
 * new session, so what they are typing is not wiped.
 */

export type PinWork = {
  subjectId: string;
  cycleId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Whose finished work, and over which period. */
  work: PinWork;
  /** The question's own words, so the dialog says which answer this is for. */
  prompt: string;
  /** What this answer already carries. */
  pinned: readonly ApiPin[];
  onPin: (issueId: string, note: string) => Promise<ApiPin | null>;
};

export function PinWorkDialog(props: Props) {
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(props.open);
  if (props.open !== wasOpen) {
    setWasOpen(props.open);
    if (props.open) setSession((n) => n + 1);
  }
  return <PinWorkBody key={session} {...props} />;
}

function factsOf(item: Completion, timeZone: string): string {
  return [
    ...(item.personal ? ["Personal"] : [item.projectName]),
    `Finished ${formatDateShort(item.doneAt, timeZone)}`,
    ...(item.onTime !== null ? [item.onTime ? "On time" : "Late"] : []),
    ...(item.setBy ? [`Set by ${item.setBy.name}`] : []),
  ].join(" · ");
}

function PinWorkBody({ open, onClose, work, prompt, pinned, onPin }: Props) {
  const timeZone = useOrgTimezone();
  /* Asked for as long as this dialog has been open, not only while it is: see the header. A body that
     never opened (the first, before anybody pressed "Add work") asks for nothing. */
  const [asks] = useState(open);
  const read = useWorkThisCycle({ ...work, enabled: asks });
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [askingToClose, setAskingToClose] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const askedBefore = useRef(false);

  const already = new Set(pinned.map((pin) => pin.issueId));
  const full = pinned.length >= PINS_PER_ANSWER;
  const problem = noteProblem(note);
  const counter = noteCounter(note.length);
  const items = read.data?.items ?? [];
  const chosen = items.find((item) => item.id === selected) ?? null;
  const canAdd = chosen !== null && !full && problem === null;

  /** Something picked or written that has not been added. */
  const unsent = chosen !== null || note.trim().length > 0;
  const asking = askingToClose && unsent;

  /* The footer swaps when the question appears and when it goes, and the button that was pressed goes
     with it: put focus where it can still act. Only on that change, and only while the dialog is open:
     a dialog that is closing (Discard, or an add that closed it) hands focus back to what opened it,
     and must not take it back. */
  useEffect(() => {
    if (open) {
      if (asking && !askedBefore.current) keepRef.current?.focus();
      else if (!asking && askedBefore.current) doneRef.current?.focus();
    }
    askedBefore.current = asking;
  }, [asking, open]);

  /** Done, the cross, Escape and the backdrop all come here. */
  const requestClose = () => {
    /* A request is out: what comes back must be seen, so nothing closes it. */
    if (busy) return;
    if (unsent) {
      setAskingToClose(true);
      return;
    }
    onClose();
  };

  /** Resolves to whether it was added, so closing on an unsent pick can wait for it. */
  const add = async (): Promise<boolean> => {
    if (!chosen || busy || full || problem) return false;
    setBusy(true);
    setFailed(null);
    setStatus(null);
    try {
      const made = await onPin(chosen.id, note);
      setStatus(
        made
          ? `${chosen.key} was added to this answer.`
          : `${chosen.key} was saved, but this page could not read it back. Reload the review to see it.`,
      );
      setSelected(null);
      setNote("");
      /* The button that was just pressed is about to go off, and a disabled control drops focus to
         the page behind the dialog. Keep it inside, on the list, so the next pin is a key away. */
      heading.current?.focus();
      return true;
    } catch (caught) {
      /* The pick and the note stay: a refusal is a reason to change one thing, not to start over. A 404
         on adding is the review that is gone: the pin does not exist yet, so it cannot be the thing
         that is missing, and the shared sentence would say it is. */
      setFailed(
        actionMessage(
          caught,
          kindOf(caught) === "missing" ? "that review" : "that pin",
        ),
      );
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addAndClose = async () => {
    const kept = await add();
    /* A refusal leaves the dialog open on the pick, which now says why. */
    setAskingToClose(false);
    if (kept) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={requestClose}
      title="Add work to this answer"
      description={prompt}
      size="lg"
      footer={
        asking ? (
          <>
            <span
              role="alert"
              className="min-w-0 flex-1 basis-56 text-body-sm text-ink"
            >
              {chosen
                ? `You picked ${chosen.key} and have not added it.`
                : "You wrote a note and have not added it."}
            </span>
            <Button
              ref={keepRef}
              variant="ghost"
              disabled={busy}
              onClick={() => setAskingToClose(false)}
            >
              Keep editing
            </Button>
            <Button variant="secondary" disabled={busy} onClick={onClose}>
              Discard
            </Button>
            <Button
              variant="accent"
              loading={busy}
              disabled={busy || !canAdd}
              onClick={() => void addAndClose()}
            >
              Add it and close
            </Button>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 text-body-sm text-muted">
              {pinCountLine(pinned.length)}
            </p>
            <div className="flex gap-2">
              <Button
                ref={doneRef}
                variant="secondary"
                onClick={requestClose}
                disabled={busy}
              >
                Done
              </Button>
              <Button
                variant="accent"
                loading={busy}
                disabled={busy || !canAdd}
                onClick={() => void add()}
              >
                Add to this answer
              </Button>
            </div>
          </div>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body-sm leading-relaxed text-body">{PIN_PURPOSE}</p>
        <p className="text-meta text-muted">
          {PIN_TITLE_NOTE} {PIN_NO_MARK}
        </p>

        {failed && (
          <p role="alert" className="text-body-sm text-danger-text">
            {failed}
          </p>
        )}
        {status && (
          <p role="status" className="text-body-sm text-success-text">
            {status}
          </p>
        )}
        {full && !status && (
          <p className="text-body-sm text-muted">
            {`${String(PINS_PER_ANSWER)} is the most one answer carries. Unpin one to add another.`}
          </p>
        )}

        <h3
          ref={heading}
          tabIndex={-1}
          className="text-body-sm font-medium text-ink outline-none"
        >
          Your finished work in this period
        </h3>

        {read.loading ? (
          <Skeleton className="h-24 w-full" aria-label="Loading your work" />
        ) : read.error ? (
          <LoadFailure
            subject="your finished work"
            error={read.error}
            onRetry={read.reload}
          />
        ) : read.data === null ? (
          /* No answer is no claim: not "nothing was recorded". */
          <p className="text-body-sm text-muted">
            This period&apos;s work cannot be read here, so there is nothing to
            choose from.
          </p>
        ) : items.length === 0 ? (
          <p className="text-body-sm text-muted">
            No finished tasks were recorded for you on the project boards in
            this period, so there is nothing to add. That says nothing about the
            work itself: this is only what was tracked in Projects.
          </p>
        ) : (
          <>
            <fieldset className="min-w-0">
              <legend className="sr-only">
                Which task to add to this answer
              </legend>
              <ul className="flex max-h-[18rem] flex-col divide-y divide-line overflow-y-auto rounded-md border border-line">
                {items.map((item) => {
                  const added = already.has(item.id);
                  return (
                    <li key={item.id} className="px-3 py-2.5">
                      <Radio
                        name="pin-work"
                        value={item.id}
                        checked={selected === item.id}
                        disabled={busy || added || full}
                        onChange={() => {
                          setSelected(item.id);
                          setFailed(null);
                          setStatus(null);
                        }}
                        label={
                          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span className="tabular font-medium">
                              {item.key}
                            </span>
                            <span className="min-w-0 break-words">
                              {item.title}
                            </span>
                          </span>
                        }
                        description={
                          added
                            ? `${factsOf(item, timeZone)} · Already on this answer`
                            : factsOf(item, timeZone)
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            </fieldset>
            {read.data?.capped && (
              <p className="text-meta text-muted">
                {`Showing your latest ${String(items.length)} of ${String(read.data.total)} finished tasks.`}
              </p>
            )}
            <Field
              label="Why this one? (optional)"
              help={`A line of your own about it, up to ${String(PIN_NOTE_MAX)} characters. Leave it empty to add the task alone.`}
              {...(problem ? { error: problem } : {})}
            >
              <Textarea
                rows={3}
                value={note}
                disabled={busy || chosen === null}
                placeholder={
                  chosen === null
                    ? "Pick a task above first"
                    : "What it was, or why it matters to this answer"
                }
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>
            {counter && (
              <p
                className={`-mt-2 text-meta ${problem ? "font-medium text-warning-text" : "text-muted"}`}
              >
                {counter}
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
