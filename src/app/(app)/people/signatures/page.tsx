import type { Metadata } from "next";
import { SignaturesScreen } from "./signatures-screen";

export const metadata: Metadata = {
  title: "Signatures",
  description:
    "Documents waiting on your signature, and documents sent for signature — each identified by the fingerprint of its exact bytes.",
};

export default function SignaturesPage() {
  return <SignaturesScreen />;
}
