"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Info, Loader2, WifiOff } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  Field,
  Input,
  Spinner,
} from "@/components/ui";
import { AuthShell } from "@/components/portal/auth-shell";
import { PasswordField } from "@/components/portal/password-field";
import { RoleBadge } from "./role-badge";
import { ApiError } from "@/lib/api/client";
import { TwoFactorStep } from "./two-factor-step";
import {
  type TwoFactorChallengeState,
  signInOptions,
  useApiReachable,
  useSession,
} from "@/lib/store/session";
import { fullName } from "@/lib/types";

/**
 * The gate in front of the signed-in app.
 *
 * Offers whichever sign-in the environment actually supports, and says which one
 * it is offering. When the API answers, that is a real password sign-in against
 * a real session. When it does not, a **development** build offers the demo path
 * — a seeded employee, no password — because this product gets shown on laptops
 * in rooms with no database.
 *
 * A production build has no such path. With no API there is nothing to sign in
 * to, and that is what the screen says: `Unreachable`, below, with a retry. The
 * alternative would be opening a session against invented local data and
 * labelling it, which is what the demo badges used to do — and the owner's call
 * was that no such artifact ships. So the mode went, and the badges with it.
 *
 * The one thing this screen must never do is look connected when it is not.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isSignedIn } = useSession();

  /* Nothing at all while the session is being restored. Rendering the sign-in
     screen here would flash it at an already-signed-in user on every load,
     which reads as a bug even though it lasts one microtask. */
  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas">
        <Spinner />
        <span className="sr-only">Loading your session</span>
      </div>
    );
  }

  if (!isSignedIn) return <SignIn />;

  return <>{children}</>;
}

/* -------------------------------------------------------------------------- */

function SignIn() {
  const reachable = useApiReachable();
  const { signIn, completeTwoFactor, signInOffline } = useSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  /** Set when the password was right and a second factor is due. */
  const [challenge, setChallenge] = useState<TwoFactorChallengeState | null>(
    null,
  );

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const outcome = await signIn(email, password);
      /* A challenge is the next step, not a failure — the screen swaps to a
         code field. Nothing is signed in until the code is verified, which is
         why the store returns this rather than opening a half-signed session. */
      if (outcome.challenge) setChallenge(outcome.challenge);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, "unknown", "Something went wrong. Try again."),
      );
    } finally {
      setBusy(false);
    }
  }

  /* The password step is over. Rendering the form underneath as well would let
     somebody re-submit a password while a challenge is open, which mints a
     second challenge and quietly kills the code they are already typing. */
  if (challenge) {
    return (
      <TwoFactorStep
        challenge={challenge}
        onCancel={() => setChallenge(null)}
        onVerify={completeTwoFactor}
      />
    );
  }

  return (
    <AuthShell>
      <div className="flex items-center gap-2.5">
        <h1 className="text-h2 text-ink">Sign in</h1>
        <ConnectionBadge reachable={reachable} />
      </div>

      {reachable === null && (
        <p className="mt-4 flex items-center gap-2 text-body-sm text-muted">
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          Checking whether the API is running…
        </p>
      )}

      {reachable === true && (
        <>
          <p className="mt-2 text-body leading-relaxed">
            Sign in with your work email. Your role decides what you can see and
            do.
          </p>

          {error && (
            <Callout
              tone="danger"
              title={
                error.code === "rate_limited"
                  ? "Too many attempts"
                  : "That did not work"
              }
              className="mt-5"
            >
              {error.message}
            </Callout>
          )}

          <div className="mt-6 flex flex-col gap-4">
            <Field
              label="Work email"
              required
              error={error?.messageFor("email")}
            >
              <Input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => {
                  const v = e.target.value;
                  setEmail(v);
                }}
              />
            </Field>
            <PasswordField
              label="Password"
              autoComplete="current-password"
              showRules={false}
              value={password}
              onChange={setPassword}
              error={error?.messageFor("password")}
              onEnter={() => {
                if (email && password && !busy) void submit();
              }}
            />

            {/* The way out of the one problem this screen exists to have.
                ---------------------------------------------------------
                `/forgot-password` and `/reset-password` were both built and
                nothing linked to either. The only references anywhere were
                from the reset screen back to the forgot screen — a loop you
                could only enter if you were already inside it — so somebody
                who could not remember their password had no route at all.

                Under the field rather than beside the label: this is the
                thing you look for *after* typing the wrong password, which
                is the moment your eye is at the bottom of the form. */}
            <Link
              href="/forgot-password"
              className="-mt-1 self-start text-body-sm text-muted underline-offset-4 hover:text-accent-text hover:underline"
            >
              Forgot your password?
            </Link>

            <Button
              variant="accent"
              disabled={!email || !password || busy}
              onClick={() => void submit()}
            >
              {busy ? "Signing in…" : "Sign in"}
              {!busy && <ArrowRight aria-hidden="true" className="size-4" />}
            </Button>
          </div>

          {/* The seeded credentials, shown because this is a development
                build talking to a development database. It would be
                indefensible in production, which is why it is behind the build
                flag rather than behind a sentence saying so. */}
          {DEMO_ENABLED && (
            <Card className="mt-8">
              <CardBody className="flex gap-3">
                <Info
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-faint"
                />
                <div className="text-body-sm leading-relaxed text-muted">
                  <p className="font-medium text-ink">
                    Development seed accounts
                  </p>
                  <p className="mt-1">
                    <code className="text-ink">grace.effiong@schull.io</code>{" "}
                    (payroll analyst),{" "}
                    <code className="text-ink">amara.nwachukwu@schull.io</code>{" "}
                    (administrator), and any other{" "}
                    <code>firstname.lastname@schull.io</code> from the seed.
                    Password{" "}
                    <code className="text-ink">approvehr-dev-2026</code>.
                  </p>
                </div>
              </CardBody>
            </Card>
          )}
        </>
      )}

      {reachable === false && DEMO_ENABLED && (
        <>
          <p className="mt-2 text-body leading-relaxed">
            The API is not running, so this is the demo. Choose whose account to
            open — every screen then behaves as that person.
          </p>

          <Callout
            tone="warning"
            title="Demo mode — not connected to a server"
            className="mt-5"
          >
            There is no password and nothing is secured. Data you change stays
            in this browser and does not sync anywhere. To use the real thing,
            start the API and reload:{" "}
            <code className="text-ink">npm run dev</code> in{" "}
            <code className="text-ink">approvehr-api</code>.
          </Callout>

          <ul className="mt-7 flex flex-col gap-2">
            {signInOptions().map(({ employee, roles }) => {
              const active = selected === employee.id;
              return (
                <li key={employee.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(employee.id)}
                    aria-pressed={active}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                      active
                        ? "border-accent bg-accent-soft"
                        : "border-line bg-surface hover:border-line-strong hover:bg-canvas",
                    )}
                  >
                    <Avatar name={fullName(employee)} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-sm font-medium text-ink">
                        {fullName(employee)}
                      </span>
                      <span className="block truncate text-body-sm text-muted">
                        {employee.jobTitle} · {employee.department}
                      </span>
                    </span>
                    {/* The persona's actual seeded role. This used to read
                          "Full access" for anybody in the People department,
                          which was a guess from the org chart: it was wrong for
                          the Payroll officer, who holds a deliberately narrower
                          set, and it said nothing at all about everybody else. */}
                    <RoleBadge roles={roles} className="shrink-0" />
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button
              variant="accent"
              disabled={!selected}
              onClick={() => selected && signInOffline(selected)}
            >
              Open the demo
              <ArrowRight aria-hidden="true" className="size-4" />
            </Button>
            <p className="text-body-sm text-muted">
              {selected
                ? "You can switch accounts any time from the top right."
                : "Pick an account to continue."}
            </p>
          </div>
        </>
      )}

      {reachable === false && !DEMO_ENABLED && <Unreachable />}

      {reachable !== null && (reachable || DEMO_ENABLED) && (
        <p className="mt-8 border-t border-line pt-6 text-body-sm text-muted">
          New company?{" "}
          <Link
            href="/register"
            className="font-medium text-accent-text hover:underline underline-offset-4"
          >
            Create an account
          </Link>
        </p>
      )}
    </AuthShell>
  );
}

/**
 * Says nothing when the API is reachable — that is the ordinary case, and a
 * badge announcing it on every sign-in is a technical detail nobody asked
 * for. It still speaks up when it is *not* reachable, because that is the
 * one state that actually needs explaining, and which build this is changes
 * what to do about it: in development there is somewhere else to go, and in
 * production there is not.
 */
function ConnectionBadge({ reachable }: { reachable: boolean | null }) {
  if (reachable !== false) return null;
  return (
    <Badge tone="warning" size="sm">
      <WifiOff aria-hidden="true" className="size-3" />
      {DEMO_ENABLED ? "Demo mode" : "Cannot reach the server"}
    </Badge>
  );
}

/**
 * What a production build shows when the API does not answer.
 *
 * Not a blank screen and not a demo. There is nothing to sign in to, so the
 * screen says that, says whose problem it probably is, and offers the one
 * action that can change the answer. `useApiReachable` checks once per mount,
 * so reloading is the retry.
 */
function Unreachable() {
  return (
    <>
      <p className="mt-2 text-body leading-relaxed">
        Signing in needs the ApproveHR service, and it is not answering right
        now. Nothing you have entered has been lost, and nothing has been signed
        in.
      </p>

      <Callout tone="warning" title="What usually fixes this" className="mt-5">
        This is usually a connection on this device or a service that is
        restarting. Check your internet connection and try again in a moment; if
        it keeps happening, tell whoever administers ApproveHR for your company.
      </Callout>

      <div className="mt-7">
        <Button variant="accent" onClick={() => window.location.reload()}>
          Try again
          <ArrowRight aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </>
  );
}
