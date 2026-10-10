import { ToastProvider } from "@/components/ui";
import { AuthGate } from "@/components/portal/auth-gate";
import { ErrorReporting } from "@/components/portal/error-reporting";
import { ThemeEffect } from "@/components/portal/theme-effect";
import { THEME_INIT_SCRIPT } from "@/lib/theme-init-script";

/**
 * Screens that take the whole window — no sidebar, no top bar.
 *
 * A review is answered one question at a time, and the person answering should
 * have nothing else to click on. The same reasoning as the setup wizard's route
 * group (`app/(setup)/layout.tsx`): `AppShell` is furniture for moving around a
 * product, and a form that wants somebody's full attention gets none of it. The
 * page draws its own way out.
 *
 * Still behind `AuthGate`, because what it reads and writes is the signed-in
 * person's own. It does not sit behind `SetupGate`: nobody reaches here from a
 * company that has not finished setup, and bouncing a half-written review to
 * the wizard would lose it.
 */
export default function FocusLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Same theme mechanism as (app)/layout.tsx — see that file's note. */}
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      <ThemeEffect />
      <ErrorReporting />
      <ToastProvider>
        <AuthGate>
          <main id="main" className="min-h-dvh bg-canvas">
            {children}
          </main>
        </AuthGate>
      </ToastProvider>
    </>
  );
}
