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
 * ("not a password everybody tries") stays hidden until it is actually needed,
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
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  error?: string | undefined;
  autoComplete: "new-password" | "current-password";
  onEnter?: () => void;
  /** True for an account that can see pay, run payroll, or hand out access. */
  strict?: boolean;
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

      {touched && (
        <ul aria-live="polite" className="mt-0.5 flex flex-col gap-1.5">
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
                    ? "border-success-strong bg-success text-ink"
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
      )}
    </Field>
  );
}
