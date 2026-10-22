import type { Metadata } from "next";
import { ChallengesScreen } from "../challenges-screen";
import { WellnessShell } from "../wellness-shell";

export const metadata: Metadata = {
  title: "Challenges",
  description: "Join a challenge, and see how it is going.",
};

export default function ChallengesPage() {
  return (
    <WellnessShell active="/wellness/challenges">
      <ChallengesScreen />
    </WellnessShell>
  );
}
