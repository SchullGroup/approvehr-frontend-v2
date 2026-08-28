import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { AuthVisual } from "./auth-visual";

/**
 * The frame behind every screen nobody has signed into yet — sign-in itself
 * (`auth-gate.tsx`) and the whole `(auth)` route group (register, verify,
 * forgot/reset password). One component rather than two hand-matched copies:
 * this used to be duplicated deliberately, on the grounds that sign-in and
 * sign-up read as one flow to the person using them. That reasoning still
 * holds; keeping two copies in step by hand was the part worth fixing, and a
 * shared component makes drift impossible instead of merely discouraged.
 *
 * The form column keeps the original single-column width and never sees the
 * visual half's background — `AuthVisual` is `aria-hidden`, decorative only,
 * and drops out below `lg` so a phone gets the form and nothing else.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas lg:flex-row">
      <div className="flex flex-1 flex-col">
        <header className="border-b border-line bg-surface">
          <div className="flex h-14 items-center px-5 lg:px-10">
            <Logo size={24} className="text-ink" />
          </div>
        </header>

        <main
          id="main"
          className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-5 py-14"
        >
          {children}
        </main>

        <footer className="border-t border-line bg-surface">
          <div className="flex h-14 flex-wrap items-center gap-x-5 gap-y-1 px-5 text-body-sm text-muted lg:px-10">
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

      <AuthVisual />
    </div>
  );
}
