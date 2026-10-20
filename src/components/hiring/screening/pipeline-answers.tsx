"use client";

import { Card, CardBody, CardHeader } from "@/components/ui";
import { ApplicationAnswers } from "@/components/hiring/application-answers";
import type { ApiPipelineScreening } from "@/lib/api/recruitment";
import type { AnswerRow, ApplicationExtras } from "@/lib/hiring/answers-view";
import type { QuestionKind } from "@/lib/marketing/apply-form";

/**
 * What a person answered on the form, on their pipeline record.
 *
 * A pipeline record is made when somebody is screened in, and the form they filled
 * in stays with the application they came through. The API reads it across for the
 * record, flags and all, so a reviewer on the board or the record does not have to
 * go and find the application to see which answer raised a flag. It is read-only:
 * the decisions about an application (keep, assess, turn down) are made on the
 * application and on the list below the pass mark.
 *
 * Drawn only for a record that has no application half of its own on the page, so
 * the same answers are never listed twice.
 */

export function extrasFromPipeline(
  screening: ApiPipelineScreening,
): ApplicationExtras {
  const answers: AnswerRow[] = screening.answers.map((answer) => ({
    id: answer.id,
    label: answer.question,
    kind: answer.kind as QuestionKind,
    /* The API says whether the answer was flagged and why, not whether the question
       was a knockout when it was asked: a flag is what makes it one. */
    knockout: answer.flagged,
    text: answer.display === "" ? null : answer.display,
    words: null,
    link: null,
    /* A file is described, never linked, on this side. */
    file: null,
    flagged: answer.flagged,
    flagReason: answer.flagReason,
  }));
  return {
    reference: screening.reference,
    source: null,
    answers,
    consent: null,
    flagCount: answers.filter((answer) => answer.flagged).length,
    duplicate: null,
  };
}

export function PipelineAnswers({
  screening,
}: {
  screening: ApiPipelineScreening;
}) {
  const extras = extrasFromPipeline(screening);
  if (extras.answers.length === 0 && extras.reference === null) return null;
  return (
    <Card>
      <CardHeader
        title="What they answered"
        description="From the application they came through. A flag asks a person to read the answer; it decides nothing."
      />
      <CardBody>
        <ApplicationAnswers extras={extras} />
      </CardBody>
    </Card>
  );
}
