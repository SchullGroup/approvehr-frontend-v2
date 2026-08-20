import type { Metadata } from "next";
import { ForgotPasswordScreen } from "./forgot-password-screen";

export const metadata: Metadata = {
  title: "Reset your password",
  description: "Get a link to set a new ApproveHR password.",
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordScreen />;
}
