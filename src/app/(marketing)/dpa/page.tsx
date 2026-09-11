import type { Metadata } from "next";
import { LegalDocument } from "@/components/marketing/legal";
import { LEGAL_DOCS } from "@/lib/marketing/legal";
import { SITE_URL } from "@/lib/marketing/site";

const doc = LEGAL_DOCS["dpa"];

export const metadata: Metadata = {
  title: doc.title,
  description: doc.description,
  alternates: { canonical: `${SITE_URL}/dpa` },
};

export default function Page() {
  return <LegalDocument doc={doc} />;
}
