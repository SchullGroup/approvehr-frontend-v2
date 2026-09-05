import { ToastProvider } from "@/components/ui";
import { AuthGate } from "@/components/portal/auth-gate";
import { SetupGate } from "@/components/portal/setup-gate";
import { AppShell } from "@/components/portal/shell";
import { ThemeEffect } from "@/components/portal/theme-effect";
import { THEME_INIT_SCRIPT } from "@/lib/theme-init-script";

/* The gate sits inside the toast provider so a sign-out can raise a toast, and
   outside the shell so the sign-in screen gets its own chrome rather than
   appearing inside a sidebar it has no business showing. SetupGate sits inside
   AuthGate — it needs a signed-in session to decide anything — and outside
   AppShell so the redirect fires before the sidebar ever paints. /setup itself
   now lives in its own route group (`app/(setup)/`), with no AppShell at all —
   see that layout's note for why a redirect here was not, on its own, enough. */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Sets data-theme on <html> before first paint. Bypasses React on
          purpose — see lib/theme-init-script.ts's own header. */}
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      <ThemeEffect />
      <ToastProvider>
        <AuthGate>
          <SetupGate>
            <AppShell>{children}</AppShell>
          </SetupGate>
        </AuthGate>
      </ToastProvider>
    </>
  );
}
