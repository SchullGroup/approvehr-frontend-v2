import type { Metadata } from "next";
import { ArticleScreen } from "./article-screen";

export const metadata: Metadata = {
  title: "Help article",
  description: "One answer, and two buttons to say whether it was any use.",
};

/**
 * Not prerendered.
 *
 * The segment is a slug in one company's knowledge base — or a uuid, which the
 * API also accepts — so there is no build-time list to `generateStaticParams`
 * from. Reading an article also increments its view counter, which is a request
 * that has to happen per reader rather than once at build.
 */
export default async function KbArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ArticleScreen slug={slug} />;
}
