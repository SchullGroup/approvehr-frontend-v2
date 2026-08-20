import type { Metadata } from "next";
import { ResetPasswordScreen } from "./reset-password-screen";

export const metadata: Metadata = {
  title: "Choose a new password",
  description: "Set a new ApproveHR password using the link sent to your email.",
  /* The URL carries a one-time credential. Keeping it out of search indexes and
     out of the referrer of anything this page links to is the cheap half of not
     leaking it; the API expiring it in an hour and refusing a second use is the
     half that actually matters. */
  robots: { index: false, follow: false },
};

/**
 * The token arrives in the query string.
 *
 * Read here, on the server, rather than with `useSearchParams` in the screen:
 * the hook forces the page into a Suspense boundary and a client-side read, and
 * a prop is both simpler and impossible to forget to await.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const single = Array.isArray(token) ? token[0] : token;
  return <ResetPasswordScreen token={single?.trim() ? single.trim() : null} />;
}
