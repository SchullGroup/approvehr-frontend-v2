import type { Metadata } from "next";
import { IntegrationsList } from "./list";

export const metadata: Metadata = {
  title: "Integrations",
  description: "Accounting, attendance devices, single sign-on and payment execution.",
};

export default function IntegrationsPage() {
  return <IntegrationsList />;
}
