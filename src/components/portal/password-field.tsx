"use client";

import { useState } from "react";
import { Check, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { Field, IconButton, Input } from "@/components/ui";
import { PASSWORD_MIN, passwordRules } from "@/lib/api/account";

/**
 * The password box, used by register, reset, accept-invite and the
 * authenticated change-password form.
 *
 * ## The requirements appear as you meet them
 *
 * Nothing is listed before the field is touched. A paragraph of rules above an
 * empty box is read by nobody and obeyed by accident; a row that ticks as you
 * type is read by everybody. So: focus the field and the one real requirement
 * appears, unmet; reach twelve characters and it goes green. The correction
 * ("not a commonly used password") stays hidden until it is actually needed,
 * because a rule you are not breaking is noise.
 *
 * ## `strict` — the same checklist, a few more rows
 *
 * Set for an account that can see pay, run payroll, or hand out access —
 * `requiresStrongPassword` (`lib/permissions.ts` for a signed-in caller; the
 * API's own `GET /auth/reset-password` / `GET /auth/accept-invite` preview for
 * the two flows where nobody is signed in yet) decides which accounts that is.
 * No banner explaining why there are more rows: the rows themselves are the
 * explanation, the same way "12 characters or more" needs no paragraph above
 * it, and this codebase has already relearned once this session that a second
 * sentence saying what the row beside it already says is clutter, not clarity.
 *
 * ## Show, rather than confirm
 *
 * There is no "confirm password" field. A reveal button does the same job — it
 * stops the typo — while asking for one thing instead of two, and it is the only
 * way somebody on a phone can check a twelve-character passphrase at all. The
 * button starts hidden-by-default and is a real `<button type="button">`, so it
 * never submits the form.
 */
export function PasswordField({
  label,
  value,
  onChange,
  error,
  autoComplete,
  onEnter,
  strict = false,
  showRules = true,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  error?: string | undefined;
  autoComplete: "new-password" | "current-password";
  onEnter?: () => void;
  /** True for an account that can see pay, run payroll, or hand out access. */
  strict?: boolean;
  /**
   * Off for a password that already exists — signing in, or the "current
   * password" half of a change — where a checklist against today's rules
   * would flag a perfectly valid older password as failing them. On by
   * default: every other caller is choosing a new one.
   *
   * Orthogonal to `strict`, which decides *which* rules apply rather than
   * whether they are drawn: a privileged account changing its password wants
   * the longer checklist on the new field and none at all on the current one.
   */
  showRules?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [touched, setTouched] = useState(false);

  const rules = passwordRules(value, strict);
  const shown = rules.filter(
    (rule) => rule.showWhen === "always" || !rule.met,
  );
  const remaining = Math.max(0, PASSWORD_MIN - value.length);

  return (
    <Field label={label} required error={error}>
      <div className="relative">
        <Input
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          className="pr-11"
          value={value}
          onFocus={() => setTouched(true)}
          onChange={(e) => {
            const next = e.target.value;
            setTouched(true);
            onChange(next);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && onEnter) onEnter();
          }}
        />
        <span className="absolute right-1 top-1/2 -translate-y-1/2">
          <IconButton
            type="button"
            size="sm"
            label={visible ? "Hide password" : "Show password"}
            onClick={() => setVisible((current) => !current)}
          >
            {visible ? (
              <EyeOff aria-hidden="true" className="size-4" />
            ) : (
              <Eye aria-hidden="true" className="size-4" />
            )}
          </IconButton>
        </span>
      </div>

      {showRules && touched && (
        <>
          {/* One plain sentence, not a rule — the checklist below already
              states the rules. A layperson does not necessarily know that
              length is what actually matters, rather than the symbol/number
              juggling most sites still demand.

              It has to say something different under `strict`, and this is not
              a nicety. "No symbols or numbers required" is true of the base
              rules and false the moment the four class rules are added — and
              the screen it was reaching first was **register**, which is
              always strict (it creates the company's Owner). So the first
              thing a new customer read was an instruction to type three
              ordinary words, followed by a refusal for doing exactly that.

              Still no banner explaining *why* there are more rows — the rows
              are their own explanation, as the note at the top of this file
              says. What changes is only that the advice matches the rules
              being enforced beneath it. */}
          <p className="mt-1.5 text-body-sm leading-relaxed text-muted">
            {strict ? (
              <>
                Longer beats complicated: a phrase like three ordinary words,
                with a capital, a number and a symbol, is easier to remember
                and harder to guess than a short jumble.
              </>
            ) : (
              <>
                Longer beats complicated: a short phrase like three ordinary
                words is easy to remember and hard to guess. No symbols or
                numbers required.
              </>
            )}
          </p>
          <ul aria-live="polite" className="mt-1.5 flex flex-col gap-1.5">
            {shown.map((rule) => (
              <li
                key={rule.id}
                className="flex items-center gap-2 text-body-sm"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                    rule.met
                      ? "border-success-strong bg-success text-fill-strong"
                      : "border-control-line text-transparent",
                  )}
                >
                  <Check className="size-3" strokeWidth={3} />
                </span>
                <span className={rule.met ? "text-body" : "text-muted"}>
                  {rule.label}
                </span>
                <span className="sr-only">{rule.met ? "done" : "not yet"}</span>
                {rule.id === "length" && !rule.met && value.length > 0 && (
                  <span aria-hidden="true" className="tabular text-muted">
                    {remaining} to go
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </Field>
  );
}
