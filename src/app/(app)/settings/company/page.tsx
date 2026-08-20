import type { Metadata } from "next";
import { CompanyProfileForm } from "./form";

export const metadata: Metadata = {
  title: "Company profile",
  description: "Legal entities, RC numbers, registered addresses and tax states.",
};

export default function CompanyProfilePage() {
  return <CompanyProfileForm />;
}
