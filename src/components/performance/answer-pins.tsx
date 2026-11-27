"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { IconButton } from "@/components/ui";
import { PINS_PER_ANSWER, type ApiPin } from "@/lib/api/work-pins";
import { actionMessage } from "@/lib/use-action";
import { useWorkThisCycle } from "@/lib/store/completions";
import { PinWorkDialog, type PinWork } from "./pin-work-dialog";
import { PinChips } from "./pins-read";

/**
 * Adding finished work to an answer, and taking it off, on a person's own self-review.
 *
 * ## Added and removed by the person, while the review is unsent
 *
 * `AnswerPins` is one quiet row under an answer: the chips of what is already there, each with a mark to
 * take it off, and a small "+" at the right that opens the picker. Links open in a new tab so following
 * one never leaves the form, which saves as it goes. Either control is there only where the review's own
 * state allows it, and a refusal from the server is shown in its own words beside the thing that was
 * pressed. How a pin reads is `pins-read.tsx`: the task's key, and the person's own note under it.
 *
 * ## Absent, not disabled
 *
 * The "+" is not there at five pins, and not there when nothing was finished in the period, so there is
 * never a button that can only refuse, and no sentence about a count under every question. What the
 * reader of the review will see, and the limit, are one tooltip in the picker.
 *
 * ## Where focus goes
 *
 * The answering form listens for keys on the window: Enter goes on, and a letter picks an answer. Focus
 * left on something that is gone, the mark that was just pressed, or the "+" that has just gone at the
 * fifth pin, falls to the page, and the next key acts on the form behind. So after a pin is taken off,
 * and after the picker closes, focus goes to "+" where it is offered, and otherwise to the row itself
 * (and, once the last pin is gone and nothing can be added, to the empty region that is left in its
 * place). After a take-off the server refused, the pin is still there, and focus goes back to that pin's
 * own mark: it was off while the request was out, and a button that is off lets go of focus.
 */

/** Everything the editor needs about one question's pins, built by the form that owns them. */
export type Pinning = {
  pins: readonly ApiPin[];
  /** The setting is on and the review is the person's own and unsent: "+" is offered. */
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
  const [open, setOpenState] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const removeRefs = useRef(new Map<string, HTMLButtonElement>());
  /* Bumped after something that can take focus's place with it; the effect below puts it back. A pin id
     says "this pin's own mark" (a refusal left the pin where it was). */
  const [refocus, setRefocus] = useState<{
    tick: number;
    pinId: string | null;
  }>({ tick: 0, pinId: null });
  const bump = (pinId: string | null = null) =>
    setRefocus((current) => ({ tick: current.tick + 1, pinId }));
  /* The last pin was taken off and nothing can be added: the section stays, empty, so focus has
     somewhere to land. */
  const [keepSection, setKeepSection] = useState(false);

  const { pins, canAdd, canRemove } = pinning;
  /* Whether there is anything to add: the same list the picker reads, so a person with nothing finished
     in the period is not offered a button that opens an empty box. Not asked for while adding is off. */
  const finished = useWorkThisCycle({ ...pinning.work, enabled: canAdd });
  const hasWork = (finished.data?.items.length ?? 0) > 0;
  const showAdd = canAdd && hasWork && pins.length < PINS_PER_ANSWER;

  /* The picker belongs to the button that opens it. When the review stops allowing pins while the picker
     is open (the company turned the setting off, or the review stopped being the person's to add to) the
     picker goes with it, and it does not come back by itself if the button does. */
  if (open && !canAdd) setOpenState(false);

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
      refocus.pinId !== null
        ? removeRefs.current.get(refocus.pinId)
        : undefined;
    const add = addRef.current;
    (pressed && !pressed.disabled
      ? pressed
      : add && !add.disabled
        ? add
        : sectionRef.current
    )?.focus();
  }, [refocus]);

  if (pins.length === 0 && !showAdd && !keepSection) return null;

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

  const dialog = canAdd && (
    <PinWorkDialog
      open={open}
      onClose={() => {
        setOpenState(false);
        /* The button that opened it may have gone (the fifth pin), and then the dialog has nowhere to
           give focus back to. */
        bump();
      }}
      work={pinning.work}
      prompt={pinning.prompt}
      pinned={pins}
      onPin={pinning.onPin}
    />
  );

  if (pins.length === 0 && !showAdd) {
    return (
      <section
        ref={sectionRef}
        aria-label="Work"
        tabIndex={-1}
        className="outline-none"
      >
        {dialog}
      </section>
    );
  }

  return (
    <section
      ref={sectionRef}
      aria-label="Work"
      tabIndex={-1}
      className="flex flex-col gap-2 outline-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {pins.length > 0 && (
            <PinChips
              pins={pins}
              newTab
              removing={removing}
              {...(canRemove
                ? {
                    onRemove: (pin: ApiPin) => void unpin(pin),
                    removeRef: (
                      pinId: string,
                      node: HTMLButtonElement | null,
                    ) => {
                      if (node) removeRefs.current.set(pinId, node);
                      else removeRefs.current.delete(pinId);
                    },
                  }
                : {})}
            />
          )}
        </div>
        {showAdd && (
          <IconButton
            ref={addRef}
            size="sm"
            label="Add work"
            className="shrink-0"
            onClick={() => setOpenState(true)}
          >
            <Plus aria-hidden="true" className="size-4" />
          </IconButton>
        )}
      </div>

      {problem && (
        <p role="alert" className="text-body-sm text-danger-text">
          {problem}
        </p>
      )}

      {dialog}
    </section>
  );
}
