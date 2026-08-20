import type { Metadata } from "next";
import { DepartmentsScreen } from "./departments-screen";

export const metadata: Metadata = {
  title: "Departments and teams",
  description:
    "Your org structure: departments, the teams inside them, who leads each one and what it costs.",
};

export default function DepartmentsPage() {
  return <DepartmentsScreen />;
}
