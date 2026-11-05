"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, Plus, X } from "lucide-react";
import {
  Button,
  Callout,
  Field,
  IconButton,
  Input,
  Select,
  useToast,
} from "@/components/ui";
import { NoticeLine } from "@/components/portal/notice-line";
import type { AnswerKind, ApiCompetency } from "@/lib/api/performance";
import {
  ANSWER_KINDS,
  KIND_FROZEN,
  answerKindOf,
  choiceProblems,
  choicesOf,
  directCounts,
  draftsFrom,
  fixedScoreReason,
  kindLine,
  kindOptionLabel,
  payloadFrom,
  repeatedLabels,
  sameChoices,
  scoreIsFixed,
  type ChoiceDraft,
} from "@/lib/performance/answer-kind";
import {
  ASKED_CHOICES,
  ASKED_CONSEQUENCE,
  ASK_ACTION_LABEL,
  NEEDS_CHOICES,
  askActionFor,
  askedChoiceOf,
  askedOfChoice,
  periodStartedReason,
  savedWords,
  type AskedChoice,
  type SubsectionAsk,
} from "@/lib/performance/subsection-ask";
import { useFrameworkActions } from "@/lib/store/performance";
import { actionMessage } from "@/lib/use-action";

/**
 * How one subsection is answered when somebody records an answer on it directly.
 *
 * ## Addressed by the subsection, not by the period
 *
 * Everything else in `period-dialogs.tsx` is about one appraisal period's
 * questions. A subsection, how it is answered and the choices it offers belong
 * to the company and are shared by every period, past and future, so this takes
 * a subsection and nothing else, and the tab that holds it says so.
 *
 * ## Where the answer is actually given
 *
 * Not here. This decides *how* a subsection is answered; a manager or HR gives
 * the answer under Competency ratings, with Record a level, which is kind-aware
 * and offers a level, a yes or no, or the choices below. Said in the panel's
 * first sentence, because a setting with no sign of where it takes effect reads
 * as one that does nothing.
 *
 * ## ...or on the review form, when the period asks it there
 *
 * One more control, **Ask it on the review form**, and it is **this period's, not
 * the company's**: the kind and the choices above are shared by every period, and
 * this is whether the period in the dialog's title puts the subsection on its
 * forms, to the manager, the employee or both. It is absent where the period
 * cannot be asked (`ask` is not passed), because it would otherwise say "Not
 * asked" for a form nobody has read.
 *
 * ## The kind is written the moment it is picked
 *
 * The same shape as re-filing a subsection in the sections dialog: the picker is
 * driven by what the API holds, so a refusal leaves it where it was and shows the
 * API's own sentence beside it. There is no draft to get out of step.
 *
 * Once the API has said yes, the picker shows the new kind straight away and not
 * after the framework has been read again. A read takes a moment, and for that
 * moment the list this panel is given still says the old kind: a picker that
 * flipped back and then forward again would read as a change that did not take.
 * What was confirmed is kept with the competency it was confirmed for, and is
 * used only while that is still the competency the panel is handed, so the next
 * read, which hands over a new one, is believed instead.
 *
 * ## The kind is fixed once a rating exists
 *
 * `ratingCount` already says so, so the picker is disabled with the reason before
 * anybody tries. What it cannot know is a job role that targets the subsection,
 * which the API also refuses, and that refusal arrives as its sentence naming the
 * roles and is shown verbatim.
 */
export function DirectAnswerPanel({
  competency,
  section,
  editable,
  whyNot,
  onChanged,
  ask,
}: {
  competency: ApiCompetency;
  /** The section it is filed under, as the tree knows it. `null` when unfiled. */
  section: { name: string; weightBp: number | null | undefined } | null;
  /** Connected, and allowed to manage settings. */
  editable: boolean;
  /** Said once when `editable` is false, so a disabled control is not a mystery. */
  whyNot: string | null;
  /** Re-ask the framework after a write that changed what its list shows. */
  onChanged: () => void;
  /**
   * What the period holds for this subsection, and the writes. Absent draws no
   * "Ask it on the review form" control at all: the period cannot be asked.
   */
  ask?: SubsectionAsk;
}) {
  const { updateCompetency } = useFrameworkActions();
  const [confirmed, setConfirmed] = useState<{
    from: ApiCompetency;
    kind: AnswerKind;
  } | null>(null);
  const kind =
    confirmed && confirmed.from === competency
      ? confirmed.kind
      : answerKindOf(competency);
  const frozen = competency.ratingCount > 0;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = async (next: AnswerKind) => {
    if (next === kind) return;
    setBusy(true);
    setError(null);
    try {
      await updateCompetency(competency.id, { answerKind: next });
      setConfirmed({ from: competency, kind: next });
      onChanged();
    } catch (caught) {
      /* The API's own sentence: it names the subsection, and for a job role
         that targets it, the roles. Nothing here can write either. */
      setError(actionMessage(caught, "how it is answered"));
    } finally {
      setBusy(false);
    }
  };

  const counts = directCounts({ kind, section });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body-sm text-muted">
        {competency.name} is answered directly when a manager or HR records an
        answer on it, under Competency ratings, with Record a level. How it is
        answered is shared by every appraisal period.
      </p>

      {error && (
        <Callout tone="danger" title="That did not go through">
          {error}
        </Callout>
      )}

      <Field label="How it is answered">
        <Select
          value={kind}
          disabled={!editable || frozen || busy}
          onChange={(event) => void change(event.target.value as AnswerKind)}
        >
          {ANSWER_KINDS.map((option) => (
            <option key={option} value={option}>
              {kindOptionLabel(option, competency.scaleMax)}
            </option>
          ))}
        </Select>
      </Field>

      {frozen && (
        <NoticeLine tone="muted">
          <span>{KIND_FROZEN}</span>
        </NoticeLine>
      )}
      {!editable && whyNot && (
        <NoticeLine tone="muted">
          <span>{whyNot}</span>
        </NoticeLine>
      )}

      <NoticeLine tone="muted">
        <span>{kindLine(kind, competency.scaleMax)}</span>
      </NoticeLine>
      {counts && (
        <NoticeLine tone={counts.tone}>
          <span>{counts.text}</span>
        </NoticeLine>
      )}

      {kind === "CHOICE" && (
        <ScoredChoiceEditor
          competency={competency}
          editable={editable && !busy}
          onSaved={onChanged}
        />
      )}

      {ask && (
        <AskOnForm
          competency={competency}
          kind={kind}
          ask={ask}
          editable={editable}
          onChanged={onChanged}
        />
      )}
    </div>
  );
}

/**
 * Whether this period puts the subsection on its review form, and to whom.
 *
 * ## Four choices, and a button that writes them
 *
 * **Not asked**, **The manager**, **The employee**, **Both**. Picking one writes
 * nothing: the button beside it does, and says what it will do (`askActionFor`).
 * The first version wrote on the pick, like the kind picker above it, and the
 * product owner asked twice where to click Add: a control that saves by itself
 * leaves nobody sure it has, and a toast is gone in six seconds. So the way to
 * finish is on screen from the start, a disabled **Add to the review form** until
 * something is chosen, and **On the review form** takes its place once the period
 * holds it. A refusal leaves the control where the server has it with the
 * server's own sentence under it. **Not asked** is not an audience, it is the
 * question coming off the form, so it is the `DELETE` and never a request with
 * nobody in it (`askedOfChoice`).
 *
 * ## What was just written is believed until the period says otherwise
 *
 * A write is followed by a re-read of the period's questions, and for as long as
 * that takes the list this is handed still says what it said before. Showing that
 * would flip the control back and then forward again, which reads as a change that
 * did not take. So what was written is kept with the value the period held when
 * it was written (`base`), and believed only while the period still holds that.
 * The moment the list moves, to what was written or to anything somebody else
 * did, the period is believed instead and what was kept is dropped, in render and
 * not in an effect: kept any longer it would come back the next time the period
 * happened to read `base` again and show a choice nobody made.
 *
 * ## When it cannot be changed, and why
 *
 * Not once the period has started: the API refuses, because forms that people
 * have already begun would be missing a question. Not for somebody who cannot
 * manage settings (the panel says so once, above). And a pick-one subsection with
 * fewer than two choices cannot be *asked*, because a required question with
 * nothing to pick is a form nobody can send. It can still be taken off, which is
 * the way out if it somehow got on.
 *
 * ## The line under it
 *
 * One short line, only where it changes the decision: whose answer counts. **Not
 * asked says nothing.** It follows the choice and not what the period holds,
 * because it is there to help decide, which is before the button is pressed.
 */
function AskOnForm({
  competency,
  kind,
  ask,
  editable,
  onChanged,
}: {
  competency: ApiCompetency;
  kind: AnswerKind;
  ask: SubsectionAsk;
  editable: boolean;
  onChanged: () => void;
}) {
  const server = askedChoiceOf(ask.askedOf(competency.id));
  const [mine, setMine] = useState<{
    value: AskedChoice;
    base: AskedChoice;
  } | null>(null);
  /* The period has moved on from where it was when this was written. */
  if (mine !== null && server !== mine.base) setMine(null);
  /* What the period holds. */
  const saved = mine !== null ? mine.value : server;

  /* What the select says. Only a choice until the button is pressed, and `null`
     while it says what the period holds. */
  const [picked, setPicked] = useState<AskedChoice | null>(null);
  const chosen = picked ?? saved;
  const action = askActionFor(saved, chosen);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  /* From the choices the framework holds now. `choicesOf` reads the kind the
     framework has, which is the old one for the moment after it was changed. */
  const choiceCount =
    kind === "CHOICE" ? (competency.choiceOptions?.length ?? 0) : null;
  const needsChoices = choiceCount !== null && choiceCount < 2;
  const reason = !ask.draft
    ? periodStartedReason(ask.periodName)
    : needsChoices
      ? NEEDS_CHOICES
      : null;

  const write = async () => {
    if (busy || action === null) return;
    setBusy(true);
    setError(null);
    try {
      const body = askedOfChoice(chosen);
      if (body === null) await ask.onStop(competency.id);
      else await ask.onAsk(competency.id, body);
      setMine({ value: chosen, base: server });
      setPicked(null);
      /* The button is replaced by "On the review form", which stays; this says
         what happened and where to find it. Only after the API has said yes: a
         refusal shows its own sentence instead. */
      toast.push({
        ...savedWords(chosen, competency.name, saved),
        tone: "success",
      });
      onChanged();
    } catch (caught) {
      /* The API's own sentence: it names the subsection and the period. The
         control goes back to what the period holds, so it never says a thing is
         on the form that is not. */
      setPicked(null);
      setError(actionMessage(caught, "who is asked"));
    } finally {
      setBusy(false);
    }
  };

  const canChange = editable && ask.draft;
  const consequence = ASKED_CONSEQUENCE[chosen];

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-4">
      <Field
        label="Ask it on the review form"
        help={`${ask.periodName} only. Other periods choose for themselves.`}
        {...(error ? { error } : {})}
      >
        <Select
          value={chosen}
          disabled={!canChange || busy}
          onChange={(event) => {
            setPicked(event.target.value as AskedChoice);
            setError(null);
          }}
        >
          {ASKED_CHOICES.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={needsChoices && option.value !== "none"}
            >
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
      {canChange && (
        <div className="flex flex-wrap items-center gap-2">
          {action !== null ? (
            <Button
              type="button"
              variant={action === "remove" ? "secondary" : "accent"}
              size="sm"
              loading={busy}
              onClick={() => void write()}
            >
              {ASK_ACTION_LABEL[action]}
            </Button>
          ) : saved === "none" ? (
            <Button type="button" variant="accent" size="sm" disabled>
              {ASK_ACTION_LABEL.add}
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-body-sm text-muted">
              <Check
                aria-hidden="true"
                className="size-3.5 text-success-text"
              />
              On the review form
            </span>
          )}
        </div>
      )}
      {reason && (
        <NoticeLine tone="muted">
          <span>{reason}</span>
        </NoticeLine>
      )}
      {consequence && (
        <NoticeLine tone="muted">
          <span>{consequence}</span>
        </NoticeLine>
      )}
    </div>
  );
}

/**
 * Two blank rows to start from, for a pick-a-list subsection with no choices yet.
 *
 * Constants, with fixed keys, so that deriving the rows during render never
 * mints a key: a counter ticked in render is a side effect, and new rows get
 * theirs from the ref in the handlers below, where it belongs.
 */
const STARTER_ROWS: ChoiceDraft[] = [
  { key: "starter-1", label: "", score: "" },
  { key: "starter-2", label: "", score: "" },
];

/**
 * The choices of a pick-a-list subsection, and what each one scores.
 *
 * ## Its own list, its own Save
 *
 * Not the `ChoiceEditor` the question form uses. That one carries "also accept
 * a typed answer" and suggested phrasings, neither of which means anything for a
 * scored list, and its removal is a plain splice where here a row that was never
 * saved is simply dropped and one the API already has is *archived* by being
 * left out. The two share an "add a row, remove a row, keep at least two" shape
 * and nothing else, which is less than a shared component is worth.
 *
 * The list is saved whole, by `PUT`, from its own button: the set is the unit
 * ("at least two" is only checkable on the set), the same reasoning as the
 * scoring weights.
 *
 * ## A score is typed as a percentage and sent as whole basis points
 *
 * 0% to 100% with up to two decimals, which is exactly a basis point, so nothing
 * typed is a figure the payload has to lose. A value that is not a score is
 * refused rather than clamped: saving 150 as 100 would be a number nobody chose.
 *
 * ## A picked choice keeps its score, and the screen learns it from the refusal
 *
 * Changing the score of a choice somebody has picked would re-score every mark
 * that picked it, with no rating changed and nothing in the trail to say why. The
 * API refuses, naming every such choice in one sentence, and that sentence is
 * shown as it comes. There is no count of picks per choice on the wire, so no
 * row can be marked frozen beforehand. The line under the list says the rule
 * instead, and a label and a position stay editable on a picked choice: a typo in
 * a label has to be fixable after somebody has chosen it.
 *
 * ## The rows are derived, not copied
 *
 * What was typed is held with the list it started from and used only while that
 * list is still the API's. A save reloads the framework, which hands over a new
 * list, and the rows are the API's again, with the ids it gave the new ones. No
 * state is set in an effect to get there.
 */
function ScoredChoiceEditor({
  competency,
  editable,
  onSaved,
}: {
  competency: ApiCompetency;
  editable: boolean;
  onSaved: () => void;
}) {
  const { setChoiceOptions } = useFrameworkActions();
  const toast = useToast();
  const saved = choicesOf(competency);
  /* The list as the API holds it, by identity: it only changes when the
     framework is read again. `saved` above is a fresh sorted copy each render
     and cannot be compared by reference. */
  const source = competency.choiceOptions;

  const counter = useRef(0);
  const [edited, setEdited] = useState<{
    from: typeof source;
    rows: ChoiceDraft[];
  } | null>(null);
  /* Problems are shown once somebody has tried to save, not on a row they have
     just added and not yet typed into. */
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows =
    edited && edited.from === source
      ? edited.rows
      : saved.length > 0
        ? draftsFrom(saved)
        : STARTER_ROWS;

  const update = (next: ChoiceDraft[]) => {
    setEdited({ from: source, rows: next });
    setError(null);
  };

  const setRow = (
    key: string,
    patch: Partial<Pick<ChoiceDraft, "label" | "score">>,
  ) =>
    update(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const add = () => {
    counter.current += 1;
    update([
      ...rows,
      { key: `added-${String(counter.current)}`, label: "", score: "" },
    ]);
  };

  const remove = (key: string) => update(rows.filter((row) => row.key !== key));

  const move = (index: number, delta: -1 | 1) => {
    const next = [...rows];
    const [row] = next.splice(index, 1);
    if (!row) return;
    next.splice(index + delta, 0, row);
    update(next);
  };

  const problems = choiceProblems(rows);
  const repeated = repeatedLabels(rows);
  const unchanged = sameChoices(rows, saved);

  const save = async () => {
    setTried(true);
    if (problems.length > 0) return;
    const payload = payloadFrom(rows);
    if (payload === null) return;
    setSaving(true);
    setError(null);
    try {
      await setChoiceOptions(competency.id, payload);
      toast.push({ title: "Choices saved", tone: "success" });
      setTried(false);
      onSaved();
    } catch (caught) {
      /* Kept as typed: a refusal is about the set as it stands, and throwing the
         rows away would make somebody retype the ones that were fine. */
      setError(actionMessage(caught, "the choices"));
    } finally {
      setSaving(false);
    }
  };

  const countProblem = tried
    ? problems.find((problem) => problem.field === "count")
    : undefined;
  /* Every problem a row has, not the first: a row with no label and no score
     says both, so fixing one does not uncover the other on the next press. */
  const problemsFor = (key: string) =>
    tried
      ? problems.filter((problem) => "key" in problem && problem.key === key)
      : [];

  return (
    <div className="flex flex-col gap-3 rounded-md border border-line bg-canvas p-3">
      <span className="text-body-sm font-medium text-ink">Choices</span>

      {saved.length === 0 && (
        <NoticeLine tone="warning">
          <span>
            It has no choices yet, so nobody can answer it. Give it at least
            two.
          </span>
        </NoticeLine>
      )}

      {error && (
        <Callout tone="danger" title="That did not go through">
          {error}
        </Callout>
      )}

      <ul className="flex flex-col gap-2">
        {rows.map((row, index) => {
          const number = index + 1;
          const rowProblems = problemsFor(row.key);
          const badLabel = rowProblems.some(
            (problem) => problem.field === "label",
          );
          const badScore = rowProblems.some(
            (problem) => problem.field === "score",
          );
          /* A choice somebody has already picked keeps its score for good, so the
             field says so here instead of letting a save be refused. Its label
             and its place in the list stay editable. */
          const fixed = editable && scoreIsFixed(row);
          return (
            <li key={row.key} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1 basis-48">
                  <Input
                    aria-label={`Choice ${String(number)}`}
                    placeholder={`Choice ${String(number)}`}
                    value={row.label}
                    aria-invalid={badLabel || undefined}
                    disabled={!editable || saving}
                    onChange={(event) =>
                      setRow(row.key, { label: event.target.value })
                    }
                  />
                </div>
                <div className="w-28 shrink-0">
                  <Input
                    aria-label={`Score for choice ${String(number)}, as a percentage`}
                    placeholder="Score, %"
                    inputMode="decimal"
                    value={row.score}
                    aria-invalid={badScore || undefined}
                    aria-describedby={
                      fixed ? `fixed-score-${row.key}` : undefined
                    }
                    disabled={!editable || saving || fixed}
                    onChange={(event) =>
                      setRow(row.key, { score: event.target.value })
                    }
                  />
                </div>
                {editable && (
                  <span className="flex shrink-0 gap-1">
                    <IconButton
                      label={`Move choice ${String(number)} up`}
                      disabled={saving || index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp aria-hidden="true" />
                    </IconButton>
                    <IconButton
                      label={`Move choice ${String(number)} down`}
                      disabled={saving || index === rows.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown aria-hidden="true" />
                    </IconButton>
                    {rows.length > 2 && (
                      <IconButton
                        label={`Remove choice ${String(number)}`}
                        disabled={saving}
                        onClick={() => remove(row.key)}
                      >
                        <X aria-hidden="true" />
                      </IconButton>
                    )}
                  </span>
                )}
              </div>
              {fixed && (
                <p
                  id={`fixed-score-${row.key}`}
                  className="text-meta text-muted"
                >
                  {fixedScoreReason(row.picks ?? 0)}
                </p>
              )}
              {rowProblems.map((problem) => (
                <p
                  key={problem.field}
                  className="text-body-sm text-danger-text"
                >
                  {problem.message}
                </p>
              ))}
            </li>
          );
        })}
      </ul>

      {countProblem && (
        <p className="text-body-sm text-danger-text">{countProblem.message}</p>
      )}

      {repeated.length > 0 && (
        <NoticeLine tone="warning">
          <span>
            {repeated.length === 1
              ? `Two choices are both called "${repeated[0] ?? ""}".`
              : `Some choices share a name: ${repeated.map((label) => `"${label}"`).join(", ")}.`}{" "}
            A person&rsquo;s skills list shows the name of the pick only, so
            give each choice its own.
          </span>
        </NoticeLine>
      )}

      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" disabled={saving} onClick={add}>
            <Plus aria-hidden="true" className="size-3.5" />
            Add a choice
          </Button>
          <Button
            variant="accent"
            size="sm"
            loading={saving}
            disabled={unchanged}
            onClick={() => void save()}
          >
            Save choices
          </Button>
        </div>
      )}

      <p className="text-meta text-muted">
        A score is what a pick is worth, from 0% to 100%. A choice that has been
        picked in a rating keeps its score for good, and its name and its place
        in the list can still change. A choice you take out of the list is
        archived, not deleted, and marks already given keep the score they were
        given.
      </p>
    </div>
  );
}
