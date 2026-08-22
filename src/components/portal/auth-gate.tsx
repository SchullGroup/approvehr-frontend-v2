"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Info, Loader2, Wifi, WifiOff } from "lucide-react";
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
import { Logo } from "@/components/brand/logo";
import { RoleBadge } from "./role-badge";
import { ApiError } from "@/lib/api/client";
import { signInOptions, useApiReachable, useSession } from "@/lib/store/session";
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
  const { signIn, signInOffline } = useSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
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

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5">
          <Link href="/" aria-label="ApproveHR home" className="text-ink">
            <Logo size={24} />
          </Link>
          <Link
            href="/"
            className="text-body-sm text-muted transition-colors hover:text-ink"
          >
            Back to the website
          </Link>
        </div>
      </header>

      <main
        id="main"
        className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-5 py-14"
      >
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
            <p className="mt-2 text-body leading-relaxed text-body">
              Sign in with your work email. Your role decides what you can see
              and do.
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
              <Field
                label="Password"
                required
                error={error?.messageFor("password")}
              >
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPassword(v);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && email && password && !busy) {
                      void submit();
                    }
                  }}
                />
              </Field>

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
                  <p className="font-medium text-ink">Development seed accounts</p>
                  <p className="mt-1">
                    <code className="text-ink">grace.effiong@schull.io</code>{" "}
                    (payroll analyst),{" "}
                    <code className="text-ink">amara.nwachukwu@schull.io</code>{" "}
                    (administrator), and any other{" "}
                    <code>firstname.lastname@schull.io</code> from the seed.
                    Password <code className="text-ink">approvehr-dev-2026</code>.
                  </p>
                </div>
              </CardBody>
            </Card>
            )}
          </>
        )}

        {reachable === false && DEMO_ENABLED && (
          <>
            <p className="mt-2 text-body leading-relaxed text-body">
              The API is not running, so this is the demo. Choose whose account
              to open — every screen then behaves as that person.
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
      </main>
    </div>
  );
}

function ConnectionBadge({ reachable }: { reachable: boolean | null }) {
  if (reachable === null) return null;
  if (reachable) {
    return (
      <Badge tone="success" size="sm">
        <Wifi aria-hidden="true" className="size-3" />
        API connected
      </Badge>
    );
  }
  /* The unreachable badge says which build this is, because the consequence
     differs: in development there is somewhere else to go, and in production
     there is not. */
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
      <p className="mt-2 text-body leading-relaxed text-body">
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
