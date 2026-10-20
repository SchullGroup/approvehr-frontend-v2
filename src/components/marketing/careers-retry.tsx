"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/cn";

/**
 * "Try again", for a server-rendered page that could not be read.
 *
 * The careers pages are rendered on the server, so a failed read is a finished
 * page with no state to retry. This asks Next to render it again —
 * `router.refresh()`, which re-runs the server component and re-reads the API
 * without a full reload and without losing scroll.
 *
 * It is a real link first and a button's job second. With scripting off, or
 * before this has hydrated, `href` is the same page and following it does the
 * retry the slow way; with scripting on, the click is intercepted. A candidate on
 * a bad connection is exactly the person most likely to meet the first case.
 *
 * ## It says when a retry did not help
 *
 * Pressing it and seeing nothing change reads as a dead button. After the
 * refresh settles with the page still unavailable (this component is still
 * mounted, which is how it knows) one line says so, in a live region.
 */
export function CareersRetry({
  label = "Try again",
  className,
}: {
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const [tried, setTried] = useState(false);

  return (
    <div className="flex flex-col items-start gap-3">
      <a
        href={pathname}
        aria-disabled={pending}
        onClick={(event) => {
          event.preventDefault();
          if (pending) return;
          setTried(true);
          start(() => router.refresh());
        }}
        className={cn(
          "pill-press inline-flex h-10 items-center justify-center rounded-full bg-slate px-5",
          "text-body-sm font-medium whitespace-nowrap text-white shadow-[0_1px_2px_rgb(20_18_15/0.14)]",
          "hover:bg-slate-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate",
          pending && "pointer-events-none opacity-60",
          className,
        )}
      >
        {pending ? "Trying again…" : label}
      </a>
      <p role="status" className="text-body-sm text-slate-muted">
        {tried && !pending
          ? "Still not loading. Give it a minute, then try again."
          : ""}
      </p>
    </div>
  );
}
