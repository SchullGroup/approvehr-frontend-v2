"use client";

import { useState } from "react";
import Link from "next/link";
import { ListChecks, Pencil } from "lucide-react";
import {
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  IconButton,
  LoadState,
  Select,
  useToast,
} from "@/components/ui";
import type { ApiCompetency, ApiQuestion } from "@/lib/api/performance";
import { ApiError } from "@/lib/api/client";
import {
  askedChoiceOf,
  askedOfChoice,
  type AskedChoice,
} from "@/lib/performance/subsection-ask";
import { answerKindOf } from "@/lib/performance/answer-kind";
import { whoIsAsked } from "@/lib/performance/who-is-asked";
import {
  useCycleMutations,
  useCycleQuestions,
  useFramework,
  useFrameworkActions,
} from "@/lib/store/performance";

/**
 * The form as people will see it: the questions written for this period, and the
 * competencies it asks about.
 *
 * One card per kind of thing, and a card only when it has rows. Nothing here
 * explains itself: the two cards are named for what is in them, and who is asked
 * is a few words on each row.
 *
 * ## A draft chooses its competencies on the row
 *
 * Every competency in the company's framework is listed with one control, **Off,
 * Person, Manager or Both**, and a Save that appears only once a choice has been
 * made. The company's framework itself (what a competency is called, how it is
 * answered) is edited under Edit competencies and nowhere in a period. Once the
 * period has started the API refuses the change, so what it asks is plain text.
 */
export function QuestionsPanel({
  cycleId,
  editable,
  draft,
  onEdit,
  onChanged,
}: {
  cycleId: string;
  /** The reader may change the questions: manage settings, and not published. */
  editable: boolean;
  /** The step-by-step form is for a period that has not started. */
  draft: boolean;
  /** Opens the list that changes the questions of a period that has started. */
  onEdit: () => void;
  /** Something that the period page shows changed (a competency was added). */
  onChanged?: () => void;
}) {
  const { questions, loading, error, reload } = useCycleQuestions(cycleId);
  const own = questions.filter((q) => !q.answersSubsection);
  const asked = questions.filter((q) => q.answersSubsection);
  const wizard = `/performance/periods/${cycleId}/questions`;

  return (
    <LoadState
      loading={loading}
      error={error}
      subject="the questions"
      onRetry={reload}
      hasData={questions.length > 0}
      skeleton="list"
    >
      <div className="flex flex-col gap-6">
        {own.length > 0 ? (
          <Card>
            <CardBody className="flex items-start justify-between gap-3">
              <QuestionList questions={own} />
              {editable && (
                /* One pencil. A draft goes to the step-by-step form; a period
                   that has started opens the list that changes or removes one. */
                <span className="shrink-0">
                  {draft ? (
                    <Link
                      href={wizard}
                      aria-label="Edit the questions"
                      title="Edit the questions"
                      className="inline-flex size-9 items-center justify-center rounded-md border border-line text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      <Pencil aria-hidden="true" className="size-4" />
                    </Link>
                  ) : (
                    <IconButton
                      label="Edit the questions"
                      className="size-9 rounded-md"
                      onClick={onEdit}
                    >
                      <Pencil aria-hidden="true" className="size-4" />
                    </IconButton>
                  )}
                </span>
              )}
            </CardBody>
          </Card>
        ) : (
          /* Nothing written yet: one way to start, on a draft, and on a period
             that has started a plain "none" rather than a button that refuses. */
          editable &&
          draft && (
            <Card>
              <EmptyState
                compact
                icon={<ListChecks aria-hidden="true" />}
                title="No questions yet"
                action={
                  <ButtonLink href={wizard} variant="accent" size="sm">
                    Add questions
                  </ButtonLink>
                }
              />
            </Card>
          )
        )}

        {editable && draft ? (
          <CompetencyChoices
            cycleId={cycleId}
            questions={asked}
            onChanged={() => {
              reload();
              onChanged?.();
            }}
          />
        ) : (
          asked.length > 0 && (
            <Card>
              <CardHeader title="Competencies" />
              <CardBody>
                <QuestionList questions={asked} />
              </CardBody>
            </Card>
          )
        )}
      </div>
    </LoadState>
  );
}

/** The prompt of each, and who is asked as a few words on the right. */
function QuestionList({ questions }: { questions: ApiQuestion[] }) {
  return (
    <ul className="flex min-w-0 flex-1 flex-col gap-2">
      {questions.map((q) => (
        <li
          key={q.id}
          className="flex items-center justify-between gap-3 rounded-md border border-line p-3 text-body-sm text-ink"
        >
          <span>{q.prompt}</span>
          <span className="shrink-0 text-meta text-muted">
            {whoIsAsked(q.askedOf)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */

/** The words on the one control. Off is not an audience: it is no question. */
const CHOICE_WORD: Record<AskedChoice, string> = {
  none: "Off",
  employee: "Person",
  manager: "Manager",
  both: "Both",
};
const CHOICE_ORDER: AskedChoice[] = ["none", "employee", "manager", "both"];

/**
 * Which competencies this draft asks, and of whom.
 *
 * Only for somebody who can change the framework and the period, connected to
 * the API (the demo framework is fixed). Rows read from the period's own
 * questions, so a control never says Off about a form nobody has read: until the
 * questions are in, no rows are drawn.
 */
function CompetencyChoices({
  cycleId,
  questions,
  onChanged,
}: {
  cycleId: string;
  questions: ApiQuestion[];
  onChanged: () => void;
}) {
  const { groups, loading } = useFramework();
  const { editable: connected } = useFrameworkActions();
  if (connected !== true || loading) return null;

  const askedOf = new Map(
    questions.flatMap((q) =>
      q.competencyId ? [[q.competencyId, q.askedOf] as const] : [],
    ),
  );
  const sections = groups
    .map((group) => ({
      ...group,
      competencies: group.competencies.filter(
        (one) => one.active && !one.archived && couldBeAsked(one, askedOf),
      ),
    }))
    .filter((group) => group.competencies.length > 0);
  if (sections.length === 0) return null;

  return (
    <Card>
      <CardHeader title="Competencies" />
      <CardBody className="flex flex-col gap-5">
        {sections.map((group) => (
          <div key={group.sectionName} className="flex flex-col gap-1">
            <p className="text-meta font-medium text-muted">
              {group.sectionName}
            </p>
            <ul className="flex flex-col divide-y divide-line">
              {group.competencies.map((competency) => (
                <CompetencyRow
                  key={competency.id}
                  cycleId={cycleId}
                  competency={competency}
                  saved={askedChoiceOf(askedOf.get(competency.id))}
                  onChanged={onChanged}
                />
              ))}
            </ul>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

/**
 * A pick-one competency with fewer than two choices cannot be asked: a required
 * question with nothing to pick is a form nobody can send. It is left out of the
 * list rather than shown with options that can only refuse, unless it is already
 * on the form, where Off is the way out.
 */
function couldBeAsked(
  competency: ApiCompetency,
  askedOf: ReadonlyMap<string, unknown>,
): boolean {
  if (askedOf.has(competency.id)) return true;
  return !(
    answerKindOf(competency) === "CHOICE" &&
    (competency.choiceOptions?.length ?? 0) < 2
  );
}

function CompetencyRow({
  cycleId,
  competency,
  saved,
  onChanged,
}: {
  cycleId: string;
  competency: ApiCompetency;
  saved: AskedChoice;
  onChanged: () => void;
}) {
  const periods = useCycleMutations();
  const toast = useToast();
  const [picked, setPicked] = useState<AskedChoice | null>(null);
  const [busy, setBusy] = useState(false);
  const chosen = picked ?? saved;
  const changed = chosen !== saved;
  /* The words the control offers: for a pick-one with nothing to pick, only Off. */
  const needsChoices =
    answerKindOf(competency) === "CHOICE" &&
    (competency.choiceOptions?.length ?? 0) < 2;
  const options = CHOICE_ORDER.filter(
    (choice) => !needsChoices || choice === "none",
  );

  const write = async () => {
    setBusy(true);
    try {
      const body = askedOfChoice(chosen);
      if (body === null) {
        await periods.stopAskingSubsection(cycleId, competency.id);
      } else {
        await periods.askSubsection(cycleId, competency.id, body);
      }
      toast.push({
        title:
          chosen === "none"
            ? `${competency.name} taken off the form`
            : saved === "none"
              ? `${competency.name} added to the form`
              : `${competency.name} updated`,
        tone: "success",
      });
      setPicked(null);
      onChanged();
    } catch (caught) {
      /* The API's own sentence, and the control goes back to what is held. */
      setPicked(null);
      toast.push({
        title: "That did not work",
        tone: "danger",
        detail:
          caught instanceof ApiError
            ? caught.message
            : "Something went wrong. Try again.",
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2">
      <span className="min-w-0 text-body-sm text-ink">{competency.name}</span>
      <span className="flex shrink-0 items-center gap-2">
        <Select
          aria-label={`Who is asked about ${competency.name}`}
          value={chosen}
          disabled={busy}
          onChange={(event) => setPicked(event.target.value as AskedChoice)}
          className="w-32"
        >
          {options.map((choice) => (
            <option key={choice} value={choice}>
              {CHOICE_WORD[choice]}
            </option>
          ))}
        </Select>
        {changed && (
          <Button
            size="sm"
            variant="accent"
            loading={busy}
            onClick={() => void write()}
          >
            Save
          </Button>
        )}
      </span>
    </li>
  );
}
