import type { Metadata } from "next";
import { LeaveScreen } from "./leave-screen";

export const metadata: Metadata = {
  title: "Time off",
  description: "Requests, balances and who is away when.",
};

/* The screen itself is a client component because leave requests are now live
   state — approving one has to move a balance and clear a row in /approvals in
   the same breath. Only the metadata stays on the server. */
export default function LeavePage() {
  return <LeaveScreen />;
}
