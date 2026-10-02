import type { Metadata } from "next";
import { AskScreen } from "./ask-screen";

export const metadata: Metadata = {
  title: "Ask",
  description:
    "Ask about your own records and watch the answer come together. It reads only what you are allowed to see, and it cannot change anything.",
};

export default function AskPage() {
  return <AskScreen />;
}
