import type { Metadata } from "next";
import { RequisitionWizard } from "./wizard";

export const metadata: Metadata = {
  title: "New requisition",
  description: "Open a new role in five steps.",
};

/**
 * `/hiring/requisitions/new`
 *
 * A shell. `MANAGE_HIRING` is a client-side fact, so the gate, the header and
 * the wizard itself all live in `wizard.tsx` — see its header for why.
 */
export default function NewRequisitionPage() {
  return <RequisitionWizard />;
}
