import type { Metadata } from "next";
import { MyApplicationScreen } from "./my-application-screen";

export const metadata: Metadata = {
  title: "Candidate",
  description:
    "One candidate you can see, and the interviews you were invited to.",
};

export default async function MyApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MyApplicationScreen id={id} />;
}
