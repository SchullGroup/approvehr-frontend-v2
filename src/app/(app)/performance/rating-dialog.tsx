"use client";

import { useMemo, useState } from "react";
import {
  Button,
  Field,
  Modal,
  RatingScale,
  Select,
  Textarea,
} from "@/components/ui";
import { NoticeLine } from "@/components/portal/notice-line";
import { LanguageCheck } from "@/components/performance/language-check";
import { ApiError } from "@/lib/api/client";
import {
  performanceApi,
  ratingWordsFrom,
  type RateBody,
} from "@/lib/api/performance";
import { answerKindOf, choicesOf } from "@/lib/performance/answer-kind";
import { ANSWER_CAVEAT } from "@/lib/performance/review-language";
import { nothingToRateWords } from "@/lib/performance/framework-empty";
import {
  writtenAnswerCounter,
  writtenAnswerIsOver,
  writtenAnswerProblem,
} from "@/lib/performance/question-limits";
import {
  useAppraisals,
  useFramework,
  useRatingScale,
  useSections,
  useSkills,
} from "@/lib/store/performance";
import { splitScoredGroups } from "@/lib/performance/scored-groups";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import { useCan } from "@/lib/permissions";
import { useSession } from "@/lib/store/session";
import { defaultPeriodId } from "./goal-facts";

/**
 * Recording somebody's level on one competency.
 *
 * ## It asks four things, and the rest is behind "More"
 *
 * Person, competency, level, Save. The target, the period and a note are one
 * plain "More" link away, because most recordings use none of them.
 *
 * ## It is always filed under a period when there is one to file under
 *
 * `scoreRegister` reads `where: { reviewCycleId: cycle.id }`, so a rating with
 * no period is invisible to the score. The period starts as the open one
 * (`defaultPeriodId`), and there is no "not part of a period" choice: it was the
 * one way to record a level that counted for nothing. When several periods are
 * open and none is clearly current, nothing is guessed (a guess files a mark in
 * the wrong period), so the period is asked in the open and has to be picked.
 * With no open period the rating is a snapshot, which is all it can be, and the
 * period is not asked at all. A published period is never offered: the API
 * refuses a rating in it.
 *
 * ## The signed-in person is not in the picker
 *
 * The API refuses a self-rating outright, so the option is absent rather than
 * offered and then rejected. A line manager is offered their direct reports,
 * which is the API's rule, and people are grouped by department.
 *
 * ## What is asked depends on how the competency is answered
 *
 * One of four ways, and the form asks for the one the chosen competency names: a
 * level (with an optional target), a yes or a no, one of its own choices, or
 * words. **Exactly one of the four goes in the body**, because the API refuses
 * any other by name. A competency answered by picking from a list with no
 * choices yet cannot be answered, so it is not listed.
 *
 * What a pick is worth is the choice's own score, set on the API. This form
 * shows the choice and never a number. A written answer is 1 to 4,000 characters
 * once trimmed (`question-limits.ts`), with the count shown when it is long
 * enough to need it, and the language check runs under the box without ever
 * blocking the save.
 *
 * The box and the dropdown open on what is already recorded for that person, so
 * recording again corrects it instead of starting from nothing. A pick is found
 * by its **id**, because two choices can share a label.
 *
 * The title stays "Record a level": it is what the button that opens this says.
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
  const canEditFramework = useCan("MANAGE_SETTINGS");
  const framework = useFramework();
  const { sections } = useSections();
  /* Only what can be recorded: a section that counts for nothing is not listed,
     and neither is a competency answered by picking from a list that has no
     choices yet. Absent, rather than offered and refused. */
  const scoredGroups = useMemo(
    () =>
      splitScoredGroups(framework.groups, sections)
        .offered.map((group) => ({
          ...group,
          competencies: group.competencies.filter(
            (one) =>
              answerKindOf(one) !== "CHOICE" || choicesOf(one).length > 0,
          ),
        }))
        .filter((group) => group.competencies.length > 0),
    [framework.groups, sections],
  );
  const { cycles } = useAppraisals();
  /* `rateCompetency` refuses a published period outright, so it is never
     offered rather than offered and then rejected. */
  const openPeriods = cycles.filter((cycle) => cycle.stage !== "PUBLISHED");

  const [person, setPerson] = useState("");
  /* `null` until somebody picks: then the open period is the starting answer,
     and it follows the periods as they arrive (UAT 23 Nov, U93). Starting on
     "Not part of an appraisal period" made a level recorded from here count
     towards nobody's mark. */
  const [chosenPeriod, setReviewCycleId] = useState<string | null>(null);
  const reviewCycleId = chosenPeriod ?? defaultPeriodId(openPeriods);
  const [competency, setCompetency] = useState("");
  const [level, setLevel] = useState("");
  const [target, setTarget] = useState("");
  /** `""` until somebody picks, then `"yes"` or `"no"`. */
  const [boolValue, setBoolValue] = useState("");
  /* What was typed over the person's current words, or `null` while nothing has
     been, for the reason `typedChoice` below gives. */
  const [typedWords, setTypedWords] = useState<string | null>(null);
  /* What was picked over the person's current answer, or `null` while nothing has
     been. It is cleared whenever the person or the skill changes, so the default is
     always the current answer of whoever is chosen, never a pick left over from
     somebody else or from the last list. */
  const [typedChoice, setTypedChoice] = useState<string | null>(null);
  const [note, setNote] = useState("");
  /* Target, period and note, one plain link away. */
  const [more, setMore] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  /** The API's sentence while this person's self review is not in yet. */
  const [waiting, setWaiting] = useState<string | null>(null);
  const [nudged, setNudged] = useState(false);

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

  /* The people by department, when anybody has one. Grouped only then: a flat
     list is what a company with no departments should see. */
  const peopleByDepartment = useMemo(() => {
    const groups = new Map<string, typeof options>();
    for (const one of options) {
      const key = one.department ?? "";
      groups.set(key, [...(groups.get(key) ?? []), one]);
    }
    const named = [...groups.keys()].filter((key) => key !== "").sort();
    return named.length === 0
      ? null
      : [...named, ...(groups.has("") ? [""] : [])].map((key) => ({
          name: key === "" ? "No department" : key,
          people: groups.get(key) ?? [],
        }));
  }, [options]);

  /* With several periods open and none clearly current nothing is chosen for
     the person, so it is asked in the open instead of behind More. */
  const askPeriod =
    openPeriods.length > 1 && defaultPeriodId(openPeriods) === "";

  const chosen = framework.competencies.find((one) => one.id === competency);
  /* A level until a subsection says otherwise, which is what this form always
     asked for and what the API means by a subsection that does not say. */
  const kind = chosen ? answerKindOf(chosen) : "RATING";
  const choices = chosen ? choicesOf(chosen) : [];

  /* The chosen person's own answer on this subsection. Only a connected server
     has one to give: offline the skills are derived and carry no pick id, so
     nothing is preselected there. */
  const { skills } = useSkills(person === "" ? null : person);
  const current = chosen
    ? skills?.rows.find((row) => row.competencyId === chosen.id)
    : undefined;
  const currentPickId =
    kind === "CHOICE" ? (current?.choiceOptionId ?? null) : null;
  /* Preselected only while that choice is still on the list, and matched by id,
     never by label: two choices can share a name, and the one picked may have been
     taken off since. In that case it is said below instead of offered. */
  const preselected =
    currentPickId !== null &&
    choices.some((choice) => choice.id === currentPickId)
      ? currentPickId
      : "";
  const choiceOptionId = typedChoice ?? preselected;
  const takenOffPick =
    currentPickId !== null && preselected === ""
      ? (current?.choiceOptionLabel ?? null)
      : null;
  /* The words on record, so recording again corrects them. Absent from a server
     one deploy behind, and then the box starts empty. */
  const currentWords = kind === "TEXT" ? (current?.textValue ?? "") : "";
  const words = typedWords ?? currentWords;
  /* The problem is shown from the first press of Save, and then follows what is in
     the box: it goes the moment the box is fixed and changes if the fault does. */
  const wordsProblem =
    kind === "TEXT" && errors["answer"] ? writtenAnswerProblem(words) : null;
  const scaleMax = chosen?.scaleMax ?? 5;
  const steps = Array.from({ length: scaleMax }, (_, index) => index + 1);
  const levelWords = ratingWordsFrom(useRatingScale().scale.levels);
  const personName = people.find((one) => one.id === person)?.fullName;

  const submit = async () => {
    const found: Record<string, string> = {};
    if (!person) found["person"] = "Pick who this is about.";
    if (!competency) found["competency"] = "Pick the competency.";
    if (kind === "RATING" && !level) {
      found["level"] = "Pick the level they are at.";
    }
    if (askPeriod && !reviewCycleId) found["period"] = "Pick the period.";
    if (kind === "BOOLEAN" && !boolValue) found["answer"] = "Pick yes or no.";
    if (kind === "CHOICE" && !choiceOptionId) {
      found["answer"] = "Pick one of the choices.";
    }
    if (kind === "TEXT") {
      const problem = writtenAnswerProblem(words);
      if (problem) found["answer"] = problem;
    }
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      /* Exactly one of level, boolValue, choiceOptionId and textValue, the one
         this subsection's kind names. The API refuses the other three by name, so
         sending all four and letting it sort them out would be a refusal. */
      const body: RateBody = { employeeId: person };
      if (kind === "RATING") {
        body.level = Number(level);
        if (target) body.target = Number(target);
      } else if (kind === "BOOLEAN") {
        body.boolValue = boolValue === "yes";
      } else if (kind === "TEXT") {
        body.textValue = words.trim();
      } else {
        body.choiceOptionId = choiceOptionId;
      }
      if (reviewCycleId) body.reviewCycleId = reviewCycleId;
      if (note.trim()) body.note = note.trim();
      setWaiting(null);
      await onSave(competency, body);
    } catch (caught) {
      /* The API holds a rating in a period until the person's self review is
         sent: not an error, a wait, with a reminder to send. */
      if (caught instanceof ApiError && caught.status === 409) {
        setWaiting(caught.message);
        return;
      }
      throw caught;
    } finally {
      setSaving(false);
    }
  };

  const periodField = (
    <Field
      label="Period"
      {...(askPeriod ? { required: true } : {})}
      {...(errors["period"] ? { error: errors["period"] } : {})}
    >
      <Select
        value={reviewCycleId}
        {...(askPeriod ? { placeholder: "Pick a period" } : {})}
        onChange={(event) => setReviewCycleId(event.target.value)}
      >
        {openPeriods.map((period) => (
          <option key={period.id} value={period.id}>
            {period.name}
          </option>
        ))}
      </Select>
    </Field>
  );

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
            onClick={() => void submit()}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {waiting && (
          <NoticeLine tone="muted">
            <span>Waiting for their self review. {waiting}</span>
            {reviewCycleId && person && (
              <button
                type="button"
                disabled={nudged}
                className="font-medium text-accent-text underline-offset-2 hover:underline disabled:opacity-60"
                onClick={() => {
                  void performanceApi
                    .nudgePerson(reviewCycleId, person)
                    .then(() => setNudged(true))
                    .catch(() => setNudged(true));
                }}
              >
                {nudged ? "Reminded" : "Nudge"}
              </button>
            )}
          </NoticeLine>
        )}
        <Field
          label="Person"
          required
          {...(errors["person"] ? { error: errors["person"] } : {})}
        >
          <Select
            value={person}
            placeholder="Pick a person"
            onChange={(event) => {
              setPerson(event.target.value);
              setTypedChoice(null);
              setTypedWords(null);
            }}
          >
            {peopleByDepartment
              ? peopleByDepartment.map((group) => (
                  <optgroup key={group.name} label={group.name}>
                    {group.people.map((one) => (
                      <option key={one.id} value={one.id}>
                        {one.fullName} · {one.jobTitle}
                      </option>
                    ))}
                  </optgroup>
                ))
              : options.map((one) => (
                  <option key={one.id} value={one.id}>
                    {one.fullName} · {one.jobTitle}
                  </option>
                ))}
          </Select>
        </Field>

        <Field
          label="Competency"
          required
          {...(errors["competency"] ? { error: errors["competency"] } : {})}
        >
          <Select
            value={competency}
            placeholder="Pick a competency"
            onChange={(event) => {
              /* Everything that belonged to the last competency goes with it: a
                 level typed against a five-point scale means nothing against a
                 yes or no, and a pick is one of *that* competency's choices. */
              setCompetency(event.target.value);
              setLevel("");
              setTarget("");
              setBoolValue("");
              setTypedWords(null);
              setTypedChoice(null);
            }}
          >
            {scoredGroups.map((group) => (
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
        {/* Only an answered, empty list says there is nothing to rate: while it
            is still being read, or when it failed, the picker is just not ready. */}
        {!framework.loading &&
          framework.error === null &&
          framework.competencies.length === 0 && (
            <p className="-mt-2 text-meta text-muted">
              {nothingToRateWords(canEditFramework)}
            </p>
          )}

        {kind === "RATING" && (
          <Field
            label="Level"
            required
            {...(errors["level"] ? { error: errors["level"] } : {})}
          >
            <RatingScale
              name="current-level"
              label="Level"
              levels={steps.map((step) => ({
                level: step,
                label:
                  scaleMax === 5
                    ? (levelWords(step) ?? String(step))
                    : `${String(step)} of ${String(scaleMax)}`,
              }))}
              value={level ? Number(level) : null}
              onChange={(next) => setLevel(String(next))}
            />
          </Field>
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

        {kind === "CHOICE" && (
          <Field
            label="Answer"
            required
            {...(errors["answer"] ? { error: errors["answer"] } : {})}
          >
            <Select
              value={choiceOptionId}
              placeholder="Pick a choice"
              onChange={(event) => setTypedChoice(event.target.value)}
            >
              {choices.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.label}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {kind === "TEXT" && (
          <div className="flex flex-col gap-2">
            <Field
              label="Answer"
              required
              {...(wordsProblem ? { error: wordsProblem } : {})}
            >
              <Textarea
                rows={5}
                value={words}
                placeholder="Write the answer"
                onChange={(event) => setTypedWords(event.target.value)}
              />
            </Field>
            {writtenAnswerCounter(words) && (
              <p
                className={
                  writtenAnswerIsOver(words)
                    ? "text-meta font-medium text-danger-text"
                    : "text-meta text-muted"
                }
              >
                {writtenAnswerCounter(words)}
              </p>
            )}
            {/* Findings are about the words as they stand, quoted back, and never
                stop the save. */}
            <LanguageCheck
              texts={[words]}
              caveat={ANSWER_CAVEAT}
              {...(personName ? { subjectName: personName } : {})}
            />
          </div>
        )}

        {kind === "CHOICE" && takenOffPick !== null && (
          <NoticeLine tone="muted">
            <span>
              Their answer was &ldquo;{takenOffPick}&rdquo;, which is no longer
              offered.
            </span>
          </NoticeLine>
        )}

        {/* Asked in the open only when it cannot be guessed. */}
        {askPeriod && periodField}

        {more && (
          <>
            {kind === "RATING" && (
              <Field label="Target">
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
            )}
            {!askPeriod && openPeriods.length > 0 && periodField}
            <Field label="Note">
              <Textarea
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>
          </>
        )}

        <button
          type="button"
          aria-expanded={more}
          onClick={() => setMore((was) => !was)}
          className="self-start text-body-sm font-medium text-accent-text underline-offset-2 hover:underline"
        >
          {more ? "Less" : "More"}
        </button>
      </div>
    </Modal>
  );
}
