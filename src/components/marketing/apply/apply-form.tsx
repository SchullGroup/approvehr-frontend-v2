"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { CaptchaSlot } from "@/components/marketing/captcha-slot";
import { PillButton } from "@/components/marketing/pill";
import {
  FieldError,
  RequiredMark,
  TextField,
  describedBy,
} from "@/components/marketing/apply/fields";
import { FileUpload } from "@/components/marketing/apply/file-upload";
import {
  QuestionField,
  questionDomId,
} from "@/components/marketing/apply/question-field";
import type { ApplyClient } from "@/lib/marketing/apply-client";
import {
  defaultDefinition,
  validateAnswers,
  type Answers,
  type AnswerValue,
  type FormDefinition,
  type UploadedFile,
} from "@/lib/marketing/apply-form";
import {
  CV_LINE,
  HONEYPOT_FIELD,
  confirmationExpected,
  type ApplyFailureKind,
  type ApplyResult,
} from "@/lib/marketing/careers";

/**
 * Apply.
 *
 * ## The form is whatever the advert says it is
 *
 * Name, email and, if the company wants them, a phone number, a CV, a covering
 * letter, a note and any number of its own questions. The default — no definition
 * at all — is the old four boxes and a note, so a company that never touched the
 * builder, and an API that predates it, both see what they always saw.
 *
 * ## It never talks to the network itself
 *
 * It is given an `ApplyClient`. The public page gives it the live one; the
 * builder's preview and the demo give it one that moves nothing. Everything else
 * — the boxes, the checks, the messages — is the same code, which is what makes
 * "the preview is what an applicant sees" a fact rather than a promise.
 *
 * ## Two checks a person never sees
 *
 * A **honeypot**: one extra text box, off-screen, hidden from assistive
 * technology, out of the tab order and told not to autofill. A person never
 * reaches it; a script that fills in every field it finds does, and the API
 * treats a non-empty value as a bot. It is sent on every submission, empty for
 * people, because the API wants to see the field arrive.
 *
 * A **"are you a person" check**, which is off until the API is configured for
 * it. It is not on the page — and its script is not requested — until the API
 * says it is needed: with the advert (`captchaRequired`), or by refusing an
 * application with `captcha_required`, in which case the form keeps what was
 * typed, shows the check, and the applicant presses Send again.
 *
 * ## Validation happens on send, and it ends in a summary
 *
 * Not on every keystroke: a form that scolds you halfway through typing your email
 * address is a form people abandon. Pressing Send with problems puts a list of
 * them at the top, moves focus to it, and each line takes you to its box. Errors
 * clear as soon as the box is corrected. Whatever the API refuses is shown the
 * same way and at the box it is about.
 *
 * ## Nothing is lost on a failure
 *
 * A refused application, a dropped connection, a failed upload: the form stays
 * filled in, every file stays attached, and the message says what to do.
 */

type Fields = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  note: string;
};

type Errors = Record<string, string>;

/** Public by design — it identifies this site to the challenge provider and
 *  grants nothing. The matching secret lives only on the API. */
const CAPTCHA_SITE_KEY =
  process.env["NEXT_PUBLIC_TURNSTILE_SITE_KEY"]?.trim() || null;

const PHONE_PATTERN = /^[0-9+()\-.\s]{7,30}$/;

export function ApplyForm({
  roleTitle,
  company,
  client,
  form = defaultDefinition(),
  uploadsEnabled = false,
  captchaRequired = false,
  src = null,
  utm = null,
}: {
  roleTitle: string;
  company: string;
  client: ApplyClient;
  /** The advert's own form. Absent means the original boxes. */
  form?: FormDefinition;
  /** True when the API can take a file at all (a bucket is set up). Without it, no file box is drawn. */
  uploadsEnabled?: boolean;
  /** True when the API said, with the advert, that the check is on. */
  captchaRequired?: boolean;
  /** `?src=` from the link they followed. Sent with the application. */
  src?: string | null;
  /** The `utm_*` values on that link, if any. Sent with the application. */
  utm?: { source?: string; medium?: string; campaign?: string } | null;
}) {
  const [fields, setFields] = useState<Fields>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    note: "",
  });
  const [answers, setAnswers] = useState<Answers>({});
  const [cv, setCv] = useState<UploadedFile | null>(null);
  const [consent, setConsent] = useState(false);
  /* The honeypot. Empty for every person who ever uses this form. */
  const [trap, setTrap] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [summary, setSummary] = useState<{ id: string; message: string }[]>([]);
  const [refusal, setRefusal] = useState<{
    kind: ApplyFailureKind;
    message: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{
    result: ApplyResult;
    email: string;
  } | null>(null);
  /* Which file boxes have an upload in flight. Send waits for all of them. */
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  /* On from the start when the advert said so; otherwise only once the API has
     refused an application for want of the check. */
  const [needsCheck, setNeedsCheck] = useState(captchaRequired);
  const [checkToken, setCheckToken] = useState<string | null>(null);
  const [checkReset, setCheckReset] = useState(0);
  const [checkMissing, setCheckMissing] = useState(false);
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const [focusSummary, setFocusSummary] = useState(0);

  /* Move focus to the summary after it has been drawn. A counter rather than a
     boolean so two refusals in a row both pull focus. */
  useEffect(() => {
    if (focusSummary > 0) summaryRef.current?.focus();
  }, [focusSummary]);

  const takesFiles = uploadsEnabled;
  const showPhone = form.standard.phone !== "OFF";
  const showNote = form.standard.coverNote !== "OFF";
  const showCv = takesFiles && form.standard.cv !== "OFF";
  /* A question that needs a file cannot be answered where no file can be sent;
     it is left off rather than shown as something nobody can complete. */
  const questions = form.questions.filter(
    (question) => question.kind !== "FILE" || takesFiles,
  );

  const setField = (key: keyof Fields, value: string) => {
    setFields((current) => ({ ...current, [key]: value }));
    clearError(key);
    setRefusal(null);
  };

  const clearError = (key: string) => {
    setErrors((current) => {
      if (!(key in current)) return current;
      const { [key]: _gone, ...rest } = current;
      void _gone;
      return rest;
    });
    setSummary((current) => current.filter((entry) => entry.id !== key));
  };

  const setAnswer = (id: string, value: AnswerValue) => {
    setAnswers((current) => ({ ...current, [id]: value }));
    clearError(questionDomId({ id }));
    setRefusal(null);
  };

  const setBusyFor = (key: string) => (value: boolean) =>
    setUploading((current) => ({ ...current, [key]: value }));

  const anyUploading = Object.values(uploading).some(Boolean);

  function validate(): Errors {
    const found: Errors = {};
    if (!fields.firstName.trim()) found["firstName"] = "Enter your first name.";
    if (!fields.lastName.trim()) found["lastName"] = "Enter your surname.";
    if (!fields.email.trim()) found["email"] = "We need an email to reply to.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(fields.email.trim()))
      found["email"] = "That does not look like a working email address.";

    if (showPhone) {
      if (fields.phone.trim() === "") {
        if (form.standard.phone === "REQUIRED")
          found["phone"] = "Enter a phone number we can reach you on.";
      } else if (!PHONE_PATTERN.test(fields.phone.trim())) {
        found["phone"] =
          "Use digits, spaces, and + ( ) - . only, from 7 to 30 characters.";
      }
    }
    if (
      showNote &&
      form.standard.coverNote === "REQUIRED" &&
      !fields.note.trim()
    )
      found["note"] = "Write a few lines here.";

    if (showCv && form.standard.cv === "REQUIRED" && !cv)
      found["cv"] = "Attach your CV.";

    const answerProblems = validateAnswers(questions, answers);
    for (const [id, message] of Object.entries(answerProblems))
      found[questionDomId({ id })] = message;

    if (form.consent.enabled && !consent)
      found["consent"] = "Tick the box to say you agree, then send.";

    /* A file still on its way is not attached yet. */
    if (uploading["cv"])
      found["cv"] = "Wait for this file to finish uploading.";
    for (const question of questions) {
      const key = questionDomId(question);
      if (uploading[key])
        found[key] = "Wait for this file to finish uploading.";
    }
    return found;
  }

  /** The labels the summary quotes, in the order the form shows them. */
  const labelFor = (key: string): string => {
    const standard: Record<string, string> = {
      firstName: "First name",
      lastName: "Surname",
      email: "Email",
      phone: "Phone",
      note: "Your note",
      cv: "Your CV",
      consent: "Privacy notice",
    };
    if (standard[key]) return standard[key];
    return questions.find((q) => questionDomId(q) === key)?.label ?? key;
  };

  /** Where to put focus for a problem with this key. */
  const focusTarget = (key: string): HTMLElement | null => {
    const direct = document.getElementById(key);
    if (direct && direct.tagName !== "DIV") return direct;
    return (
      document.getElementById(`${key}-input`) ??
      document.getElementById(`${key}-first`) ??
      direct
    );
  };

  const orderedKeys = (): string[] => [
    "firstName",
    "lastName",
    "email",
    ...(showPhone ? ["phone"] : []),
    ...(showCv ? ["cv"] : []),
    ...questions.map((q) => questionDomId(q)),
    ...(showNote ? ["note"] : []),
    "consent",
  ];

  function present(found: Errors) {
    setErrors(found);
    const list = orderedKeys()
      .filter((key) => key in found)
      .map((key) => ({ id: key, message: found[key] as string }));
    /* Anything the API named that the form does not draw still gets a line. */
    for (const [key, message] of Object.entries(found))
      if (!list.some((entry) => entry.id === key))
        list.push({ id: key, message });
    setSummary(list);
    setFocusSummary((n) => n + 1);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const found = validate();
    if (Object.keys(found).length > 0) {
      present(found);
      return;
    }

    /* The check is on and has not been done. Say so beside the check itself and
       do not spend a request — and a one-time token — finding out. */
    if (needsCheck && !checkToken) {
      setCheckMissing(true);
      return;
    }

    setBusy(true);
    setRefusal(null);
    setCheckMissing(false);
    setSummary([]);
    const result = await client.submit({
      firstName: fields.firstName,
      lastName: fields.lastName,
      email: fields.email,
      phone: showPhone ? fields.phone : "",
      coverNote: showNote ? fields.note : "",
      cv: showCv ? cv : null,
      answers: Object.fromEntries(
        questions.map((question) => [
          question.id,
          answers[question.id] ?? null,
        ]),
      ),
      consent: form.consent.enabled
        ? { text: form.consent.text, ref: form.consent.ref }
        : null,
      src,
      utm,
      extra: {
        [HONEYPOT_FIELD]: trap,
        ...(needsCheck && checkToken ? { captchaToken: checkToken } : {}),
      },
    });
    setBusy(false);

    if (result.ok) {
      setSent({ result: result.value, email: fields.email.trim() });
      return;
    }

    /* A token is spent once, whether the API accepted it or not. */
    if (needsCheck) setCheckReset((n) => n + 1);
    if (result.kind === "captcha") setNeedsCheck(true);

    /* The API's own sentence, kept as written: it was written about this person's
       situation and is worth more than anything this component could compose. */
    setRefusal({ kind: result.kind, message: result.message });
    const fieldErrors: Errors = {};
    for (const [field, message] of Object.entries(result.fields)) {
      fieldErrors[serverFieldKey(field, questions)] = message;
    }
    if (Object.keys(fieldErrors).length > 0) present(fieldErrors);
    else setErrors({});
  }

  function startAgain() {
    setSent(null);
    setFields({ firstName: "", lastName: "", email: "", phone: "", note: "" });
    setAnswers({});
    setCv(null);
    setConsent(false);
    setErrors({});
    setSummary([]);
    setRefusal(null);
  }

  if (sent) {
    return (
      <Sent
        result={sent.result}
        email={sent.email}
        company={company}
        client={client}
        onAgain={startAgain}
      />
    );
  }

  const cvHelp =
    form.standard.cv === "REQUIRED"
      ? "We need this to look at your application."
      : undefined;

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label={`Apply for ${roleTitle}`}
      className="rounded-3xl border border-sand-line bg-white/70 p-7 sm:p-9"
    >
      <h2 className="text-h3 text-slate">Apply for this role</h2>
      <p className="mt-2 text-body leading-relaxed">
        {roleTitle} at {company}.
        {questions.length === 0 && !showCv
          ? " A few boxes and you are done."
          : ""}
      </p>

      {client.mode !== "live" && (
        <p
          data-testid="apply-mode-note"
          className="mt-4 rounded-xl bg-wash-amber p-3.5 text-body-sm leading-relaxed text-slate-soft"
        >
          {client.mode === "preview"
            ? "Preview. This is what an applicant sees. Nothing you do here is sent or saved."
            : "Demo. Try it as an applicant would. Files stay on this device and nothing is saved."}
        </p>
      )}

      {summary.length > 0 && (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="group"
          aria-labelledby="apply-errors-title"
          data-testid="apply-error-summary"
          className="mt-6 rounded-xl border border-danger bg-wash-rose p-4 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate"
        >
          <h3
            id="apply-errors-title"
            className="text-body-sm font-semibold text-slate"
          >
            {summary.length === 1
              ? "One thing needs fixing before you send"
              : `${summary.length} things need fixing before you send`}
          </h3>
          <ul className="mt-2 flex list-none flex-col gap-1">
            {summary.map((entry) => (
              <li key={entry.id} className="text-body-sm text-slate-soft">
                <a
                  href={`#${entry.id}`}
                  onClick={(event) => {
                    event.preventDefault();
                    focusTarget(entry.id)?.focus();
                  }}
                  className="font-medium text-slate underline underline-offset-2"
                >
                  {labelFor(entry.id)}
                </a>
                : {entry.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-7 flex flex-col gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            id="firstName"
            label="First name"
            required
            autoComplete="given-name"
            value={fields.firstName}
            error={errors["firstName"]}
            onChange={(value) => setField("firstName", value)}
            placeholder="Chioma"
          />
          <TextField
            id="lastName"
            label="Surname"
            required
            autoComplete="family-name"
            value={fields.lastName}
            error={errors["lastName"]}
            onChange={(value) => setField("lastName", value)}
            placeholder="Aduba"
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            id="email"
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={fields.email}
            error={errors["email"]}
            onChange={(value) => setField("email", value)}
            placeholder="you@example.com"
          />
          {showPhone && (
            <TextField
              id="phone"
              label="Phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required={form.standard.phone === "REQUIRED"}
              optional={form.standard.phone !== "REQUIRED"}
              value={fields.phone}
              error={errors["phone"]}
              onChange={(value) => setField("phone", value)}
              placeholder="0803 000 0000"
            />
          )}
        </div>

        {showCv && (
          <FileUpload
            id="cv"
            label="Your CV"
            help={cvHelp}
            required={form.standard.cv === "REQUIRED"}
            optional={form.standard.cv !== "REQUIRED"}
            profile="document"
            value={cv}
            onChange={(file) => {
              setCv(file);
              clearError("cv");
            }}
            onBusy={setBusyFor("cv")}
            error={errors["cv"]}
            client={client}
          />
        )}

        {questions.map((question) => (
          <QuestionField
            key={question.id}
            question={question}
            value={answers[question.id]}
            onChange={(value) => setAnswer(question.id, value)}
            error={errors[questionDomId(question)]}
            client={client}
            onBusy={setBusyFor(questionDomId(question))}
          />
        ))}

        {showNote && (
          <div>
            <label
              htmlFor="note"
              className="block text-body-sm font-medium text-slate"
            >
              {showCv
                ? "Anything else you want us to know"
                : "Your CV, or anything else"}
              {form.standard.coverNote === "REQUIRED" ? (
                <RequiredMark />
              ) : (
                <span className="ml-0.5 text-meta font-normal text-slate-muted">
                  {" "}
                  Optional
                </span>
              )}
            </label>
            {!showCv && (
              <p
                id="note-help"
                className="mt-1.5 text-meta leading-relaxed text-slate-muted"
              >
                {CV_LINE}
              </p>
            )}
            <textarea
              id="note"
              name="note"
              rows={4}
              value={fields.note}
              aria-invalid={Boolean(errors["note"])}
              aria-describedby={describedBy(
                !showCv && "note-help",
                errors["note"] && "note-error",
              )}
              onChange={(event) => setField("note", event.currentTarget.value)}
              placeholder={
                showCv
                  ? "I am on one month's notice."
                  : "Link to my CV: …\nI am on one month's notice."
              }
              className={cn(
                "mt-2 w-full resize-y rounded-xl border bg-white px-4 py-3 text-slate placeholder:text-slate-muted/60 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate",
                errors["note"] ? "border-danger" : "border-sand-line",
              )}
            />
            {errors["note"] && (
              <FieldError id="note-error">{errors["note"]}</FieldError>
            )}
          </div>
        )}

        {form.consent.enabled && (
          <div>
            <label
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border bg-white px-4 py-3.5 text-body-sm leading-relaxed text-slate-soft",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-slate",
                errors["consent"] ? "border-danger" : "border-sand-line",
              )}
            >
              <input
                id="consent"
                name="consent"
                type="checkbox"
                checked={consent}
                aria-invalid={Boolean(errors["consent"])}
                aria-describedby={
                  errors["consent"] ? "consent-error" : undefined
                }
                onChange={(event) => {
                  setConsent(event.currentTarget.checked);
                  clearError("consent");
                }}
                className="mt-1 size-4 shrink-0 accent-slate"
              />
              <span>
                <span
                  data-testid="consent-text"
                  className="whitespace-pre-line"
                >
                  {form.consent.text}
                </span>
                <RequiredMark />
                {form.consent.url && (
                  <>
                    {" "}
                    <a
                      href={form.consent.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-slate underline underline-offset-2"
                    >
                      Read the full policy
                    </a>
                  </>
                )}
              </span>
            </label>
            {errors["consent"] && (
              <FieldError id="consent-error">{errors["consent"]}</FieldError>
            )}
          </div>
        )}

        {/* The honeypot. Off-screen rather than `display: none`, because some
            scripts skip a field that is not rendered; `aria-hidden`, out of the
            tab order and told not to autofill, so no person and no password
            manager ever lands in it. */}
        <div
          aria-hidden="true"
          data-testid="apply-honeypot"
          style={{
            position: "absolute",
            left: "-10000px",
            top: "auto",
            width: "1px",
            height: "1px",
            overflow: "hidden",
          }}
        >
          <label htmlFor="apply-contact-preference">Leave this box empty</label>
          <input
            id="apply-contact-preference"
            type="text"
            name={HONEYPOT_FIELD}
            value={trap}
            onChange={(event) => setTrap(event.currentTarget.value)}
            tabIndex={-1}
            autoComplete="off"
            data-lpignore="true"
            data-1p-ignore="true"
            data-bwignore="true"
            data-form-type="other"
          />
        </div>

        {needsCheck && (
          <div>
            <CaptchaSlot
              siteKey={CAPTCHA_SITE_KEY}
              onToken={(token) => {
                setCheckToken(token);
                if (token) setCheckMissing(false);
              }}
              resetKey={checkReset}
            />
            {checkMissing && (
              <p role="alert" className="mt-2 text-meta text-danger-text">
                Complete the check above before you send.
              </p>
            )}
          </div>
        )}

        {refusal && (
          <p
            role="alert"
            data-kind={refusal.kind}
            className="rounded-xl bg-wash-rose p-3.5 text-body-sm leading-relaxed text-slate-soft"
          >
            {refusal.message}
          </p>
        )}

        <PillButton
          type="submit"
          variant="solid"
          size="lg"
          disabled={busy}
          arrow={!busy}
          className="mt-1 w-full justify-center"
        >
          {busy ? "Sending…" : "Send application"}
        </PillButton>

        {anyUploading && (
          <p className="text-center text-meta text-slate-muted" role="status">
            A file is still uploading. It has to finish before you send.
          </p>
        )}

        <p className="text-center text-meta leading-relaxed text-slate-muted">
          {company} sees what you send here. It is not shared with anyone else
          and it is not added to a mailing list.
        </p>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Where the API's name for a field becomes this form's id for it.
 *
 * The API names a refused answer by its question — `answers.q_1a2b3c` — and the
 * form's boxes carry `q-` ids, so the two have to meet here. Anything it does not
 * recognise is kept under its own name and still shown in the summary.
 */
export function serverFieldKey(
  field: string,
  questions: readonly { id: string }[],
): string {
  const named = /^answers(?:\.|\[)(.+?)\]?(?:\.value)?$/.exec(field);
  if (named?.[1]) {
    const id = named[1];
    if (questions.some((question) => question.id === id))
      return questionDomId({ id });
  }
  if (field === "coverNote") return "note";
  if (field === "cvKey") return "cv";
  if (field === "consent" || field.startsWith("consent.")) return "consent";
  return field;
}

function Sent({
  result,
  email,
  company,
  client,
  onAgain,
}: {
  result: ApplyResult;
  email: string;
  company: string;
  client: ApplyClient;
  onAgain: () => void;
}) {
  const heading = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);

  const real = client.mode === "live";
  const queued = real && confirmationExpected(result);

  return (
    <div
      role="status"
      className="rounded-3xl border border-sand-line bg-white/70 p-10 text-center"
    >
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-success">
        <Check
          aria-hidden="true"
          className="size-6 text-slate"
          strokeWidth={3}
        />
      </span>
      <h2
        ref={heading}
        tabIndex={-1}
        className="mt-6 text-h3 text-slate focus:outline-none"
      >
        {real
          ? "Application sent"
          : client.mode === "preview"
            ? "This is what they see after sending"
            : "Demo: nothing was sent"}
      </h2>
      <p className="mx-auto mt-3 max-w-sm text-body leading-relaxed">
        {result.note}
      </p>

      {real && result.reference && (
        <p className="mx-auto mt-4 max-w-sm text-body-sm leading-relaxed text-slate-soft">
          Your reference is{" "}
          <strong
            data-testid="apply-reference"
            className="tabular font-semibold text-slate"
          >
            {result.reference}
          </strong>
          . Quote it if you write to {company}.
        </p>
      )}

      {real &&
        (queued ? (
          <p className="mx-auto mt-4 max-w-sm text-body-sm leading-relaxed text-slate-muted">
            A confirmation email should reach {email} in a few minutes. If it
            does not, look in your junk folder. {company} will contact you
            directly if they want to take it further.
          </p>
        ) : (
          <p className="mx-auto mt-4 max-w-sm text-body-sm leading-relaxed text-slate-muted">
            We have not sent a confirmation email for this one, so there is
            nothing to wait for in your inbox. Your application is saved under{" "}
            {email}, and {company} will contact you directly if they want to
            take it further.
          </p>
        ))}

      {!real && (
        <div className="mt-6">
          <button
            type="button"
            onClick={onAgain}
            className="rounded-md px-2 py-1 text-body-sm font-medium text-slate underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate"
          >
            Fill it in again
          </button>
        </div>
      )}
    </div>
  );
}
