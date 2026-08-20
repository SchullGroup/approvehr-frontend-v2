import type { Metadata } from "next";
import { VerifyEmailScreen } from "./verify-email-screen";

export const metadata: Metadata = {
  title: "Confirm your email",
  description: "Confirm the email address on your ApproveHR account.",
  /* The URL carries a one-time credential — see the same note on the reset page. */
  robots: { index: false, follow: false },
};

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const single = Array.isArray(token) ? token[0] : token;
  return <VerifyEmailScreen token={single?.trim() ? single.trim() : null} />;
}
