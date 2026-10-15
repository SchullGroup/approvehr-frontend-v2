"use client";

import { useState } from "react";
import {
  Button,
  Callout,
  Checkbox,
  Field,
  Modal,
  Radio,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import {
  ANONYMITY_LIMIT,
  ANONYMITY_PROMISE,
  ATTRIBUTED_NOTICE,
  type AnswerBody,
  type ApiSurveyQuestion,
} from "@/lib/api/surveys";
import { useSurvey, useSurveyActions } from "@/lib/store/surveys";

/**
 * Answer a survey.
 *
 * ## The promise and its limit are shown together, always
 *
 * `ANONYMITY_PROMISE` says what is guaranteed; `ANONYMITY_LIMIT` says what is
 * not. They render in the same callout and neither appears without the other,
 * because a promise that omits its limit is worse than no promise: people write
 * more honestly under it, and it is the free-text answer — their own words
 * about their own situation — that can still identify them however the database
 * is shaped.
 *
 * The attributed case gets its own sentence rather than an absence. "No
 * anonymity badge" is not a claim anybody reads; *"Your name is recorded
 * against your answers on this one"* is.
 */
export function AnswerDialog({
  surveyId,
  onClose,
}: {
  surveyId: string;
  onClose: () => void;
}) {
  const { survey, loading, error } = useSurvey(surveyId);
  const { respond } = useSurveyActions();
  const toast = useToast();

  const [answers, setAnswers] = useState<Record<string, AnswerBody>>({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  function set(questionId: string, patch: Omit<AnswerBody, "questionId">) {
    setAnswers((current) => ({
      ...current,
      [questionId]: { questionId, ...patch },
    }));
  }

  /* Required questions, checked here as well as at the API, so somebody is
     told before they press rather than by a 422 after. The API still refuses;
     this is a courtesy, never the guard. */
  const missing = (survey?.questions ?? []).filter(
    (q) => q.required && !answered(answers[q.id]),
  );

  async function submit() {
    if (!survey) return;
    setSaving(true);
    setFailure(null);
    try {
      const result = await respond(survey.id, Object.values(answers));
      toast.push({
        tone: "success",
        title: "Thank you",
        detail: result.anonymous
          ? "Your answers were sent without your name on them."
          : "Your answers were sent.",
      });
      onClose();
    } catch (e) {
      setFailure(
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Something went wrong. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={survey?.title ?? "Survey"}
      {...(survey?.description ? { description: survey.description } : {})}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={saving || !survey || missing.length > 0}
            onClick={() => void submit()}
          >
            {saving ? "Sending…" : "Send it"}
          </Button>
        </div>
      }
    >
      {loading ? (
        <p className="text-body-sm text-muted">Loading…</p>
      ) : error || !survey ? (
        <Callout tone="danger" title="That survey could not be opened">
          {error instanceof ApiError ? error.message : "Try again in a moment."}
        </Callout>
      ) : (
        <div className="flex flex-col gap-5">
          <Callout
            tone={survey.anonymous ? "success" : "info"}
            title={
              survey.anonymous
                ? "Your name is not recorded against this"
                : "Your name is on this one"
            }
          >
            {survey.anonymous ? (
              <>
                {ANONYMITY_PROMISE} {ANONYMITY_LIMIT}
              </>
            ) : (
              ATTRIBUTED_NOTICE
            )}
          </Callout>

          {survey.questions.map((question) => (
            <QuestionField
              key={question.id}
              question={question}
              answer={answers[question.id]}
              onChange={(patch) => set(question.id, patch)}
            />
          ))}

          {missing.length > 0 && (
            <p className="text-body-sm text-muted">
              {missing.length}{" "}
              {missing.length === 1
                ? "question still needs"
                : "questions still need"}{" "}
              an answer.
            </p>
          )}

          {failure && (
            <Callout tone="danger" title="That was refused">
              {failure}
            </Callout>
          )}
        </div>
      )}
    </Modal>
  );
}

/** Whether anything was actually put in. `0` is not a value any kind here uses. */
function answered(answer: AnswerBody | undefined): boolean {
  if (!answer) return false;
  return (
    answer.scaleValue !== undefined ||
    Boolean(answer.choiceValue) ||
    (answer.choiceValues?.length ?? 0) > 0 ||
    Boolean(answer.textValue?.trim()) ||
    answer.boolValue !== undefined
  );
}

function QuestionField({
  question,
  answer,
  onChange,
}: {
  question: ApiSurveyQuestion;
  answer: AnswerBody | undefined;
  onChange: (patch: Omit<AnswerBody, "questionId">) => void;
}) {
  const options = Array.isArray(question.options)
    ? (question.options as string[])
    : [];

  return (
    <Field
      label={question.prompt}
      required={question.required}
      {...(question.helpText ? { help: question.helpText } : {})}
      {...(question.required ? {} : { optional: true })}
    >
      {question.kind === "SCALE" ? (
        <Select
          value={answer?.scaleValue?.toString() ?? ""}
          onChange={(e) => {
            const value = e.currentTarget.value;
            onChange(value ? { scaleValue: Number(value) } : {});
          }}
        >
          {/* The ceiling is named in the label of every option rather than
              assumed. A 4 means nothing without knowing whether the top is 5
              or 10 — the same reason `scaleMax` is a column. */}
          <option value="">Choose</option>
          {Array.from({ length: question.scaleMax ?? 5 }, (_, i) => i + 1).map(
            (value) => (
              <option key={value} value={value}>
                {value} of {question.scaleMax ?? 5}
              </option>
            ),
          )}
        </Select>
      ) : question.kind === "YES_NO" ? (
        <div className="flex gap-4">
          <Radio
            name={question.id}
            label="Yes"
            checked={answer?.boolValue === true}
            onChange={() => onChange({ boolValue: true })}
          />
          <Radio
            name={question.id}
            label="No"
            checked={answer?.boolValue === false}
            onChange={() => onChange({ boolValue: false })}
          />
        </div>
      ) : question.kind === "CHOICE" ? (
        <div className="flex flex-col gap-2">
          {options.map((option) => (
            <Radio
              key={option}
              name={question.id}
              label={option}
              checked={answer?.choiceValue === option}
              onChange={() => onChange({ choiceValue: option })}
            />
          ))}
        </div>
      ) : question.kind === "MULTI_CHOICE" ? (
        <div className="flex flex-col gap-2">
          {options.map((option) => {
            const chosen = answer?.choiceValues ?? [];
            return (
              <Checkbox
                key={option}
                label={option}
                checked={chosen.includes(option)}
                onChange={(e) =>
                  onChange({
                    choiceValues: e.currentTarget.checked
                      ? [...chosen, option]
                      : chosen.filter((c) => c !== option),
                  })
                }
              />
            );
          })}
        </div>
      ) : (
        <Textarea
          rows={3}
          value={answer?.textValue ?? ""}
          onChange={(e) => onChange({ textValue: e.currentTarget.value })}
        />
      )}
    </Field>
  );
}
