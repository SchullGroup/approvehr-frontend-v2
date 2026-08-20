import type { Metadata } from "next";
import { ProfileScreen } from "./profile-screen";

export const metadata: Metadata = {
  title: "My profile · ApproveHR",
  description: "Your details, your pay, your time off.",
};

export default function ProfilePage() {
  return <ProfileScreen />;
}
