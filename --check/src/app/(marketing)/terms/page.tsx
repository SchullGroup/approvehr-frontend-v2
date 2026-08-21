import type { Metadata } from "next";
import { LegalDocument } from "@/components/marketing/legal";
import { LEGAL_DOCS } from "@/lib/marketing/legal";

const doc = LEGAL_DOCS["terms"];

export const metadata: Metadata = {
  title: doc.title,
  description: doc.description,
};

export default function Page() {
  return <LegalDocument doc={doc} />;
}
