"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * For a reader who cannot do anything about a switched-off module: do not show
 * them a page whose only content is "you can't". Send them to the dashboard,
 * the parent of every module page. Somebody who CAN switch it on keeps the page,
 * where the switch is the button.
 *
 * Rendered only after the company's settings have been read, so it never
 * redirects on a default that has not been replaced yet.
 */
export function GoHomeWhenOff() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);
  return null;
}
