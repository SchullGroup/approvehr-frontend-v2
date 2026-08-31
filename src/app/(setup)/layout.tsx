import { ToastProvider } from "@/components/ui";
import { AuthGate } from "@/components/portal/auth-gate";
import { Logo } from "@/components/brand/logo";

/**
 * The setup wizard's own route group — full screen, no `AppShell`.
 *
 * Setup used to render inside `(app)/layout.tsx`, which meant the sidebar and
 * topbar painted around it: a company mid-wizard could click "Employees" and
 * simply leave, which defeated the whole point of asking these questions
 * before the product's size is visible. `AppShell` is furniture for
 * navigating a product you can already see; the wizard is the thing deciding
 * how much of it you get, so it gets no furniture until it is done.
 *
 * `AuthGate`, not `AppShell` — still needs a real, signed-in session (the
 * wizard reads and writes company-level settings), but nothing to navigate
 * with. `ToastProvider` is repeated here rather than hoisted to the root
 * layout for the same reason `(app)/layout.tsx` carries its own: see that
 * file's note on keeping the root layout free of `@/components/ui`.
 *
 * The mark on its own, not the full lockup with wordmark: "full screen" was
 * about removing the sidebar/topbar's navigation, not the brand itself — a
 * screen with no logo at all reads as broken, not as focused.
 */
export default function SetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <AuthGate>
        <div className="flex min-h-dvh flex-col bg-canvas">
          <header className="border-b border-line bg-surface">
            <div className="mx-auto flex h-14 max-w-5xl items-center px-5">
              <Logo size={24} showWordmark={false} />
            </div>
          </header>
          <main id="main" className="flex flex-1 flex-col">
            {children}
          </main>
        </div>
      </AuthGate>
    </ToastProvider>
  );
}
