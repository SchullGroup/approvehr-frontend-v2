import type { Metadata } from "next";
import { PostingPreview } from "./posting-preview";

export const metadata: Metadata = {
  title: "Preview an advert",
  description: "An advert as an applicant sees it. Nothing here is sent.",
};

export default async function PostingPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PostingPreview id={id} />;
}
