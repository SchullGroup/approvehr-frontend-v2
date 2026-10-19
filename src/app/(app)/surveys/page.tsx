import type { Metadata } from "next";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { SurveysScreen } from "./surveys-screen";

export const metadata: Metadata = {
  title: "Surveys",
  description:
    "Ask everybody the same questions, and see what came back once enough people have answered.",
};

export default function SurveysPage() {
  return (
    <>
      {/* No breadcrumb: this is a top-level route, and a single crumb pointing
          at the page you are on renders as "Back to Surveys" on the Surveys
          page. */}
      <PageHeader title="Surveys" />
      <PageBody>
        <SurveysScreen />
      </PageBody>
    </>
  );
}
