import { AuthShell } from "@/components/portal/auth-shell";

/**
 * The account screens: register, verify email, forgot and reset password.
 *
 * Its own route group with its own chrome, because none of these pages has an
 * account behind it yet. No `AuthGate` — three of the four are reachable by
 * somebody who is not signed in and could not be. No `AppShell` — a sidebar of
 * modules you cannot open is furniture, not navigation.
 *
 * The frame is `AuthShell`, shared with `components/portal/auth-gate.tsx`'s
 * own sign-in screen rather than matched to it by hand — see that component's
 * header for why. Sign-in and sign-up are one flow to the person using them,
 * and reading as two different products would be the wrong first impression.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthShell>{children}</AuthShell>;
}
