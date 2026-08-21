import type { Metadata } from "next";
import { WebhooksScreen } from "./webhooks-screen";

export const metadata: Metadata = {
  title: "Webhooks",
  description:
    "Send signed JSON to your own server when payroll, leave or people change.",
};

export default function WebhooksPage() {
  return <WebhooksScreen />;
}
