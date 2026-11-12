"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { PINS_PER_ANSWER, type ApiPin } from "@/lib/api/work-pins";
import { actionMessage } from "@/lib/use-action";
import { pinCountLine } from "@/lib/performance/work-in-answers";
import { useOrgTimezone } from "@/lib/store/session";
import { PinWorkDialog, type PinWork } from "./pin-work-dialog";
import { PinRow } from "./pins-read";

/**
 * Adding finished work to an answer, and taking it off, on a person's own self-review.
 *
 * ## Added and removed by the person, while the review is unsent
 *
 * `AnswerPins` is the list on the person's own page with an **Unpin** on each pin and an **Add work**
 * button that opens the picker. Links open in a new tab so following one never leaves the form, which
 * saves as it goes. Either control is there only where the review's own state allows it, and a refusal
 * from the server is shown in its own words beside the thing that was pressed. How a pin reads is
 * `pins-read.tsx`: the task's key, its dates and the person's own note, and never a title.
 *
 * ## Where focus goes
 *
 * The answering form listens for keys on the window: Enter goes on, and a letter picks an answer.
 * Focus left on something that is gone, the "Unpin" that was just pressed, or the "Add work" that has
 * just gone off at the fifth pin, falls to the page, and the next key acts on the form behind. So after
 * a pin is taken off, and after the picker closes, focus goes to "Add work" where it is offered, and
 * otherwise to the label over the list (and, once the last pin is gone and nothing can be added, to the
 * empty region that is left in its place). After an "Unpin" the server refused, the pin is still there,
 * and focus goes back to that pin's own "Unpin": the button was off while the request was out, and a
 * button that is off lets go of focus.
 */

/** Everything the editor needs about one question's pins, built by the form that owns them. */
export type Pinning = {
  pins: readonly ApiPin[];
  /** The setting is on and the review is the person's own and unsent: "Add work" is offered. */
  canAdd: boolean;
  /** The review is the person's own and unsent: a pin can be taken off. */
  canRemove: boolean;
  work: PinWork;
  /** The question's own words, for the dialog. */
  prompt: string;
  onPin: (issueId: string, note: string) => Promise<ApiPin | null>;
  onUnpin: (pinId: string) => Promise<void>;
};

/** The editor under a question on the person's own page. */
export function AnswerPins({
  pinning,
  onDialogOpenChange,
}: {
  pinning: Pinning;
  /** So the form can leave its keys alone while a dialog is open on top of it. */
  onDialogOpenChange?: (open: boolean) => void;
}) {
  const timeZone = useOrgTimezone();
  const [open, setOpenState] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const labelRef = useRef<HTMLParagraphElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const unpinRefs = useRef(new Map<string, HTMLButtonElement>());
  /* Bumped after something that can take focus's place with it; the effect below puts it back. A pin id
     says "this pin's own Unpin" (a refusal left the pin where it was). */
  const [refocus, setRefocus] = useState<{
    tick: number;
    pinId: string | null;
  }>({ tick: 0, pinId: null });
  const bump = (pinId: string | null = null) =>
    setRefocus((current) => ({ tick: current.tick + 1, pinId }));
  /* The last pin was taken off and nothing can be added: the section stays, empty, so focus has
     somewhere to land. */
  const [keepSection, setKeepSection] = useState(false);

  /* The picker belongs to the button that opens it. When that goes while the picker is open (the
     company turned the setting off, or the review stopped being the person's to add to) the picker
     goes with it, and it does not come back by itself if the button does. */
  if (open && !pinning.canAdd) setOpenState(false);

  /* The latest callback, for the effects below to call without depending on its identity. */
  const notify = useRef(onDialogOpenChange);
  useEffect(() => {
    notify.current = onDialogOpenChange;
  });

  /* The form is told whenever the picker opens or closes, by whatever path: it switches its keys off
     while the picker is open, and a picker that went with its button never calls `onClose`. */
  useEffect(() => {
    notify.current?.(open);
  }, [open]);

  /* Leaving the page with the dialog open must not leave the form's keys switched off. */
  useEffect(() => () => notify.current?.(false), []);

  useEffect(() => {
    if (refocus.tick === 0) return;
    const pressed =
      refocus.pinId !== null ? unpinRefs.current.get(refocus.pinId) : undefined;
    const add = addRef.current;
    (pressed && !pressed.disabled
      ? pressed
      : add && !add.disabled
        ? add
        : (labelRef.current ?? sectionRef.current)
    )?.focus();
  }, [refocus]);

  const { pins, canAdd, canRemove } = pinning;
  if (pins.length === 0 && !canAdd && !keepSection) return null;

  const unpin = async (pin: ApiPin) => {
    if (removing) return;
    setRemoving(pin.id);
    setProblem(null);
    try {
      await pinning.onUnpin(pin.id);
      setKeepSection(true);
      bump();
    } catch (caught) {
      setProblem(actionMessage(caught, "that change"));
      bump(pin.id);
    } finally {
      setRemoving(null);
    }
  };

  if (pins.length === 0 && !canAdd) {
    return (
      <section
        ref={sectionRef}
        aria-label="Work added to this answer"
        tabIndex={-1}
        className="outline-none"
      />
    );
  }

  return (
    <section
      ref={sectionRef}
      aria-label="Work added to this answer"
      tabIndex={-1}
      className="flex flex-col gap-2 border-t border-line pt-4 outline-none"
    >
      {pins.length > 0 && (
        <>
          <p
            ref={labelRef}
            tabIndex={-1}
            className="text-meta font-medium text-muted outline-none"
          >
            Work you added to this answer
          </p>
          <ul className="flex flex-col">
            {pins.map((pin) => (
              <PinRow
                key={pin.id}
                pin={pin}
                timeZone={timeZone}
                newTab
                action={
                  canRemove ? (
                    <Button
                      ref={(node) => {
                        if (node) unpinRefs.current.set(pin.id, node);
                        else unpinRefs.current.delete(pin.id);
                      }}
                      size="sm"
                      variant="ghost"
                      aria-label={`Unpin ${pin.key}`}
                      loading={removing === pin.id}
                      disabled={removing !== null}
                      onClick={() => void unpin(pin)}
                    >
                      Unpin
                    </Button>
                  ) : undefined
                }
              />
            ))}
          </ul>
        </>
      )}

      {problem && (
        <p role="alert" className="text-body-sm text-danger-text">
          {problem}
        </p>
      )}

      {canAdd && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Button
            ref={addRef}
            size="sm"
            variant="secondary"
            disabled={pins.length >= PINS_PER_ANSWER}
            onClick={() => setOpenState(true)}
          >
            <Plus aria-hidden="true" className="size-4" />
            Add work
          </Button>
          <span className="text-meta text-muted">
            {pinCountLine(pins.length)} The people who read your review see it
            beside your answer.
          </span>
        </div>
      )}

      {canAdd && (
        <PinWorkDialog
          open={open}
          onClose={() => {
            setOpenState(false);
            /* The button that opened it may have gone off (the fifth pin), and then the dialog has
               nowhere to give focus back to. */
            bump();
          }}
          work={pinning.work}
          prompt={pinning.prompt}
          pinned={pins}
          onPin={pinning.onPin}
        />
      )}
    </section>
  );
}
