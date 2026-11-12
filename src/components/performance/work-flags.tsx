"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Field, Modal, Textarea } from "@/components/ui";
import {
  FLAG_REASON_MAX,
  FLAG_REASON_MIN,
  type ApiWorkFlag,
} from "@/lib/api/work-flags";
import { actionMessage } from "@/lib/use-action";
import {
  FLAG_PURPOSE,
  flagLine,
  flaggedCount,
  reasonProblem,
  reasonReady,
} from "@/lib/performance/work-in-answers";
import { useOrgTimezone } from "@/lib/store/session";
import { useWorkFlags } from "@/lib/store/work-flags";

/**
 * "This is wrong", on one item of somebody's finished work.
 *
 * ## What it is
 *
 * The person the work is about says, in a few words, that an item the reader is looking at is not
 * right: not theirs, the wrong day, a task that was never finished. The appraiser reads it on the
 * row. **It removes nothing from the list and moves no mark**, and the dialog and the panel say so, so
 * a flag is never taken for a correction somebody made. Only the person can raise one, and they can
 * change the reason or take it back.
 *
 * ## What is drawn, and what can be done
 *
 * A flag that exists is **drawn whether or not the switch is on**: turning "Work in review answers"
 * off keeps what was written and keeps showing it. Raising or changing one needs the switch on, and the
 * person can take one back whatever it says. The server answering nothing about flags is no claim, and
 * the panel draws nothing.
 *
 * ## One dialog for a panel, not one for a row
 *
 * A row is a line of text and a button. The panel owns the single dialog and says which task it is
 * for, so a list of fifty finished tasks is not fifty closed modals. It is mounted for the person
 * whose work it is and nobody else, and **it does not come and go with what the server last said**: a
 * dialog that unmounted when a read was in flight would lose its exit and the person's place.
 *
 * ## A fresh form every time it opens
 *
 * `Modal` stays mounted while it fades out and keeps the `useState`s above it. The body is one level
 * down and `session` changes when the dialog opens, so the last reason is not there next time. The
 * task it is about is kept apart from whether it is open, as the other dialogs here do, so the title
 * does not flip to a default sentence while the dialog is going away.
 *
 * ## It cannot be closed while a request is in flight
 *
 * Escape, the cross and the backdrop all wait for the answer, as the other dialogs here do, so a
 * refusal is never lost behind a dialog that has already gone. The server's own sentence is shown in
 * the dialog, with what was typed still there.
 *
 * ## Where focus goes
 *
 * A write changes what a row is made of (the button that was pressed may not exist afterwards), and
 * focus left on something that is gone falls to the page, where the answering form's keys act. After a
 * flag is raised or taken back, focus goes to that row's own control.
 */

/**
 * The line a row carries when it has been flagged, and the person's controls on it.
 *
 * Each button's accessible name **starts with the words drawn on it** and then says which item it is
 * for ("This is wrong, PLT-12"), as the sidebar's back button does. A name that begins with other words
 * ("Say that PLT-12 is wrong") cannot be reached by somebody who speaks the label they can see to a
 * voice-control tool (WCAG 2.5.3, label in name), and a name with no key would not say which row of a
 * list of fifty a button belongs to.
 */
export function FlagLine({
  itemKey,
  flag,
  by,
  timeZone,
  canRaise,
  canWithdraw,
  busy,
  rowRef,
  onRaise,
  onWithdraw,
}: {
  itemKey: string;
  /** The flag on this row, or `null`. */
  flag: ApiWorkFlag | null;
  /** Whose flag it is: "you" or the person's name. The person is the only one who can raise one. */
  by: string;
  timeZone: string;
  /** A flag can be raised or changed: the reader is the person and the server says the setting is on. */
  canRaise: boolean;
  /** The reader is the person: a flag that is there can be taken back, whatever the setting says. */
  canWithdraw: boolean;
  /** A flag is being withdrawn; its controls wait. */
  busy: boolean;
  /** So the panel can put focus back on this row after a write. */
  rowRef: (node: HTMLElement | null) => void;
  onRaise: () => void;
  onWithdraw: () => void;
}) {
  if (flag) {
    return (
      <div
        ref={rowRef}
        tabIndex={-1}
        className="flex flex-col gap-1 outline-none"
      >
        <p className="whitespace-pre-line break-words text-meta text-ink">
          {flagLine(flag, by, timeZone)}
        </p>
        {(canRaise || canWithdraw) && (
          <p className="flex flex-wrap gap-x-3">
            {canRaise && (
              <Button
                size="sm"
                variant="ghost"
                data-flag-control="change"
                aria-label={`Change, flag on ${itemKey}`}
                disabled={busy}
                onClick={onRaise}
              >
                Change
              </Button>
            )}
            {canWithdraw && (
              <Button
                size="sm"
                variant="ghost"
                data-flag-control="withdraw"
                aria-label={`Take it back, flag on ${itemKey}`}
                disabled={busy}
                onClick={onWithdraw}
              >
                Take it back
              </Button>
            )}
          </p>
        )}
      </div>
    );
  }
  if (canRaise) {
    return (
      <p ref={rowRef} tabIndex={-1} className="outline-none">
        <Button
          size="sm"
          variant="ghost"
          data-flag-control="raise"
          aria-label={`This is wrong, ${itemKey}`}
          onClick={onRaise}
        >
          This is wrong
        </Button>
      </p>
    );
  }
  /* The person's own row, with nothing to say and nothing to press (the setting is off and no flag is
     there): still somewhere for focus to land after a flag has been taken back. */
  if (canWithdraw) {
    return <span ref={rowRef} tabIndex={-1} className="sr-only" />;
  }
  return null;
}

/** What the panel keeps about the dialog: which task it was last for, and whether it is open. */
export type FlagTarget = { issueId: string; key: string; reason: string };

type Props = {
  open: boolean;
  /** The task the dialog is for. Never cleared, so the title is stable while it fades out. */
  target: FlagTarget | null;
  onClose: () => void;
  onSave: (issueId: string, reason: string) => Promise<void>;
};

export function FlagDialog(props: Props) {
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(props.open);
  if (props.open !== wasOpen) {
    setWasOpen(props.open);
    if (props.open) setSession((n) => n + 1);
  }
  return <FlagBody key={session} {...props} />;
}

function FlagBody({ open, target, onClose, onSave }: Props) {
  const [reason, setReason] = useState(target?.reason ?? "");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const problem = reasonProblem(reason);
  const ready = target !== null && reasonReady(reason);
  const changing = (target?.reason ?? "") !== "";

  /* Escape, the cross, the backdrop and Cancel all come here, and none of them can close it while a
     request is out: what comes back would be lost behind a dialog that has gone. */
  const close = () => {
    if (!busy) onClose();
  };

  const save = async () => {
    if (!target || !ready || busy) return;
    setBusy(true);
    setFailed(null);
    try {
      await onSave(target.issueId, reason);
      onClose();
    } catch (caught) {
      /* What was typed stays: a refusal is a reason to change a word, not to start again. */
      setFailed(actionMessage(caught, "that flag"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={
        target
          ? changing
            ? `Change why ${target.key} is wrong`
            : `Why is ${target.key} wrong?`
          : "Why is this wrong?"
      }
      description={FLAG_PURPOSE}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={busy}
            disabled={busy || !ready}
            onClick={() => void save()}
          >
            {changing ? "Save the change" : "Flag it"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {failed && (
          <p role="alert" className="text-body-sm text-danger-text">
            {failed}
          </p>
        )}
        <Field
          label="What is wrong with it?"
          help={`In your own words, ${String(FLAG_REASON_MIN)} to ${String(FLAG_REASON_MAX)} characters. Whoever reads your work sees it on the row.`}
          {...(problem ? { error: problem } : {})}
        >
          <Textarea
            rows={4}
            value={reason}
            disabled={busy}
            placeholder="For example: this was done by someone else, or finished on a different day"
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

/**
 * Everything a panel of finished work needs to carry flags: the line for a row, the one dialog, the
 * count for the heading, and what the note above the list should say.
 *
 * `known` is whether the server said anything about flags. Where it did not (not asked yet, offline, a
 * reader the server refuses, a server one deploy behind, a failed request) a panel draws **no flag, no
 * control and no count**, and never "nothing was flagged".
 *
 * The person is the only one who can raise, change or take back a flag. `canRaise` is the person with
 * the setting on (raise or change); `canWithdraw` is the person whenever the server said anything, so a
 * flag that is there can be taken back after the setting has been turned off. A reader who is not the
 * person sees the flag and who raised it, and no control.
 */
export function useFlagging(args: {
  cycleId: string | null;
  subjectId: string;
  subjectName: string;
  /** The work is the reader's own. */
  own: boolean;
  /** The panel is one the reader can see. */
  enabled: boolean;
}) {
  const { cycleId, subjectId, subjectName, own, enabled } = args;
  const timeZone = useOrgTimezone();
  const flags = useWorkFlags({ cycleId, subjectId, enabled });
  const held = flags.flags;
  const [target, setTarget] = useState<FlagTarget | null>(null);
  const [open, setOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [refocus, setRefocus] = useState<{ id: string; prefer: string } | null>(
    null,
  );
  const rows = useRef(new Map<string, HTMLElement>());

  const known = held !== null;
  const canRaise = own && flags.on;
  const canWithdraw = own && known;
  const by = own ? "you" : subjectName;

  /* After a write: this row's own control, or the row itself when it has none. */
  useEffect(() => {
    if (refocus === null) return;
    const row = rows.current.get(refocus.id);
    if (!row) return;
    (
      row.querySelector<HTMLElement>(
        `[data-flag-control="${refocus.prefer}"]:not([disabled])`,
      ) ??
      row.querySelector<HTMLElement>("button:not([disabled])") ??
      row
    ).focus();
  }, [refocus]);

  const withdraw = async (issueId: string) => {
    if (withdrawing) return;
    setWithdrawing(issueId);
    setProblem(null);
    try {
      await flags.unflag(issueId);
      setRefocus({ id: issueId, prefer: "raise" });
    } catch (caught) {
      setProblem(actionMessage(caught, "that change"));
      setRefocus({ id: issueId, prefer: "withdraw" });
    } finally {
      setWithdrawing(null);
    }
  };

  const save = async (issueId: string, reason: string) => {
    await flags.flag(issueId, reason);
    setRefocus({ id: issueId, prefer: "change" });
  };

  const lineFor = (issueId: string, key: string): ReactNode => {
    if (held === null) return null;
    const flag = held.get(issueId) ?? null;
    return (
      <FlagLine
        itemKey={key}
        flag={flag}
        by={by}
        timeZone={timeZone}
        canRaise={canRaise}
        canWithdraw={canWithdraw}
        busy={withdrawing !== null}
        rowRef={(node) => {
          if (node) rows.current.set(issueId, node);
          else rows.current.delete(issueId);
        }}
        onRaise={() => {
          setTarget({ issueId, key, reason: flag?.reason ?? "" });
          setOpen(true);
        }}
        onWithdraw={() => void withdraw(issueId)}
      />
    );
  };

  return {
    /** A flag can be raised or changed now. */
    on: flags.on,
    /** The server said something about flags, so a flag that exists is drawn. */
    known,
    /** At least one flag exists for this person and cycle. */
    any: held !== null && held.size > 0,
    own,
    canRaise,
    canWithdraw,
    /** A failed take-back, in the server's words, for the panel to show. */
    problem,
    lineFor,
    /** "2 flagged as wrong" for the rows that are in this panel, or `null` for none or not known. */
    countIn: (issueIds: readonly string[]): string | null =>
      held === null
        ? null
        : flaggedCount(issueIds.filter((id) => held.has(id)).length),
    dialog: own ? (
      <FlagDialog
        open={open}
        target={target}
        onClose={() => setOpen(false)}
        onSave={save}
      />
    ) : null,
  };
}
