import type { Metadata } from "next";
import { ReviewScreen } from "./review-screen";

export const metadata: Metadata = {
  title: "Appraisal",
  description:
    "One appraisal: the mark, what it is made of, who judged it, and the employee's answer to it.",
};

/**
 * One appraisal, as the record of a rating.
 *
 * No `generateStaticParams`: connected, a review id is a uuid nobody can
 * enumerate at build time, and demo ids are derived from the demo cycle. So this
 * renders on demand and the client decides whether the record exists — only the
 * client knows which source it is reading. Same shape as `/payroll/payslips/[id]`,
 * and for the same reason recorded there.
 *
 * **One route for every reader.** What is on it is decided by who is asking —
 * the subject, the person who wrote it, or somebody holding the records
 * permission — rather than by the URL. The incumbent has four routes for this
 * (`self-appraisal`, `manager-appraisal`, `manager-view`, `hr-view`) and four
 * endpoints differing only in a `where` clause are four places for a permission
 * bug to hide.
 */
export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReviewScreen reviewId={id} />;
}
