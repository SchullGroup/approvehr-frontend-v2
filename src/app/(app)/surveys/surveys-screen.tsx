"use client";

import { useState } from "react";
import { ClipboardList, EyeOff } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { useCan } from "@/lib/permissions";
import type { ApiSurvey } from "@/lib/api/surveys";
import {
  DEMO_SURVEY_HEADING,
  DEMO_SURVEY_REASON,
  useMySurveys,
  useSurveyActions,
  useSurveys,
} from "@/lib/store/surveys";
import { AnswerDialog } from "./answer-dialog";
import { ResultsPanel } from "./results-panel";

/**
 * Surveys — one route, two readers.
 *
 * PARITY Rule 1: one route per concept, narrowed by role rather than by URL.
 * An employee sees what they have been asked; somebody holding
 * `MANAGE_SETTINGS` sees that **and** the surveys they are running. The
 * incumbent ships these as separate pages and that is how you end up with a
 * hundred and twenty routes.
 *
 * The employee half is first on the page for everybody, including the
 * administrator, because a survey waiting on *you* is the thing that needs
 * doing and a list of surveys you are running is a thing you are looking at.
 */
export function SurveysScreen() {
  const mine = useMySurveys();
  const running = useSurveys();
  const canManage = useCan("MANAGE_SETTINGS");
  const [answering, setAnswering] = useState<string | null>(null);
  const [showing, setShowing] = useState<ApiSurvey | null>(null);

  if (mine.unavailable) {
    return (
      <Callout tone="info" title={DEMO_SURVEY_HEADING}>
        {DEMO_SURVEY_REASON}
      </Callout>
    );
  }

  if (mine.error) {
    return (
      <LoadFailure
        subject="the surveys you have been asked"
        error={mine.error}
        onRetry={mine.reload}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title="Waiting on you"
          description={
            mine.invites.length === 0
              ? undefined
              : `${mine.invites.length} to answer.`
          }
        />
        {mine.loading ? (
          <CardBody className="text-body-sm text-muted">Loading…</CardBody>
        ) : mine.invites.length === 0 ? (
          <EmptyState
            icon={<ClipboardList aria-hidden="true" className="size-5" />}
            title="Nothing to answer"
            description="You will see anything you are asked here."
          />
        ) : (
          <CardBody className="flex flex-col gap-3">
            {mine.invites.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-4"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-body font-medium">
                      {invite.title}
                    </span>
                    {/* The promise, as a badge, wherever the survey appears —
                        not only on the form. Somebody decides whether to open
                        it at all partly on this. */}
                    {invite.anonymous ? (
                      <Badge tone="success">
                        <EyeOff aria-hidden="true" className="mr-1 size-3" />
                        Anonymous
                      </Badge>
                    ) : (
                      <Badge tone="neutral">Your name is on it</Badge>
                    )}
                  </div>
                  {invite.description && (
                    <p className="text-body-sm text-muted">
                      {invite.description}
                    </p>
                  )}
                  <p className="text-meta text-muted">
                    {invite.questionCount}{" "}
                    {invite.questionCount === 1 ? "question" : "questions"}
                    {invite.closesAt
                      ? ` · closes ${invite.closesAt.slice(0, 10)}`
                      : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="accent"
                  onClick={() => setAnswering(invite.id)}
                >
                  Answer it
                </Button>
              </div>
            ))}
          </CardBody>
        )}
      </Card>

      {canManage && <RunningPanel state={running} onShow={setShowing} />}

      {answering && (
        <AnswerDialog surveyId={answering} onClose={() => setAnswering(null)} />
      )}
      {showing && (
        <ResultsPanel survey={showing} onClose={() => setShowing(null)} />
      )}
    </div>
  );
}

function RunningPanel({
  state,
  onShow,
}: {
  state: ReturnType<typeof useSurveys>;
  onShow: (survey: ApiSurvey) => void;
}) {
  const actions = useSurveyActions();
  const toast = useToast();

  if (state.error) {
    return (
      <LoadFailure
        subject="the surveys you are running"
        error={state.error}
        onRetry={state.reload}
      />
    );
  }

  async function close(survey: ApiSurvey) {
    try {
      await actions.close(survey.id);
      toast.push({ tone: "info", title: `${survey.title} is closed` });
    } catch (e) {
      toast.push({
        tone: "danger",
        title: "That was refused",
        ...(e instanceof Error ? { detail: e.message } : {}),
      });
    }
  }

  return (
    <Card>
      <CardHeader
        title="Surveys you are running"
        level={3}
        description={
          state.surveys.length === 0
            ? undefined
            : `${state.surveys.length} in the last while.`
        }
      />
      {state.loading ? (
        <CardBody className="text-body-sm text-muted">Loading…</CardBody>
      ) : state.surveys.length === 0 ? (
        <EmptyState
          icon={<ClipboardList aria-hidden="true" className="size-5" />}
          title="None yet"
          description="A survey is a set of questions, a list of people to ask, and a decision about whether the answers carry a name."
        />
      ) : (
        <TableWrap caption="Surveys this company is running">
          <THead>
            <TH>Survey</TH>
            <TH>Answers</TH>
            <TH>Status</TH>
            <TH />
          </THead>
          <TBody>
            {state.surveys.map((survey) => (
              <TR key={survey.id}>
                <TDPrimary
                  title={survey.title}
                  subtitle={
                    survey.anonymous ? "Anonymous" : "Answers carry a name"
                  }
                />
                <TD className="tabular-nums">
                  {survey.responded} of {survey.invited}
                  {/* The threshold, stated on the row rather than only in the
                      results — somebody watching a survey fill up needs to know
                      when it will start showing anything. */}
                  {survey.responded < survey.minResponses && (
                    <span className="text-muted">
                      {" "}
                      · held back until {survey.minResponses}
                    </span>
                  )}
                </TD>
                <TD>
                  <Badge
                    tone={
                      survey.status === "OPEN"
                        ? "success"
                        : survey.status === "DRAFT"
                          ? "neutral"
                          : "warning"
                    }
                  >
                    {survey.status === "OPEN"
                      ? "Open"
                      : survey.status === "DRAFT"
                        ? "Draft"
                        : "Closed"}
                  </Badge>
                </TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onShow(survey)}
                    >
                      Results
                    </Button>
                    {survey.status === "OPEN" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void close(survey)}
                      >
                        Close it
                      </Button>
                    )}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </TableWrap>
      )}
    </Card>
  );
}
