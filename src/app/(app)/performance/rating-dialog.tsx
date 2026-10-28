"use client";

import { useMemo, useState } from "react";
import { Button, Field, Modal, Select, Textarea } from "@/components/ui";
import { NoticeLine } from "@/components/portal/notice-line";
import type { RateBody } from "@/lib/api/performance";
import { answerKindOf, choicesOf } from "@/lib/performance/answer-kind";
import { useAppraisals, useFramework } from "@/lib/store/performance";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import { useCan } from "@/lib/permissions";
import { useSession } from "@/lib/store/session";

/**
 * Recording somebody's level on one skill.
 *
 * ## A rating only reaches a mark if it names the period
 *
 * `scoreRegister` reads `where: { reviewCycleId: cycle.id }`, so a rating with
 * no period is invisible to the score. This dialog had no period field at all
 * and was the only caller of `rate` in the app, which made the competency
 * components — 55% of every mark, core plus behavioural plus leadership —
 * permanently `NO_DATA`. Rating somebody saved, filled the gap table and the
 * heatmap, and moved no mark, with nothing on screen saying why.
 *
 * Both readings are real, which is why this is a choice rather than a default:
 * a rating inside a period is the assessment of record for it, and one without
 * is a point-in-time reading that accumulates so \"did they improve\" stays
 * answerable. See the comment on `rateCompetency`. What was wrong was that only
 * one of the two was reachable. The help text carries the consequence, the same
 * way `NewKpiDialog`'s does for the identical field.
 *
 * ## The signed-in person is not in the picker
 *
 * The API refuses a self-rating outright — a rating is somebody else's
 * assessment or it is not worth storing, and self-assessment belongs on a review
 * form where it is labelled as one. So the option is absent here rather than
 * offered and then rejected.
 *
 * ## The target is asked for at the same time
 *
 * A level with no target produces no gap, and a gap is the only actionable thing
 * on the skills screen. Asking for both in one form is what makes "two levels
 * below target" arithmetic rather than an opinion somebody has to supply later.
 *
 * ## What is asked depends on how the subsection is answered
 *
 * A subsection is answered one of three ways, and the form asks for the one the
 * chosen subsection names: a level and a target, a yes or a no, or one of the
 * subsection's own choices. **Exactly one of the three goes in the body**, because
 * the API refuses any other by name, and a form that always sent a level would be
 * refused on two of the three. A yes or no and a pick have no target: there is no
 * honest distance between two answers that are not on a scale, so the field is not
 * offered and not sent.
 *
 * What a pick is worth is the choice's own score, set by whoever built the list,
 * and is worked out on the API. This form shows the choice and never a number, so
 * the person marking decides which description fits and not which score they want.
 *
 * Until a subsection is chosen the form shows the level controls, which is what it
 * always showed, and choosing one swaps them. A subsection that is answered by
 * picking and has no choices yet cannot be answered at all, so the form says so and
 * does not offer to save.
 *
 * The title stays "Record a level". It is what the button that opens this says and
 * what everybody calls it, and "Record an answer" would be a new name for a screen
 * that has not moved.
 */
export function RecordLevelDialog({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (competencyId: string, body: RateBody) => Promise<void>;
}) {
  const { people } = useEmployeeDirectory({ pageSize: 200 });
  const { employeeId } = useSession();
  const canRateAnyone = useCan("EDIT_RECORDS");
  const framework = useFramework();
  const { cycles } = useAppraisals();
  /* `rateCompetency` refuses a published period outright, so it is never
     offered rather than offered and then rejected. */
  const openPeriods = cycles.filter((cycle) => cycle.stage !== "PUBLISHED");

  const [person, setPerson] = useState("");
  const [reviewCycleId, setReviewCycleId] = useState("");
  const [competency, setCompetency] = useState("");
  const [level, setLevel] = useState("");
  const [target, setTarget] = useState("");
  /** `""` until somebody picks, then `"yes"` or `"no"`. */
  const [boolValue, setBoolValue] = useState("");
  const [choiceOptionId, setChoiceOptionId] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  /**
   * The API's own rule, not a longer list than it will accept.
   *
   * `rateCompetency` refuses a self-rating outright, and then refuses anybody
   * who is not a direct report unless the caller holds `EDIT_RECORDS`:
   * *"You can rate the people who report to you. Anything wider needs the
   * records permission."* `isManagerOf` on the API matches on `managerId`, so
   * it is direct reports and not the whole chain below somebody.
   *
   * This filtered on self alone, so a line manager with two reports was
   * offered all nine of their colleagues — their own manager included — and
   * seven of the nine were refused only after the whole form had been filled
   * in. The refusal is good and arrives too late to be useful.
   *
   * `goal-dialogs.tsx` in this same module already writes this rule out, with
   * a comment about not putting "a name in front of them that the save would
   * refuse". Twenty lines away, and this dialog did not have it.
   *
   * ## The people come from `people`, not `employees`
   *
   * A caller without `EDIT_RECORDS`, which is every line manager, is sent lookup
   * rows, and `useEmployeeDirectory` keeps the full rows in `employees` and
   * everybody's in `people`. This read `employees`, so for exactly the people
   * this dialog is for the list was empty and they could not record a level at
   * all: the Employee picker held only its placeholder. Only somebody holding
   * `EDIT_RECORDS` saw anybody. `people` is what every caller can read, carries
   * `managerId`, and has `fullName` rather than a first and last name.
   */
  const options = useMemo(
    () =>
      people.filter(
        (one) =>
          one.id !== employeeId &&
          (canRateAnyone || one.managerId === employeeId),
      ),
    [people, employeeId, canRateAnyone],
  );

  const chosen = framework.competencies.find((one) => one.id === competency);
  /* A level until a subsection says otherwise, which is what this form always
     asked for and what the API means by a subsection that does not say. */
  const kind = chosen ? answerKindOf(chosen) : "RATING";
  const choices = chosen ? choicesOf(chosen) : [];
  /* Nothing can be recorded on a pick-a-list subsection that has no choices. */
  const nothingToPick = kind === "CHOICE" && choices.length === 0;
  const scaleMax = chosen?.scaleMax ?? 5;
  const steps = Array.from({ length: scaleMax }, (_, index) => index + 1);

  const submit = async () => {
    const found: Record<string, string> = {};
    if (!person) found["person"] = "Pick who this is about.";
    if (!competency) found["competency"] = "Pick the skill.";
    if (kind === "RATING" && !level) {
      found["level"] = "Pick the level they are at.";
    }
    if (kind === "BOOLEAN" && !boolValue) found["answer"] = "Pick yes or no.";
    if (kind === "CHOICE" && !choiceOptionId) {
      found["answer"] = "Pick one of the choices.";
    }
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      /* Exactly one of level, boolValue and choiceOptionId, the one this
         subsection's kind names. The API refuses the other two by name, so
         sending all three and letting it sort them out would be a refusal. */
      const body: RateBody = { employeeId: person };
      if (kind === "RATING") {
        body.level = Number(level);
        if (target) body.target = Number(target);
      } else if (kind === "BOOLEAN") {
        body.boolValue = boolValue === "yes";
      } else {
        body.choiceOptionId = choiceOptionId;
      }
      if (reviewCycleId) body.reviewCycleId = reviewCycleId;
      if (note.trim()) body.note = note.trim();
      await onSave(competency, body);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record a level"
      size="md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            loading={saving}
            disabled={nothingToPick}
            onClick={() => void submit()}
          >
            Save it
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="Employee"
          required
          {...(errors["person"] ? { error: errors["person"] } : {})}
        >
          <Select
            value={person}
            placeholder="Pick a person"
            onChange={(event) => setPerson(event.target.value)}
          >
            {options.map((one) => (
              <option key={one.id} value={one.id}>
                {one.fullName} · {one.jobTitle}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Which skill"
          required
          {...(errors["competency"] ? { error: errors["competency"] } : {})}
        >
          <Select
            value={competency}
            placeholder="Pick a skill"
            onChange={(event) => {
              /* Everything that belonged to the last subsection goes with it: a
                 level typed against a five-point scale means nothing against a
                 yes or no, and a pick is one of *that* subsection's choices. */
              setCompetency(event.target.value);
              setLevel("");
              setTarget("");
              setBoolValue("");
              setChoiceOptionId("");
            }}
          >
            {framework.groups.map((group) => (
              <optgroup key={group.sectionName} label={group.sectionName}>
                {group.competencies.map((one) => (
                  <option key={one.id} value={one.id}>
                    {one.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>

        {kind === "RATING" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Current level"
              required
              {...(errors["level"] ? { error: errors["level"] } : {})}
            >
              <Select
                value={level}
                placeholder="Pick a level"
                onChange={(event) => setLevel(event.target.value)}
              >
                {steps.map((step) => (
                  <option key={step} value={String(step)}>
                    {step} of {scaleMax}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              optional
              label="Target level"
              help="This is what makes a gap."
            >
              <Select
                value={target}
                placeholder="No target"
                onChange={(event) => setTarget(event.target.value)}
              >
                {steps.map((step) => (
                  <option key={step} value={String(step)}>
                    {step} of {scaleMax}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}

        {kind === "BOOLEAN" && (
          <Field
            label="Answer"
            required
            {...(errors["answer"] ? { error: errors["answer"] } : {})}
          >
            <Select
              value={boolValue}
              placeholder="Pick yes or no"
              onChange={(event) => setBoolValue(event.target.value)}
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </Select>
          </Field>
        )}

        {kind === "CHOICE" &&
          (nothingToPick ? (
            <NoticeLine tone="muted">
              <span>
                {chosen?.name ?? "That skill"} is answered by picking from a
                list, and the list has no choices yet, so nothing can be
                recorded on it. Somebody who can manage settings adds them under
                Questions, By section.
              </span>
            </NoticeLine>
          ) : (
            <Field
              label="Answer"
              required
              {...(errors["answer"] ? { error: errors["answer"] } : {})}
            >
              <Select
                value={choiceOptionId}
                placeholder="Pick a choice"
                onChange={(event) => setChoiceOptionId(event.target.value)}
              >
                {choices.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.label}
                  </option>
                ))}
              </Select>
            </Field>
          ))}

        {openPeriods.length > 0 && (
          <Field
            optional
            label="Appraisal period"
            help={
              reviewCycleId
                ? "Counts towards this person's mark for that period. Each person has one rating per period, so rating them again corrects this one."
                : kind === "RATING"
                  ? "This will not affect any appraisal mark. It is a snapshot of where they are now, and it fills the skills gap table and heatmap."
                  : "This will not affect any appraisal mark. It is a snapshot of where they are now, and it does not appear in the skills gap table or heatmap, which are about levels."
            }
          >
            <Select
              value={reviewCycleId}
              onChange={(event) => setReviewCycleId(event.target.value)}
            >
              <option value="">Not part of an appraisal period</option>
              {openPeriods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field optional label="Anything to add" help="They will see it.">
          <Textarea
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
