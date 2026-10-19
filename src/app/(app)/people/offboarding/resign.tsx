"use client";

import { useState } from "react";
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
  SuccessMoment,
  Textarea,
  TextLink,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { ApiExit } from "@/lib/api/offboarding";
import { useMyExit } from "@/lib/store/offboarding";
import { longDate } from "@/lib/api/payroll";
import { shortDate } from "@/lib/today";
import { statusTone } from "./status-tone";

/**
 * An employee starting their own exit, for `/profile` and for Exit management
 * (where anybody without `EDIT_RECORDS` gets it at the top, open).
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
export function Resign({
  defaultOpen = false,
  onStarted,
}: {
  /**
   * Called once their notice has gone in. This component refreshes its own copy
   * of the exit and nothing else on the page, so a screen that also lists exits
   * has to be told — otherwise the card above says "You are leaving" while the
   * list below still says there is nothing to show.
   */
  onStarted?: () => void;
  /**
   * Whether the door starts open. Closed on `/profile`, where a reader meets it
   * on the way to something else; open on Exit management, where the reader
   * came on purpose and a second click to reach the one thing the page is for
   * is a reason to conclude it is not there.
   */
  defaultOpen?: boolean;
}) {
  const mine = useMyExit();
  const [open, setOpen] = useState(false);

  /* No staff record behind this sign-in: there is nobody to resign. The profile
     page already says so at the top, and repeating it here would be a second
     explanation of the same absence. */
  if (!mine.available) return null;

  /* Rendered in both branches below, and that is the point of it living up
     here. Handing in a notice makes `mine.exit` non-null within the same
     breath, which swaps the disclosure for the "You are leaving" card; a dialog
     that only existed in the disclosure's branch would be unmounted the instant
     it had something to say. Same position in the same fragment, so React keeps
     it — and the form it holds — across the swap. */
  const dialog = (
    <ResignDialog
      open={open}
      start={async (body) => {
        const exit = await mine.start(body);
        /* Told now, not when the confirmation is closed: the card behind has
           already become "You are leaving", and a list under it that still says
           there is nothing to show is the same two claims on one screen. */
        onStarted?.();
        return exit;
      }}
      onClose={() => setOpen(false)}
      onDone={() => {
        setOpen(false);
        mine.reload();
      }}
    />
  );

  if (mine.exit) {
    const exit = mine.exit;
    return (
      <>
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
              <TextLink
                href={`/people/offboarding/${exit.id}`}
                className="text-body-sm"
              >
                Open my checklist
              </TextLink>
              <span className="text-meta text-faint">
                Changed your mind? You can withdraw it there.
              </span>
            </div>
          </CardBody>
        </Card>
        {dialog}
      </>
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
        defaultOpen={defaultOpen}
        title="Leaving"
        hint="Start a resignation request. Nothing is sent until you fill in the form."
        level={3}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="min-w-0 flex-1 text-body-sm text-body">
            Three questions: your last day, why, and anything you want to say.
            Your manager and your people team are told when you send it.
          </p>
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
            <DoorOpen aria-hidden="true" className="size-3.5" />
            Resignation request
          </Button>
        </div>
      </Disclosure>

      {/* No `{open && (...)}` gate: `Modal` inside `ResignDialog` decides
          whether to render from its own `open` prop, so the dialog has to
          stay mounted and keep receiving the real boolean. `mine.start` is a
          function reference, always available. */}
      {dialog}
    </>
  );
}

/**
 * `start` is passed in rather than pulled from a second `useMyExit()`.
 *
 * Two instances of that hook would fire two requests for the same fact, and —
 * worse — the dialog's `reload` would refresh its own copy while the card
 * behind it kept showing "you have not resigned".
 *
 * ## It says what it recorded before it closes
 *
 * This used to push a toast and shut itself, so the one irreversible-feeling
 * thing on `/profile` ended with a line that vanished in six seconds. Now the
 * dialog stays and turns into a statement of what happened: the last day it
 * recorded, who was told, and what is waiting on the profile page. The facts
 * come from the exit the API returned rather than from the form, so what is
 * shown is what was saved.
 */
function ResignDialog({
  open,
  start,
  onClose,
  onDone,
}: {
  open: boolean;
  start: (body: {
    kind: "RESIGNATION";
    reason: string;
    lastWorkingDay: string;
  }) => Promise<ApiExit>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [lastWorkingDay, setLastWorkingDay] = useState("");
  const [why, setWhy] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* The exit that was just recorded. While it is set the dialog shows it in
     place of the form. */
  const [handedIn, setHandedIn] = useState<ApiExit | null>(null);

  /* Opening it again after a notice went in starts a clean form, because the
     old answers belong to a notice that exists now. Cancelling never clears
     anything: what somebody wrote on a hard day should survive an Escape. */
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && handedIn) {
      setHandedIn(null);
      setLastWorkingDay("");
      setWhy("");
      setNote("");
    }
  }

  const ready = lastWorkingDay !== "" && why.trim().length >= 3;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const reason = note.trim()
        ? `${why.trim()} — ${note.trim()}`
        : why.trim();
      setHandedIn(await start({ kind: "RESIGNATION", reason, lastWorkingDay }));
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
      open={open}
      /* Once it has gone in, every way out means "done": the notice is
         recorded whichever one they use, and the card behind needs to hear. */
      onClose={handedIn ? onDone : onClose}
      title="Resignation request"
      footer={
        handedIn ? undefined : (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!ready || busy}
              onClick={() => void submit()}
            >
              {busy ? "Sending…" : "Send resignation request"}
            </Button>
          </div>
        )
      }
    >
      {handedIn ? (
        <SuccessMoment
          /* Under the dialog's own `h2`, not beside it. */
          headingLevel={3}
          align="center"
          /* The button that was just pressed has left with the footer, so
             focus goes to what replaced it. */
          focusHeading
          title="Resignation request sent"
          lead={`Your last working day is ${longDate(handedIn.lastWorkingDay)}.`}
          details={noticeDetails(handedIn)}
          actions={
            <Button variant="accent" onClick={onDone}>
              Done
            </Button>
          }
        />
      ) : (
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
            help="Your manager and HR will read it."
          >
            <Textarea
              rows={4}
              value={note}
              maxLength={280}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </div>
      )}
    </Modal>
  );
}

/**
 * What is now true, and what happens next, for somebody who has just resigned.
 *
 * Every line comes from the exit the API returned. Who was told follows its
 * `status` — a manager on the record means the manager first and HR after, and
 * with none it goes straight to HR — and the checklist count is the length of
 * the list it built. The last line is the profile card's own wording, so the
 * promise made here and the one made there cannot drift apart.
 */
function noticeDetails(exit: ApiExit): string[] {
  const told =
    exit.status === "AWAITING_MANAGER"
      ? `${exit.manager?.name ?? "Your manager"} has been told. It goes to HR once they approve.`
      : "HR has been told, as there is no manager on your record.";
  const items = exit.progress.total;
  return [
    told,
    ...(items > 0
      ? [
          `Your leaving checklist has ${items} ${items === 1 ? "item" : "items"}. Open it from this page.`,
        ]
      : []),
    "Changed your mind? You can withdraw it from your checklist.",
  ];
}
