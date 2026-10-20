import type { Metadata } from "next";
import { EmailsScreen } from "./emails-screen";

export const metadata: Metadata = {
  title: "Candidate emails",
  description:
    "The wording of emails sent to candidates, and who they come from.",
};

export default function EmailsPage() {
  return <EmailsScreen />;
}
