"use client";

import {
  Badge,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Modal,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import type { ApiSurvey } from "@/lib/api/surveys";
import { useSurveyResults } from "@/lib/store/surveys";

/**
 * What came back.
 *
 * ## The withheld state is the feature, not an error
 *
 * Below the threshold the API returns `suppressed: true` and a sentence saying
 * how many more answers are needed. That renders as an ordinary, calm callout —
 * never as a failure, never as an empty chart. Three answers on a nine-person
 * team can be worked out by subtraction, and holding them back is the product
 * doing its job; showing a spinner or a red box would read as something being
 * broken.
 *
 * **Nothing partial is shown below the line**, and that is on the API's side
 * rather than this one's: no per-question counts, no average with a caveat. A
 * report that shows some of the answer is a report somebody completes by
 * subtraction.
 */
export function ResultsPanel({
  survey,
  onClose,
}: {
  survey: ApiSurvey;
  onClose: () => void;
}) {
  const { results, loading, error, reload } = useSurveyResults(survey.id);

  return (
    <Modal
      open
      onClose={onClose}
      title={survey.title}
      description={
        survey.anonymous
          ? "Anonymous — nobody's name is stored against these answers."
          : "Answers on this survey carry a name."
      }
    >
      {error ? (
        <LoadFailure subject="the results" error={error} onRetry={reload} />
      ) : loading || !results ? (
        <p className="text-body-sm text-muted">Loading…</p>
      ) : results.suppressed ? (
        <Callout tone="info" title="Not enough answers yet">
          {/* The API's own sentence, verbatim. It carries the count and the
              shortfall; re-deriving either here is how two screens come to
              disagree about the same number. */}
          {results.reason}
        </Callout>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-body-sm text-muted">
            {results.responded}{" "}
            {results.responded === 1 ? "person has" : "people have"} answered.
          </p>

          {results.questions.map((question) => (
            <Card key={question.id}>
              <CardHeader
                title={question.prompt}
                level={4}
                /* Per question, not per response. An optional question can be
                   skipped, and an average presented over the whole population
                   when half of them said nothing is the absent-is-not-zero rule
                   wearing a chart. */
                description={
                  question.answered === 0
                    ? "Nobody answered this one."
                    : `${question.answered} ${question.answered === 1 ? "answer" : "answers"}.`
                }
              />
              <CardBody className="flex flex-col gap-2">
                {question.kind === "SCALE" && (
                  <p className="text-body">
                    {/* Null, never 0. A 0 on a 1-to-5 scale is not a rating
                        anybody gave — it is the absence of one. */}
                    {question.average === null ? (
                      <span className="text-muted">Nothing recorded</span>
                    ) : (
                      <>
                        <span className="text-h3 tabular-nums">
                          {question.average}
                        </span>
                        <span className="text-muted">
                          {" "}
                          out of {question.scaleMax ?? 5}
                        </span>
                      </>
                    )}
                  </p>
                )}

                {question.tally && (
                  <div className="flex flex-col gap-1">
                    {Object.entries(question.tally).map(([option, count]) => (
                      <div
                        key={option}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="text-body-sm">{option}</span>
                        <Badge tone="neutral">{count}</Badge>
                      </div>
                    ))}
                  </div>
                )}

                {question.text && question.text.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {/* Said once, above the answers it applies to. On an
                        anonymous survey this is the one thing that can still
                        identify somebody, and the reader is the person who
                        would act on it. */}
                    {results.anonymous && (
                      <p className="text-meta text-muted">
                        Written answers can identify the person who wrote them.
                        Treat them as you would a private conversation.
                      </p>
                    )}
                    {question.text.map((line, index) => (
                      <p
                        key={`${question.id}-${index}`}
                        className="rounded-lg border border-line p-3 text-body-sm"
                      >
                        {line}
                      </p>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </Modal>
  );
}
