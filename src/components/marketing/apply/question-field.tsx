"use client";

import { cn } from "@/lib/cn";
import {
  countWords,
  isUploadedFile,
  type AnswerValue,
  type FormQuestion,
  SHORT_TEXT_MAX,
  type UploadedFile,
} from "@/lib/marketing/apply-form";
import type { ApplyClient } from "@/lib/marketing/apply-client";
import {
  FieldError,
  Help,
  OptionalMark,
  RequiredMark,
  TextField,
  WordCounter,
  describedBy,
  inputClass,
} from "@/components/marketing/apply/fields";
import { FileUpload } from "@/components/marketing/apply/file-upload";

/**
 * One custom question, drawn the way an applicant meets it.
 *
 * The builder's preview renders this very component, so there is nothing to keep
 * "in step": a kind added here appears in both. Every kind is a real, labelled,
 * keyboard-reachable control — radios and checkboxes sit in a `fieldset` with the
 * question as its `legend`, so a screen reader reads the question once and then
 * each option.
 */

export const questionDomId = (question: { id: string }) => `q-${question.id}`;

export function QuestionField({
  question,
  value,
  onChange,
  error,
  client,
  onBusy,
}: {
  question: FormQuestion;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
  error?: string | undefined;
  client: ApplyClient;
  onBusy: (busy: boolean) => void;
}) {
  const id = questionDomId(question);
  const help = question.helper.trim() || undefined;
  const required = question.required;

  switch (question.kind) {
    case "SHORT_TEXT":
      return (
        <TextField
          id={id}
          label={question.label}
          value={typeof value === "string" ? value : ""}
          onChange={onChange}
          error={error}
          help={help}
          required={required}
          optional={!required}
          maxLength={SHORT_TEXT_MAX + 50}
        />
      );

    case "NUMBER":
      return (
        <TextField
          id={id}
          label={question.label}
          value={typeof value === "string" ? value : ""}
          onChange={onChange}
          error={error}
          help={numberHelp(question, help)}
          required={required}
          optional={!required}
          inputMode="decimal"
        />
      );

    case "URL":
      return (
        <TextField
          id={id}
          label={question.label}
          value={typeof value === "string" ? value : ""}
          onChange={onChange}
          error={error}
          help={help}
          required={required}
          optional={!required}
          type="url"
          inputMode="url"
          placeholder="https://"
        />
      );

    case "LONG_TEXT": {
      const text = typeof value === "string" ? value : "";
      const words = countWords(text);
      const over = question.wordLimit !== null && words > question.wordLimit;
      return (
        <div>
          <label
            htmlFor={id}
            className="block text-body-sm font-medium text-slate"
          >
            {question.label}
            {required && <RequiredMark />}
            {!required && <OptionalMark />}
          </label>
          {help && <Help id={`${id}-help`}>{help}</Help>}
          <textarea
            id={id}
            name={id}
            rows={5}
            value={text}
            required={required}
            aria-invalid={Boolean(error) || over}
            aria-describedby={describedBy(
              help && `${id}-help`,
              `${id}-count`,
              error && `${id}-error`,
            )}
            onChange={(event) => onChange(event.currentTarget.value)}
            className={cn(
              inputClass(Boolean(error) || over),
              "min-h-28 resize-y py-3",
            )}
          />
          <WordCounter id={id} count={words} limit={question.wordLimit} />
          {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
        </div>
      );
    }

    case "SINGLE_CHOICE":
    case "YES_NO": {
      const options =
        question.kind === "YES_NO"
          ? [
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]
          : question.options.map((option) => ({
              value: option.id,
              label: option.label,
            }));
      const chosen = typeof value === "string" ? value : "";
      return (
        <Group
          id={id}
          legend={question.label}
          help={help}
          error={error}
          required={required}
        >
          {options.map((option, index) => (
            <label
              key={option.value}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border bg-white px-4 py-2.5 text-body-sm text-slate",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-slate",
                chosen === option.value
                  ? "border-slate"
                  : "border-sand-line hover:border-slate/40",
              )}
            >
              <input
                type="radio"
                name={id}
                value={option.value}
                checked={chosen === option.value}
                onChange={() => onChange(option.value)}
                {...(index === 0 ? { id: `${id}-first` } : {})}
                className="size-4 accent-slate"
              />
              {option.label}
            </label>
          ))}
        </Group>
      );
    }

    case "MULTI_CHOICE": {
      const chosen = Array.isArray(value) ? value : [];
      return (
        <Group
          id={id}
          legend={question.label}
          help={help}
          error={error}
          required={required}
        >
          {question.options.map((option, index) => {
            const on = chosen.includes(option.id);
            return (
              <label
                key={option.id}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border bg-white px-4 py-2.5 text-body-sm text-slate",
                  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-slate",
                  on
                    ? "border-slate"
                    : "border-sand-line hover:border-slate/40",
                )}
              >
                <input
                  type="checkbox"
                  value={option.id}
                  checked={on}
                  onChange={() =>
                    onChange(
                      on
                        ? chosen.filter((entry) => entry !== option.id)
                        : question.options
                            .map((entry) => entry.id)
                            .filter(
                              (entry) =>
                                entry === option.id || chosen.includes(entry),
                            ),
                    )
                  }
                  {...(index === 0 ? { id: `${id}-first` } : {})}
                  className="size-4 accent-slate"
                />
                {option.label}
              </label>
            );
          })}
        </Group>
      );
    }

    case "FILE":
      return (
        <FileUpload
          id={id}
          label={question.label}
          help={help}
          required={required}
          optional={!required}
          profile="any"
          value={isUploadedFile(value ?? null) ? (value as UploadedFile) : null}
          onChange={onChange}
          onBusy={onBusy}
          error={error}
          client={client}
        />
      );
  }
}

function numberHelp(
  question: FormQuestion,
  help: string | undefined,
): string | undefined {
  const bounds =
    question.min !== null && question.max !== null
      ? `From ${question.min} to ${question.max}.`
      : question.min !== null
        ? `${question.min} or more.`
        : question.max !== null
          ? `${question.max} or fewer.`
          : "";
  const joined = [help, bounds].filter(Boolean).join(" ");
  return joined === "" ? undefined : joined;
}

function Group({
  id,
  legend,
  help,
  error,
  required,
  children,
}: {
  id: string;
  legend: string;
  help: string | undefined;
  error: string | undefined;
  required: boolean;
  children: React.ReactNode;
}) {
  return (
    <fieldset
      id={id}
      tabIndex={-1}
      aria-required={required}
      aria-invalid={Boolean(error)}
      aria-describedby={describedBy(
        help && `${id}-help`,
        error && `${id}-error`,
      )}
      className="min-w-0 border-0 p-0 focus:outline-none"
    >
      <legend className="p-0 text-body-sm font-medium text-slate">
        {legend}
        {required ? <RequiredMark /> : <OptionalMark />}
      </legend>
      {help && <Help id={`${id}-help`}>{help}</Help>}
      <div className="mt-2 flex flex-col gap-2">{children}</div>
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </fieldset>
  );
}
