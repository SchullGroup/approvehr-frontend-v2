"use client";

import { useState } from "react";
import { ClipboardList, Layers, MessagesSquare } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Spinner,
  Stat,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import {
  dayLabel,
  type ApiCycle,
  type ApiPeerFeedback,
  type ApiReview,
} from "@/lib/api/performance";
import { useCan } from "@/lib/permissions";
import {
  useAppraisals,
  useCycleMutations,
  useFramework,
} from "@/lib/store/performance";
import { NewCycleDialog, QuestionsDialog } from "./cycle-dialogs";
import { ReviewFormModal } from "./review-form";

/**
 * Appraisals: what you owe, and what was said about you.
 *
 * ## Two lists, and they are not the same list
 *
 * "Waiting on you" is work — your own self-review, and one form per person who
 * reports to you. "What was said about you" is a record, and it only exists once
 * a cycle is published. Merging them into one "My reviews" table is what the
 * incumbent does, and it is why nobody can tell whether they still owe
 * something.
 *
 * An unsent self-review is deliberately kept out of the record list even though
 * the API returns it there: it is in the work list, and showing the same empty
 * form twice under two headings reads as two jobs.
 *
 * ## Peer feedback says its one line once
 *
 * Anonymity is stated once, at the top of the peer section, and never repeated
 * per answer. What it claims is exactly what is true — no name is attached to an
 * answer — and it does not claim more, because `Review.authorId` is still
 * written for the peer row that carries the answers. Nothing in the read path
 * returns it to anybody, including HR.
 */
export function AppraisalsTab() {
  const appraisals = useAppraisals();
  const framework = useFramework();
  const cycles = useCycleMutations();
  const canManage = useCan("MANAGE_SETTINGS");
  const toast = useToast();

  const [opened, setOpened] = useState<string | null>(null);
  const [questionsFor, setQuestionsFor] = useState<ApiCycle | null>(null);
  const [creatingCycle, setCreatingCycle] = useState(false);

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      toast.push({ title: success, tone: "success" });
      appraisals.reload();
      return true;
    } catch (error) {
      toast.push({
        title: "That did not work",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
      return false;
    }
  };

  const owed = appraisals.mine.toComplete;
  const record = appraisals.mine.aboutMe.filter((review) => review.submitted);
  const openCycle =
    appraisals.cycles.find((cycle) => cycle.stage !== "PUBLISHED" && cycle.stage !== "DRAFT") ??
    appraisals.cycles[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {appraisals.source === "demo" && (
          <Badge tone="warning" size="sm">
            Demo · answers stay in this browser
          </Badge>
        )}
        {canManage && cycles.editable && (
          <Button variant="accent" size="sm" onClick={() => setCreatingCycle(true)}>
            New cycle
          </Button>
        )}
      </div>

      {appraisals.error && (
        <p className="rounded-md border border-danger-line bg-danger-soft px-3.5 py-2.5 text-[0.875rem] text-ink">
          {appraisals.error.message}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Waiting on you" value={String(owed.length)} />
        <Stat label="Reviews about you" value={String(record.length)} />
        <Stat
          label="Current cycle"
          value={openCycle ? openCycle.name : "None running"}
          {...(openCycle ? { hint: `At ${openCycle.stageLabel}` } : {})}
        />
      </div>

      <Card>
        <CardHeader
          title="Waiting on you"
          description="Your own review, and one for each person who reports to you."
        />
        {appraisals.loading ? (
          <CardBody className="flex items-center gap-2 text-[0.875rem] text-muted">
            <Spinner size="sm" />
            Loading
          </CardBody>
        ) : owed.length === 0 ? (
          <EmptyState
            compact
            icon={<ClipboardList aria-hidden="true" />}
            title="Nothing to fill in"
            description="When a cycle starts, your form turns up here."
          />
        ) : (
          <CardBody className="flex flex-col gap-2">
            {owed.map((review) => (
              <ReviewRow
                key={review.id}
                review={review}
                context="owed"
                actionLabel="Fill it in"
                onOpen={() => setOpened(review.id)}
              />
            ))}
          </CardBody>
        )}
      </Card>

      <Card>
        <CardHeader
          title="What was said about you"
          description="Yours to read once the cycle is published."
        />
        {record.length === 0 ? (
          <EmptyState
            compact
            icon={<MessagesSquare aria-hidden="true" />}
            title="Nothing published yet"
            description="A manager's review reaches you when the cycle closes, not before."
          />
        ) : (
          <CardBody className="flex flex-col gap-2">
            {record.map((review) => (
              <ReviewRow
                key={review.id}
                review={review}
                context="record"
                actionLabel="Read it"
                onOpen={() => setOpened(review.id)}
              />
            ))}
          </CardBody>
        )}
      </Card>

      <Card>
        <CardHeader title="Peer feedback" />
        <CardBody className="flex flex-col gap-4">
          <p className="text-[0.875rem] text-body">
            Peer feedback is anonymous. No name is attached to an answer.
          </p>
          {appraisals.mine.peerFeedback.length === 0 ? (
            <p className="text-[0.875rem] text-muted">
              Nothing from colleagues yet.
            </p>
          ) : (
            appraisals.mine.peerFeedback.map((entry) => (
              <PeerBlock key={entry.cycleId} entry={entry} />
            ))
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="What an appraisal is made of"
          description="Four parts, shipped ready. Rename or switch off any of them in settings."
        />
        {framework.loading ? (
          <CardBody className="flex items-center gap-2 text-[0.875rem] text-muted">
            <Spinner size="sm" />
            Loading the framework
          </CardBody>
        ) : framework.groups.length === 0 ? (
          <EmptyState
            compact
            icon={<Layers aria-hidden="true" />}
            title="No framework yet"
            description="Finish setup and the four standard parts are created for you."
          />
        ) : (
          <CardBody className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {framework.groups.map((group) => (
              <div key={group.category}>
                <p className="flex flex-wrap items-center gap-2 text-[0.875rem] font-semibold text-ink">
                  {group.category}
                  {group.category === "Leadership" && (
                    <Badge tone="neutral" size="sm">
                      Managers only
                    </Badge>
                  )}
                </p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {group.competencies.map((competency) => (
                    <li key={competency.id} className="text-[0.875rem] text-body">
                      {competency.name}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardBody>
        )}
      </Card>

      {canManage && (
        <Card>
          <CardHeader
            title="Cycles"
            {...(cycles.editable
              ? {
                  description:
                    "Nudges show up in the app. Email is not connected.",
                }
              : {})}
          />
          {appraisals.cycles.length === 0 ? (
            <EmptyState
              compact
              icon={<ClipboardList aria-hidden="true" />}
              title="No cycles yet"
              description="Create one, add the questions, then start it."
              action={
                cycles.editable ? (
                  <Button variant="accent" onClick={() => setCreatingCycle(true)}>
                    New cycle
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <CardBody className="flex flex-col gap-2">
              {appraisals.cycles.map((cycle) => (
                <div
                  key={cycle.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line p-3"
                >
                  <div className="min-w-0">
                    <p className="text-[0.875rem] font-medium text-ink">
                      {cycle.name}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-[0.75rem] text-muted">
                      <Badge
                        tone={cycle.stage === "PUBLISHED" ? "neutral" : "info"}
                        size="sm"
                        dot
                      >
                        {cycle.stageLabel}
                      </Badge>
                      <span>
                        {cycle.questionCount === 1
                          ? "1 question"
                          : `${cycle.questionCount} questions`}
                      </span>
                      <span>
                        {cycle.reviewCount === 1
                          ? "1 form"
                          : `${cycle.reviewCount} forms`}
                      </span>
                      {cycle.dueDate && <span>Due {dayLabel(cycle.dueDate)}</span>}
                    </p>
                  </div>

                  {cycles.editable && (
                    <div className="flex flex-wrap gap-2">
                      {cycle.stage === "DRAFT" && (
                        <>
                          <Button size="sm" onClick={() => setQuestionsFor(cycle)}>
                            Questions
                          </Button>
                          {cycle.questionCount > 0 && (
                            <Button
                              variant="accent"
                              size="sm"
                              onClick={() =>
                                void run(
                                  () => cycles.activate(cycle.id),
                                  `${cycle.name} started`,
                                )
                              }
                            >
                              Start it
                            </Button>
                          )}
                        </>
                      )}
                      {cycle.stage !== "DRAFT" && cycle.stage !== "PUBLISHED" && (
                        <>
                          <Button
                            size="sm"
                            onClick={() =>
                              void run(
                                () => cycles.remind(cycle.id),
                                "Nudged everyone who is late",
                              )
                            }
                          >
                            Nudge who is late
                          </Button>
                          <Button
                            size="sm"
                            onClick={() =>
                              void run(
                                () => cycles.publish(cycle.id),
                                `${cycle.name} published`,
                              )
                            }
                          >
                            Publish results
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </CardBody>
          )}
        </Card>
      )}

      {opened && (
        <ReviewFormModal
          reviewId={opened}
          onClose={() => setOpened(null)}
          onDone={appraisals.reload}
        />
      )}

      {questionsFor && (
        <QuestionsDialog
          cycleId={questionsFor.id}
          cycleName={questionsFor.name}
          onClose={() => {
            setQuestionsFor(null);
            appraisals.reload();
          }}
          onAdd={(body) => cycles.addQuestion(questionsFor.id, body).then(() => {})}
          onRemove={(id) => cycles.removeQuestion(id).then(() => {})}
        />
      )}

      {creatingCycle && (
        <NewCycleDialog
          onClose={() => setCreatingCycle(false)}
          onCreate={async (name, dueDate) => {
            const ok = await run(
              () => cycles.createCycle(name, dueDate),
              `${name} created`,
            );
            if (ok) setCreatingCycle(false);
          }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * One review, as a row.
 *
 * The second name on the row is different in the two lists, and getting it
 * wrong makes the row useless. In the work list the useful name is **who it is
 * about** — that is what tells you which of your five forms this is. In the
 * record list the subject is always you, so the useful name is **who wrote
 * it**. A single "· name" that always showed the subject printed your own name
 * back at you.
 */
function ReviewRow({
  review,
  context,
  actionLabel,
  onOpen,
}: {
  review: ApiReview;
  context: "owed" | "record";
  actionLabel: string;
  onOpen: () => void;
}) {
  /* In the record list the subject is always you, so an author who *is* the
     subject would print your own name back at you — which is what a first draft
     did, as "Self-review · from Adaeze Okonkwo". */
  const who =
    context === "owed"
      ? review.kind === "SELF"
        ? null
        : review.subjectName
      : review.authorId !== null && review.authorId !== review.subjectId
        ? review.authorName
        : null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line p-3">
      <div className="min-w-0">
        <p className="text-[0.875rem] font-medium text-ink">
          {review.kindLabel}
          {who ? (context === "owed" ? ` · ${who}` : ` · from ${who}`) : ""}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-[0.75rem] text-muted">
          <span>{review.cycleName}</span>
          {review.dueDate && <span>Due {dayLabel(review.dueDate)}</span>}
          {review.rating !== null && <span>Mark {review.rating} out of 5</span>}
          <Badge tone={review.submitted ? "neutral" : "warning"} size="sm" dot>
            {review.submitted ? "Sent" : "Not sent"}
          </Badge>
        </p>
      </div>
      <Button
        variant={review.submitted ? "secondary" : "accent"}
        size="sm"
        onClick={onOpen}
      >
        {actionLabel}
      </Button>
    </div>
  );
}

/**
 * One cycle's peer answers, pooled.
 *
 * Below the floor there is nothing to show but the API's own sentence, and that
 * is what is shown — no partial average, no count of who is missing.
 */
function PeerBlock({ entry }: { entry: ApiPeerFeedback }) {
  if (entry.withheld) {
    return (
      <div className="rounded-md border border-line bg-canvas p-3.5">
        <p className="text-[0.875rem] font-medium text-ink">{entry.cycleName}</p>
        <p className="mt-1 text-[0.875rem] text-body">{entry.note}</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-line p-3.5">
      <p className="flex flex-wrap items-center gap-2 text-[0.875rem] font-medium text-ink">
        {entry.cycleName}
        <Badge tone="neutral" size="sm">
          {entry.responses === 1 ? "1 answer" : `${entry.responses} answers`}
        </Badge>
      </p>
      <div className="mt-3 flex flex-col gap-3">
        {entry.answers.map((answer) => (
          <div key={answer.questionId}>
            <p className="text-[0.75rem] font-medium text-muted">{answer.prompt}</p>
            {answer.averageRating !== null && (
              <p className="tabular mt-1 text-[0.875rem] text-ink">
                Average {answer.averageRating} out of 5, across{" "}
                {answer.answered === 1 ? "1 answer" : `${answer.answered} answers`}
              </p>
            )}
            {answer.yeses > 0 && (
              <p className="tabular mt-1 text-[0.875rem] text-ink">
                {answer.yeses} of {answer.answered} said yes
              </p>
            )}
            {answer.choices.length > 0 && (
              <p className="mt-1 text-[0.875rem] text-ink">
                {answer.choices.join(" · ")}
              </p>
            )}
            {answer.texts.length > 0 && (
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {answer.texts.map((text, index) => (
                  <li
                    key={index}
                    className="border-l-2 border-line-strong pl-3 text-[0.875rem] leading-relaxed text-body"
                  >
                    {text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
