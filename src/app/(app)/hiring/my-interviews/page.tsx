import type { Metadata } from "next";
import { MyInterviewsScreen } from "./my-interviews-screen";

export const metadata: Metadata = {
  title: "My interviews",
  description: "The interviews you were invited to score.",
};

export default function MyInterviewsPage() {
  return <MyInterviewsScreen />;
}
