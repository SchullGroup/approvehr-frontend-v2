import { redirect } from "next/navigation";

/** `/hiring/settings` is its first tab. */
export default function HiringSettingsPage() {
  redirect("/hiring/settings/pipelines");
}
