import { ToastProvider } from "@/components/ui";
import { AuthGate } from "@/components/portal/auth-gate";
import { AppShell } from "@/components/portal/shell";

/* The gate sits inside the toast provider so a sign-out can raise a toast, and
   outside the shell so the sign-in screen gets its own chrome rather than
   appearing inside a sidebar it has no business showing. */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <AuthGate>
        <AppShell>{children}</AppShell>
      </AuthGate>
    </ToastProvider>
  );
}
