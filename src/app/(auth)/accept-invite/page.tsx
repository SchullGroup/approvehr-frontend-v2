import type { Metadata } from "next";
import { AcceptInviteScreen } from "./accept-invite-screen";

export const metadata: Metadata = {
  title: "Set your password",
  description: "Accept your ApproveHR invitation and set a password.",
  /* The URL carries a one-time credential — see the same note on the reset
     and verify-email pages. */
  robots: { index: false, follow: false },
};

/**
 * The token arrives in the query string. Read on the server for the same
 * reason `reset-password/page.tsx` does: a prop is simpler than
 * `useSearchParams` and impossible to forget to await.
 */
export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const single = Array.isArray(token) ? token[0] : token;
  return <AcceptInviteScreen token={single?.trim() ? single.trim() : null} />;
}
