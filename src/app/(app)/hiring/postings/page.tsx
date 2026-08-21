import type { Metadata } from "next";
import { PostingsScreen } from "./postings-screen";

export const metadata: Metadata = {
  title: "Job adverts",
  description:
    "Every job advert on your careers page: what is live, what is still a draft, and the link to share.",
};

export default function PostingsPage() {
  return <PostingsScreen />;
}
