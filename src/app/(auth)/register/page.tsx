import type { Metadata } from "next";
import { RegisterScreen } from "./register-screen";

export const metadata: Metadata = {
  title: "Create your account",
  description:
    "Open an ApproveHR account for your company. Company name, your name, work email, password.",
};

export default function RegisterPage() {
  return <RegisterScreen />;
}
