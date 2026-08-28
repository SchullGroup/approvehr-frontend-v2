"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import {
  Button,
  ButtonLink,
  Callout,
  Field,
  Input,
} from "@/components/ui";
import { account, passwordAccepted } from "@/lib/api/account";
import { markSignedIn } from "@/lib/store/session";
import { PasswordField } from "@/components/portal/password-field";

/**
 * Opening an account.
 *
 * ## Five fields, and that is the product decision
 *
 * Not tax state, not RC number, not headcount, not how many people work shifts.
 * The setup wizard asks those, once somebody is inside and can see what the
 * answers are for. A signup form of fifteen questions is how a business owner
 * decides to keep using a spreadsheet, and the API's schema is nullable on every
 * one of them for exactly this reason.
 *
 * ## Nothing in this route group may call `useSession()`
 *
 * `lib/store/session.ts` restores the session on its **first** subscriber and
 * latches a module-level `hydrated` flag that never resets for the rest of the
 * tab's life. By the time anybody reaches this screen they have almost always
 * subscribed once already — the sign-in gate they came from *is* `AuthGate`'s
 * first subscribe, hydrating the store to `signed_out`. Calling `useSession()`
 * here too would read that same stale snapshot before this form ever submits.
 *
 * That is also why `account.register` storing tokens is not enough on its own:
 * `onAuthChange` only reacts to tokens *disappearing*, and a tab that already
 * hydrated will not restore from storage again on its own. `markSignedIn`
 * below is the plain, non-hook escape hatch — it writes the resolved user
 * straight into the store's cache so the next `AuthGate` mount (after
 * `router.replace`) sees a signed-in session instead of the stale one.
 */

/**
 * Where a new company lands.
 *
 * `/dashboard`, and deliberately **not** `/setup`, even though `register` returns
 * `setupCompleted: false` and every new company does need the wizard.
 * `components/portal/setup-gate.tsx` already sends anybody with setup
 * outstanding there, and it knows things this screen does not — whether the
 * account can answer the questions at all, and whether the features row has even
 * loaded. Two places deciding the same redirect is how you get one of them wrong.
 */
const AFTER_REGISTER = "/dashboard";

export function RegisterScreen() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  /* Always strict: registering always creates the company's Owner, who holds
     every permission there is — see `requiresStrongPassword` in the API's
     `permissions/service.ts`. */
  const ready =
    companyName.trim() !== "" &&
    firstName.trim() !== "" &&
    lastName.trim() !== "" &&
    email.trim() !== "" &&
    passwordAccepted(password, true);

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await account.register({
        companyName,
        firstName,
        lastName,
        email,
        password,
      });
      /* See the note above — this is what makes the next mount of `AuthGate`
         find a signed-in session instead of the one it hydrated earlier. */
      markSignedIn(result.user);
      /* `replace`, not `push`: the back button must not return somebody to a
         signup form they have already submitted. Busy stays true through the
         navigation so the button cannot be pressed twice. */
      router.replace(AFTER_REGISTER);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, "unknown", "Something went wrong. Try again."),
      );
      setBusy(false);
    }
  }

  /* An email that is already registered is not a form error, it is a fork in
     the road, so it gets a button rather than a red sentence. Everything else
     with field-level detail is shown on the field itself; only errors with no
     field to sit on become a banner. */
  const taken = error?.code === "conflict";
  const banner = error && !taken && error.fieldErrors.length === 0 ? error : null;

  return (
    <>
      <h1 className="text-h2 text-ink">Create your account</h1>

      {taken && (
        <Callout
          tone="danger"
          title="That email already has an account"
          className="mt-5"
        >
          <ButtonLink
            href="/dashboard"
            variant="secondary"
            size="sm"
            className="mt-2"
          >
            Sign in instead
          </ButtonLink>
        </Callout>
      )}

      {banner && (
        <Callout
          tone="danger"
          title={
            banner.code === "rate_limited"
              ? "Too many attempts"
              : "That did not work"
          }
          className="mt-5"
        >
          {banner.message}
        </Callout>
      )}

      <div className="mt-6 flex flex-col gap-4">
        <Field
          label="Company name"
          required
          error={error?.messageFor("companyName")}
        >
          <Input
            autoComplete="organization"
            value={companyName}
            onChange={(e) => {
              const next = e.target.value;
              setCompanyName(next);
            }}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="First name"
            required
            error={error?.messageFor("firstName")}
          >
            <Input
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => {
                const next = e.target.value;
                setFirstName(next);
              }}
            />
          </Field>
          <Field
            label="Last name"
            required
            error={error?.messageFor("lastName")}
          >
            <Input
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => {
                const next = e.target.value;
                setLastName(next);
              }}
            />
          </Field>
        </div>

        <Field label="Work email" required error={error?.messageFor("email")}>
          <Input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => {
              const next = e.target.value;
              setEmail(next);
            }}
          />
        </Field>

        <PasswordField
          label="Password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          error={error?.messageFor("password")}
          onEnter={() => void submit()}
          strict
        />

        <Button
          variant="accent"
          disabled={!ready}
          loading={busy}
          onClick={() => void submit()}
        >
          {busy ? "Creating your account…" : "Create account"}
          {!busy && <ArrowRight aria-hidden="true" className="size-4" />}
        </Button>
      </div>

      <p className="mt-7 text-body-sm text-muted">
        Already have an account?{" "}
        <Link
          href="/dashboard"
          className="font-medium text-accent-text underline underline-offset-2 transition-colors hover:text-ink"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
