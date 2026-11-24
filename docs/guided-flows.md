# Guided flows

The owner's rule (24 Nov 2026): **guide people into the flow that sets up what is needed, instead of letting them hit an
error state.** Avoid red errors on the app.

## The rules

1. **Defaults first.** If a default can fill it, fill it and say nothing, or say one calm line. Who appraises whom is the
   reporting line, else the head of the department (or the one above it), else HR. Nobody is "No appraiser".
2. **One next step at a time.** One card, ONE primary button, plain words ("Add questions", "Send a reminder"). Never
   several warnings stacked.
3. **Count, never names, in a banner.** "68 people don't have an objective yet", with a link to a filtered list. Names go in
   the list, not above it.
4. **States are not errors.** "To do" and "waiting" are neutral or quiet ochre text. Red is for real failures,
   validation and destructive actions.
5. **Prevent, don't detect.** A new period is made through guided steps, each with a default and a "later" where it is
   safe. A draft period shows **Get ready** (a progress bar, the current step highlighted, one button to that step); a
   running period shows **What is next** ("N people have not finished", "Send a reminder").
6. **Missing objectives are an invitation.** They are optional for the score (the part is left out and its share spread):
   "Add them if you want them in the score". A line in Get ready, never a banner.
7. **Empty states always carry the next action.**

## The components

`src/components/performance/next-step.tsx`:

- `NextStep({ title, detail?, action?, later? })`: the one card. `action` is a link (`href`) or a handler; `later` is the
  quiet "Do this later".
- `GetReady({ steps, final? })`: the checklist with progress. Each step is `{ id, label, detail?, done, optional?, action }`.
  Optional steps are not counted. `currentStep(steps)` is the first needed step not done. `final` appears only when
  every needed step is done.

Tests: `tests/next-step.test.tsx`. Used by the period page (`periods/[id]/period-screen.tsx`).

## Progress and checklists are a ring and a count beside the button (owner, 24 Nov 2026)

A checklist is a small ring and "3 of 4" (a tick at "4 of 4") beside the button
that starts the thing. Pressing it opens a window with the steps, what each is set
to and the button that goes to it. The start button waits until every needed step
is done; an optional step never holds it back. It is never a card of stacked rows
or a wide bar on the page, because the page below is for what the screen is about.
`ReadyChip` in `components/ui/next-step.tsx` is this; `GetReady` is the same thing
as a thin line, for a place with no button to sit beside.

## A way back is always on the left (owner, 24 Nov 2026)

"Back", "All departments" and every other way up a level sit at the extreme left,
above the title of what is open, never at the right with the actions.
