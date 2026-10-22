import type { Metadata } from "next";
import { MyWorkRecordScreen } from "./work-record-screen";

export const metadata: Metadata = {
  title: "My work record",
  description:
    "What you finished on the project boards, a day, week, month or quarter at a time.",
};

export default function MyWorkRecordPage() {
  return <MyWorkRecordScreen />;
}
