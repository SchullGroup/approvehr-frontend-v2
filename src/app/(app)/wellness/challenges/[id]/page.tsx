import type { Metadata } from "next";
import { ChallengeScreen } from "../../challenge-screen";
import { WellnessShell } from "../../wellness-shell";

export const metadata: Metadata = {
  title: "Challenge",
  description: "What a challenge is, joining it, and how it is going.",
};

export default async function ChallengePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <WellnessShell active="/wellness/challenges">
      <ChallengeScreen id={id} />
    </WellnessShell>
  );
}
