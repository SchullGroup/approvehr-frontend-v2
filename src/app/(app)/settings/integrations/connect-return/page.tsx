import type { Metadata } from "next";
import { ConnectReturn } from "./connect-return";

export const metadata: Metadata = {
  title: "Connecting · Integrations",
  description: "Finishing a work-tracker connection.",
};

export default function ConnectReturnPage() {
  return <ConnectReturn />;
}
