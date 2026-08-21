import { Suspense } from "react";
import type { Metadata } from "next";
import { LeaveScreen } from "./leave-screen";

export const metadata: Metadata = {
  title: "Time off",
  description: "Requests, balances and who is away when.",
};

/**
 * The screen itself is a client component because leave is live state — a
 * decision has to move a balance and clear a row in `/approvals` in the same
 * breath. Only the metadata stays on the server.
 *
 * The `Suspense` boundary is required, not decorative: the screen reads
 * `?request=<id>` with `useSearchParams` so a row in the approvals inbox can
 * open the exact request it is about, and a prerendered route calling that hook
 * client-side renders everything up to the nearest boundary. Without one, the
 * boundary is the whole route.
 */
export default function LeavePage() {
  return (
    <Suspense fallback={null}>
      <LeaveScreen />
    </Suspense>
  );
}
