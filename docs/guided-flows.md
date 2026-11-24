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
