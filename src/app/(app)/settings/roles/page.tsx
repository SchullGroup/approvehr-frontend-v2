import type { Metadata } from "next";
import { RolesScreen } from "./roles-screen";

export const metadata: Metadata = {
  title: "Roles and permissions",
  description: "Who can see salaries, approve payroll, or export employee data.",
};

export default function RolesPage() {
  return <RolesScreen />;
}
