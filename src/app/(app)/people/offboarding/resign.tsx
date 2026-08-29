"use client";

import { useState } from "react";
import Link from "next/link";
import { DoorOpen } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Disclosure,
  Field,
  Input,
  Modal,
  ProgressMeter,
  Textarea,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { useMyExit } from "@/lib/store/offboarding";
import { shortDate } from "@/lib/today";
import { statusTone } from "./status-tone";

/**
 * An employee starting their own exit, for `/profile`.
 *
 * ## Two states, and only one of them is behind a reveal
 *
 * An exit **already under way** renders as a card: last day, progress, a link
 * to the checklist. It is open, because it carries a deadline and unfinished
 * work, and `PARITY.md` Rule 5 refuses to hide either.
 *
 * The **door** that starts one renders inside a closed `Disclosure`. It is the
 * one destructive act on `/profile` and it used to sit in the page's main
 * scroll. Both states live in this component rather than two, because they
 * share one `useMyExit()` — see the note on `ResignDialog` below for what two
 * instances of that hook would do.
 *
 * ## Three fields
 *
 * Last day, why, and anything they want to say. Nothing else — not a kind
 * picker, not a notice-period calculator, not an acknowledgement checkbox. A
 * person handing in their notice is having a hard day and the form should take
 * thirty seconds.
 *
 * The API lets somebody record their own resignation with **no permission at
 * all**, which is deliberate: refusing to let a person record their own
 * resignation is how a resignation ends up as a WhatsApp message nobody can
 * find in six months.
 *
 * ## Where the third field lands
 *
 * `ExitProcess` has `reason` and no free-text note column, so what they write is
 * appended to `reason` after an em dash and stored with it. Nothing is dropped
 * on the floor and nothing is invented — but it is a squeeze.
 *
 * TODO(exit-note): when `ExitProcess` gains a `note` column, send this as its
 * own field rather than appending, and split it back out on the detail page.
 * The two lengths below (200 + 280) exist only to stay inside `reason`'s 500.
 */
export function Resign() {
  const mine = useMyExit();
  const [open, setOpen] = useState(false);

  /* No staff record behind this sign-in: there is nobody to resign. The profile
     page already says so at the top, and repeating it here would be a second
     explanation of the same absence. */
  if (!mine.available) return null;

  if (mine.exit) {
    const exit = mine.exit;
    return (
      <Card>
        <CardHeader
          title="You are leaving"
          level={3}
          action={
            <Badge tone={statusTone(exit.status)} size="sm">
              {exit.statusLabel}
            </Badge>
          }
        />
        <CardBody className="flex flex-wrap items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-body-sm font-medium text-ink">
              Last day {shortDate(exit.lastWorkingDay)}
            </p>
            <p className="mt-0.5 text-body-sm text-muted">{exit.kindLabel}</p>
          </div>
          <ProgressMeter
            className="w-full sm:w-44"
            value={exit.progress.percent}
            label={`${exit.progress.done} of ${exit.progress.total} done`}
            showValue={false}
            size="sm"
          />
          {/* One link, not two. Withdrawing lives on the checklist page beside
              everything else about this exit — a second door to it here would be
              a second place to keep the wording right, and the page is where
              somebody can see what withdrawing would stop. */}
          <div className="flex flex-col items-start gap-0.5">
            <Link
              href={`/people/offboarding/${exit.id}`}
              className="text-body-sm font-medium text-accent-text underline-offset-4 hover:underline"
            >
              Open my checklist
            </Link>
            <span className="text-meta text-faint">
              Changed your mind? You can withdraw it there.
            </span>
          </div>
        </CardBody>
      </Card>
    );
  }

  /* Closed, and closed on purpose — `PARITY.md` Rule 5. Resigning is the one
     destructive thing on `/profile`, and it used to sit inline in the page's
     main scroll between the kit somebody holds and a read-only table, where a
     reader on the way to something else met it. It is two deliberate steps now:
     open this, then answer the modal.

     The branch above is not behind a reveal, and must not be put behind one.
     An exit already under way carries a last working day and a checklist with
     items outstanding on it, which is Rule 5's default-open case: a reveal must
     never hide a deadline. */
  return (
    <>
      <Disclosure
        className="bg-surface"
        title="Leaving"
        hint="Hand in your notice. Nothing is sent until you fill in the form."
        level={3}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="min-w-0 flex-1 text-body-sm text-body">
            Three questions — your last day, why, and anything you want to say.
            Your manager and your people team are told when you send it.
          </p>
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
            <DoorOpen aria-hidden="true" className="size-3.5" />
            Hand in my notice
          </Button>
        </div>
      </Disclosure>

      {open && (
        <ResignDialog
          start={mine.start}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            mine.reload();
          }}
        />
      )}
    </>
  );
}

/**
 * `start` is passed in rather than pulled from a second `useMyExit()`.
 *
 * Two instances of that hook would fire two requests for the same fact, and —
 * worse — the dialog's `reload` would refresh its own copy while the card
 * behind it kept showing "you have not resigned".
 */
function ResignDialog({
  start,
  onClose,
  onDone,
}: {
  start: (body: { kind: "RESIGNATION"; reason: string; lastWorkingDay: string }) => Promise<string>;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();

  const [lastWorkingDay, setLastWorkingDay] = useState("");
  const [why, setWhy] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = lastWorkingDay !== "" && why.trim().length >= 3;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const reason = note.trim()
        ? `${why.trim()} — ${note.trim()}`
        : why.trim();
      await start({ kind: "RESIGNATION", reason, lastWorkingDay });
      toast.push({
        title: "Notice handed in",
        tone: "success",
        detail: "Your manager has been told.",
      });
      onDone();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "That did not send. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Hand in my notice"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={!ready || busy}
            onClick={() => void submit()}
          >
            {busy ? "Sending…" : "Hand in my notice"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <p className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-body-sm text-danger-text">
            {error}
          </p>
        )}

        <Field label="My last day" required>
          <Input
            type="date"
            value={lastWorkingDay}
            autoFocus
            onChange={(e) => setLastWorkingDay(e.target.value)}
          />
        </Field>

        <Field label="Why I am leaving" required>
          <Input
            value={why}
            maxLength={200}
            onChange={(e) => setWhy(e.target.value)}
            placeholder="New role at another company"
          />
        </Field>

        <Field
          optional
          label="Anything you want to say"
          help="Your manager and HR will read it.">
          <Textarea
            rows={4}
            value={note}
            maxLength={280}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
