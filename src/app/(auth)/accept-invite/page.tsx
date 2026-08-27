import type { Metadata } from "next";
import { AcceptInviteScreen } from "./accept-invite-screen";

export const metadata: Metadata = {
  title: "Accept your invitation",
  description: "Set a password and open your ApproveHR account.",
  /* The URL carries a one-time credential — see the same note on reset/verify. */
  robots: { index: false, follow: false },
};

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const single = Array.isArray(token) ? token[0] : token;
  return <AcceptInviteScreen token={single?.trim() ? single.trim() : null} />;
}
