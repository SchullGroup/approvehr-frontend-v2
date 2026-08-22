"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { PillButton } from "@/components/marketing/pill";
import { MODULES } from "@/lib/marketing/modules";

type Errors = Partial<Record<"name" | "email" | "company" | "headcount", string>>;

const HEADCOUNTS = ["1–25", "26–100", "101–500", "501–2,000", "2,000+"];

const PAYROLL_TODAY = [
  "Spreadsheets",
  "An accountant or consultant",
  "Another HR platform",
  "Accounting software",
  "Nothing formal yet",
];

/**
 * Demo request. Validates on submit rather than on every keystroke, so the
 * form is not scolding someone halfway through typing their email. Errors
 * clear as soon as the field is corrected.
 */
export function DemoForm() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [interests, setInterests] = useState<string[]>(["payroll"]);
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    phone: "",
    headcount: "",
    payrollToday: "",
    notes: "",
  });

  const set = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  function validate(): Errors {
    const next: Errors = {};
    if (!form.name.trim()) next.name = "Tell us who to address the call to.";
    if (!form.email.trim()) next.email = "We need an email to send the invite.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email))
      next.email = "That does not look like a working email address.";
    if (!form.company.trim()) next.company = "Which company is this for?";
    if (!form.headcount) next.headcount = "Pick the closest range.";
    return next;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      /* Move focus to the first problem so a keyboard user is not hunting. */
      document.getElementById(Object.keys(found)[0])?.focus();
      return;
    }
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      setSent(true);
    }, 700);
  }

  if (sent) {
    return (
      <div className="rounded-3xl border border-sand-line bg-white/70 p-10 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-success">
          <Check aria-hidden="true" className="size-6 text-slate" strokeWidth={3} />
        </span>
        <h2 className="mt-6 text-h3 text-slate">Request received</h2>
        <p className="mx-auto mt-3 max-w-sm text-body leading-relaxed text-slate-muted">
          We will email {form.email} within one working day with two or three
          times. If none suit, reply with what does.
        </p>
        <p className="mt-8 rounded-xl bg-wash-amber p-3.5 text-meta leading-relaxed text-slate-soft">
          This is a prototype — the form is not yet wired to a backend, so
          nothing was actually sent.
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
      <div className="flex flex-col gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            id="name"
            label="Your name"
            required
            value={form.name}
            error={errors.name}
            onChange={(v) => set("name", v)}
            placeholder="Folake Adisa"
          />
          <TextField
            id="company"
            label="Company"
            required
            value={form.company}
            error={errors.company}
            onChange={(v) => set("company", v)}
            placeholder="Schull Technologies"
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            id="email"
            label="Work email"
            type="email"
            required
            value={form.email}
            error={errors.email}
            onChange={(v) => set("email", v)}
            placeholder="you@company.com"
          />
          <TextField
            id="phone"
            label="Phone"
            optional
            value={form.phone}
            onChange={(v) => set("phone", v)}
            placeholder="+234 800 000 0000"
          />
        </div>

        {/* Headcount */}
        <fieldset>
          <legend className="text-body-sm font-medium text-slate">
            How many people do you pay?
            <span aria-hidden="true" className="ml-0.5 text-danger-text">
              *
            </span>
          </legend>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {HEADCOUNTS.map((h) => (
              <Chip
                key={h}
                selected={form.headcount === h}
                onClick={() => set("headcount", h)}
              >
                {h}
              </Chip>
            ))}
          </div>
          {errors.headcount && <FieldError>{errors.headcount}</FieldError>}
          {/* Anchor for focus-on-error. */}
          <span id="headcount" tabIndex={-1} className="sr-only-focusable" />
        </fieldset>

        {/* How they run payroll now */}
        <fieldset>
          <legend className="text-body-sm font-medium text-slate">
            How do you run payroll today?
          </legend>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {PAYROLL_TODAY.map((p) => (
              <Chip
                key={p}
                selected={form.payrollToday === p}
                onClick={() => set("payrollToday", p)}
              >
                {p}
              </Chip>
            ))}
          </div>
        </fieldset>

        {/* Interests */}
        <fieldset>
          <legend className="text-body-sm font-medium text-slate">
            What should we focus the demo on?
          </legend>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {MODULES.map((m) => (
              <Chip
                key={m.id}
                selected={interests.includes(m.id)}
                onClick={() =>
                  setInterests((list) =>
                    list.includes(m.id)
                      ? list.filter((x) => x !== m.id)
                      : [...list, m.id],
                  )
                }
              >
                {m.label}
              </Chip>
            ))}
          </div>
        </fieldset>

        <div>
          <label
            htmlFor="notes"
            className="block text-body-sm font-medium text-slate"
          >
            Anything specific you want to see?
            <span className="ml-1.5 text-meta font-normal text-slate-muted">
              Optional
            </span>
          </label>
          <textarea
            id="notes"
            rows={3}
            value={form.notes}
            onChange={(e) => set("notes", e.currentTarget.value)}
            placeholder="We have staff across three states and file PAYE separately for each."
            className="mt-2 w-full resize-y rounded-xl border border-sand-line bg-white px-4 py-3 text-body text-slate placeholder:text-slate-muted/60 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate"
          />
        </div>

        <PillButton
          type="submit"
          variant="solid"
          size="lg"
          disabled={busy}
          arrow={!busy}
          className="mt-1 w-full justify-center"
        >
          {busy ? "Sending…" : "Request a demo"}
        </PillButton>

        <p className="text-center text-meta leading-relaxed text-slate-muted">
          By submitting you agree we may contact you about this request. We do
          not add you to a mailing list.
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
  onChange: (v: string) => void;
  error?: string;
  required?: boolean;
  optional?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-body-sm font-medium text-slate"
      >
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-danger-text">
            *
          </span>
        )}
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
        onChange={(e) => onChange(e.currentTarget.value)}
        className={cn(
          "mt-2 h-11 w-full rounded-xl border bg-white px-4 text-body text-slate",
          "placeholder:text-slate-muted/60 focus:outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate",
          error ? "border-danger" : "border-sand-line",
        )}
      />
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </div>
  );
}

function FieldError({
  id,
  children,
}: {
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <p id={id} className="mt-1.5 text-meta text-danger-text">
      {children}
    </p>
  );
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3.5 py-2 text-meta transition-all duration-200 ease-[var(--ease-out-soft)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate",
        selected
          ? "border-slate bg-slate text-white"
          : "border-sand-line bg-white text-slate-soft hover:border-slate/40",
      )}
    >
      {children}
    </button>
  );
}
