import type { Metadata } from "next";
import { RecognitionScreen } from "../recognition-screen";
import { WellnessShell } from "../wellness-shell";

export const metadata: Metadata = {
  title: "Kudos",
  description: "Thank a colleague, in public or in private.",
};

export default function RecognitionPage() {
  return (
    <WellnessShell active="/wellness/recognition">
      <RecognitionScreen />
    </WellnessShell>
  );
}
