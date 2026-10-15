"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { CaptchaSlot } from "@/components/marketing/captcha-slot";
import { PillButton } from "@/components/marketing/pill";
import {
  CV_LINE,
  HONEYPOT_FIELD,
  apply,
  type ApplyFailureKind,
  type ApplyResult,
} from "@/lib/marketing/careers";

/**
 * Apply.
 *
 * ## Five boxes, and four of them are one line
 *
 * Every extra field costs applications, and a careers page that loses a good
 * candidate to a twelve-field form has failed at the only thing it does. So:
 * name, email, phone, one note. No account, no covering letter word count, no
 * "how did you hear about us" — the API accepts all of that and none of it is
 * worth the drop-off.
 *
 * ## There is no CV upload, and this form does not pretend otherwise
 *
 * This form does not attach a file to the application yet. A drop zone here
 * would take somebody's CV and lose it — they would believe it arrived, and the
 * hiring manager would find out the day before the interview. So one line says
 * the truth and the note field takes a link instead, which works today.
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
 * says it is needed, either up front (`captchaRequired`) or by refusing an
 * application with `captcha_required`. See `captcha-slot.tsx`.
 *
 * ## Validation happens on submit
 *
 * Not on every keystroke: a form that scolds you halfway through typing your
 * email address is a form people abandon. Errors clear as soon as the field is
 * corrected, and focus moves to the first problem so a keyboard user is not
 * hunting for it.
 */

type Field = "firstName" | "lastName" | "email" | "phone";
type Errors = Partial<Record<Field, string>>;

/** Public by design — it identifies this site to the challenge provider and
 *  grants nothing. The matching secret lives only on the API. */
const CAPTCHA_SITE_KEY =
  process.env["NEXT_PUBLIC_TURNSTILE_SITE_KEY"]?.trim() || null;

export function ApplyForm({
  org,
  roleSlug,
  roleTitle,
  company,
  captchaRequired = false,
}: {
  org: string;
  roleSlug: string;
  roleTitle: string;
  company: string;
  /** True when the API said, with the advert, that the check is on. */
  captchaRequired?: boolean;
}) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    note: "",
  });
  /* The honeypot. Empty for every person who ever uses this form. */
  const [trap, setTrap] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [refusal, setRefusal] = useState<{
    kind: ApplyFailureKind;
    message: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<ApplyResult | null>(null);
  const [needsCheck, setNeedsCheck] = useState(captchaRequired);
  const [checkToken, setCheckToken] = useState<string | null>(null);
  const [checkReset, setCheckReset] = useState(0);
  const [checkMissing, setCheckMissing] = useState(false);

  const set = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setRefusal(null);
  };

  function validate(): Errors {
    const found: Errors = {};
    if (!form.firstName.trim()) found.firstName = "Enter your first name.";
    if (!form.lastName.trim()) found.lastName = "Enter your surname.";
    if (!form.email.trim()) found.email = "We need an email to reply to.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim()))
      found.email = "That does not look like a working email address.";
    return found;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) {
      document.getElementById(first)?.focus();
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
    const result = await apply(
      org,
      roleSlug,
      {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
        ...(form.note.trim() ? { coverNote: form.note.trim() } : {}),
      },
      {
        [HONEYPOT_FIELD]: trap,
        ...(needsCheck && checkToken ? { captchaToken: checkToken } : {}),
      },
    );
    setBusy(false);

    if (result.ok) {
      setSent(result.value);
      return;
    }

    /* A token is spent once, whether the API accepted it or not. */
    if (needsCheck) setCheckReset((n) => n + 1);
    if (result.kind === "captcha") setNeedsCheck(true);

    /* The API's own sentence, kept as written. "You have already applied, we
       received it on 14 August" is worth far more to the person reading it than
       anything this component could compose. */
    setRefusal({ kind: result.kind, message: result.message });
    const fieldErrors: Errors = {};
    for (const [field, message] of Object.entries(result.fields)) {
      if (
        field === "firstName" ||
        field === "lastName" ||
        field === "email" ||
        field === "phone"
      )
        fieldErrors[field] = message;
    }
    setErrors(fieldErrors);
  }

  if (sent) {
    return (
      <div className="rounded-3xl border border-sand-line bg-white/70 p-10 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-success">
          <Check
            aria-hidden="true"
            className="size-6 text-slate"
            strokeWidth={3}
          />
        </span>
        <h2 className="mt-6 text-h3 text-slate">Application sent</h2>
        <p className="mx-auto mt-3 max-w-sm text-body leading-relaxed">
          {sent.note}
        </p>
        <p className="mx-auto mt-4 max-w-sm text-body-sm leading-relaxed text-slate-muted">
          We do not send a confirmation email yet, so there is nothing to wait
          for in your inbox. Your application is saved under {form.email}, and{" "}
          {company} will contact you directly if they want to take it further.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="rounded-3xl border border-sand-line bg-white/70 p-7 sm:p-9"
    >
      <h2 className="text-h3 text-slate">Apply for this role</h2>
      <p className="mt-2 text-body leading-relaxed">
        {roleTitle} at {company}. Four boxes and you are done.
      </p>

      <div className="mt-7 flex flex-col gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            id="firstName"
            label="First name"
            required
            value={form.firstName}
            {...(errors.firstName ? { error: errors.firstName } : {})}
            onChange={(value) => set("firstName", value)}
            placeholder="Chioma"
          />
          <TextField
            id="lastName"
            label="Surname"
            required
            value={form.lastName}
            {...(errors.lastName ? { error: errors.lastName } : {})}
            onChange={(value) => set("lastName", value)}
            placeholder="Aduba"
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            id="email"
            label="Email"
            type="email"
            required
            value={form.email}
            {...(errors.email ? { error: errors.email } : {})}
            onChange={(value) => set("email", value)}
            placeholder="you@example.com"
          />
          <TextField
            id="phone"
            label="Phone"
            optional
            value={form.phone}
            {...(errors.phone ? { error: errors.phone } : {})}
            onChange={(value) => set("phone", value)}
            placeholder="0803 000 0000"
          />
        </div>

        <div>
          <label
            htmlFor="note"
            className="block text-body-sm font-medium text-slate"
          >
            Your CV, or anything else
            <span className="ml-1.5 text-meta font-normal text-slate-muted">
              Optional
            </span>
          </label>
          <p className="mt-1.5 text-meta leading-relaxed text-slate-muted">
            {CV_LINE}
          </p>
          <textarea
            id="note"
            rows={4}
            value={form.note}
            onChange={(event) => set("note", event.currentTarget.value)}
            placeholder="Link to my CV: …&#10;I am on one month's notice."
            className="mt-2 w-full resize-y rounded-xl border border-sand-line bg-white px-4 py-3 text-slate placeholder:text-slate-muted/60 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate"
          />
        </div>

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

        <p className="text-center text-meta leading-relaxed text-slate-muted">
          {company} sees what you send here. It is not shared with anyone else
          and it is not added to a mailing list.
        </p>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  required,
  optional,
  type = "text",
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  optional?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-body-sm font-medium text-slate">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-danger-text">
            *
          </span>
        )}
        {required && <span className="sr-only-focusable"> required</span>}
        {optional && (
          <span className="ml-1.5 text-meta font-normal text-slate-muted">
            Optional
          </span>
        )}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        placeholder={placeholder}
        onChange={(event) => onChange(event.currentTarget.value)}
        className={cn(
          "mt-2 h-11 w-full rounded-xl border bg-white px-4 text-slate",
          "placeholder:text-slate-muted/60 focus:outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate",
          error ? "border-danger" : "border-sand-line",
        )}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-meta text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
