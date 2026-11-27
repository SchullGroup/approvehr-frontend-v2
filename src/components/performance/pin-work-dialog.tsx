"use client";

import { useState } from "react";
import {
  Button,
  Field,
  LoadFailure,
  Modal,
  Radio,
  Skeleton,
  Textarea,
  useToast,
} from "@/components/ui";
import { InfoTooltip } from "@/components/ui/field";
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
  PIN_RULES,
} from "@/lib/performance/work-in-answers";
import { useWorkThisCycle } from "@/lib/store/completions";
import { useOrgTimezone } from "@/lib/store/session";
import { completionFacts } from "./completed-item";

/**
 * Choosing finished work to put beside an answer.
 *
 * ## What it shows, and what it does not keep
 *
 * The list is the person's own finished work in this review's period: the same list their review shows
 * (`useWorkThisCycle`), so what can be pinned is what is listed, and nothing else. A row has the live
 * title so the person can tell their tasks apart, and **the pin keeps no title**: the tooltip says so,
 * because a person who types something private into a task title should know it does not travel with the
 * pin. The reader sees the task's key and the person's note.
 *
 * ## A picker, an optional note, Cancel and Add
 *
 * Pick a task, write a note if there is something to say, add it. Adding closes the dialog; the "+" is
 * one press away for the next, and each pin is saved as it is added. Every rule (what the reader sees,
 * that the title is not saved, that it moves no mark, the limit) is one tooltip in the footer, not a
 * paragraph above the list. The server's own sentence is shown for any refusal, **with the pick and the
 * note still there**.
 *
 * ## A list that cannot be read says nothing about the work
 *
 * The read answers `null` when the period states no dates, when the answer cannot be read, and for the
 * moment `Modal` keeps its children while it fades out. **None of those is "no tasks were recorded"**,
 * which is a claim about the person's work and is made only for an answer that is a list with nothing in
 * it. The read is asked for for as long as the dialog has been open and not only while it is, so closing
 * it does not turn a list into a sentence for the length of its exit. And where there is nothing to pick
 * from the "+" that opens this is not offered at all (`answer-pins.tsx`).
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

function PinWorkBody({ open, onClose, work, prompt, pinned, onPin }: Props) {
  const timeZone = useOrgTimezone();
  const toast = useToast();
  /* Asked for as long as this dialog has been open, not only while it is: see the header. A body that
     never opened (the first, before anybody pressed "+") asks for nothing. */
  const [asks] = useState(open);
  const read = useWorkThisCycle({ ...work, enabled: asks });
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const already = new Set(pinned.map((pin) => pin.issueId));
  const full = pinned.length >= PINS_PER_ANSWER;
  const problem = noteProblem(note);
  const counter = noteCounter(note.length);
  const items = read.data?.items ?? [];
  const chosen = items.find((item) => item.id === selected) ?? null;
  const canAdd = chosen !== null && !full && problem === null;

  /** Cancel, the cross, Escape and the backdrop all come here. */
  const close = () => {
    /* A request is out: what comes back must be seen, so nothing closes it. */
    if (!busy) onClose();
  };

  const add = async () => {
    if (!chosen || busy || full || problem) return;
    setBusy(true);
    setFailed(null);
    try {
      const made = await onPin(chosen.id, note);
      /* Saved, but the page could not read it back: say so where it will be seen, since the dialog is
         about to go. Not "nothing happened". */
      if (!made) {
        toast.push({
          tone: "warning",
          title: `${chosen.key} was saved`,
          detail:
            "This page could not read it back. Reload the review to see it.",
        });
      }
      onClose();
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
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Add work"
      description={prompt}
      size="lg"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <InfoTooltip label="About adding work" text={PIN_RULES} />
          <div className="flex gap-2">
            <Button variant="ghost" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="accent"
              loading={busy}
              disabled={busy || !canAdd}
              onClick={() => void add()}
            >
              Add
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {failed && (
          <p role="alert" className="text-body-sm text-danger-text">
            {failed}
          </p>
        )}

        {read.loading ? (
          <Skeleton className="h-24 w-full" aria-label="Loading your work" />
        ) : read.error ? (
          <LoadFailure
            subject="your finished work"
            error={read.error}
            onRetry={read.reload}
          />
        ) : items.length === 0 ? (
          /* No answer is no claim, and an empty list says nothing about the work. */
          <p className="text-body-sm text-muted">Not recorded</p>
        ) : (
          <>
            <fieldset className="min-w-0">
              <legend className="sr-only">Which task to add</legend>
              <ul className="flex max-h-[18rem] flex-col divide-y divide-line overflow-y-auto rounded-md border border-line">
                {items.map((item) => {
                  const added = already.has(item.id);
                  const facts = completionFacts(item, timeZone).join(" · ");
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
                          added ? `${facts} · Already on this answer` : facts
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            </fieldset>
            {read.data?.capped && (
              <p className="text-meta text-muted">
                {`Latest ${String(items.length)} of ${String(read.data.total)}`}
              </p>
            )}
            <Field label="Note" {...(problem ? { error: problem } : {})}>
              <Textarea
                rows={2}
                value={note}
                disabled={busy}
                placeholder={`Optional, up to ${String(PIN_NOTE_MAX)} characters`}
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
