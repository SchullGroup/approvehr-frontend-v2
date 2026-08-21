import Link from "next/link";
import { Logo } from "@/components/brand/logo";

/**
 * The account screens: register, verify email, forgot and reset password.
 *
 * Its own route group with its own chrome, because none of these pages has an
 * account behind it yet. No `AuthGate` — three of the four are reachable by
 * somebody who is not signed in and could not be. No `AppShell` — a sidebar of
 * modules you cannot open is furniture, not navigation.
 *
 * The frame matches `components/portal/auth-gate.tsx` line for line: same
 * header, same 14-unit bar, same centred column at `max-w-lg`. Sign-in and
 * sign-up are one flow to the person using them and reading as two different
 * products would be the wrong first impression.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
        {children}
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-5xl flex-wrap items-center gap-x-5 gap-y-1 px-5 text-body-sm text-muted">
          <span>Schull Technologies</span>
          <Link href="/privacy" className="transition-colors hover:text-ink">
            Privacy
          </Link>
          <Link href="/terms" className="transition-colors hover:text-ink">
            Terms
          </Link>
        </div>
      </footer>
    </div>
  );
}
