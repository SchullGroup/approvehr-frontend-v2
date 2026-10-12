import { ExternalLink } from "lucide-react";
import type { ApiTaskSource } from "@/lib/api/performance";
import { PROVIDER_NAME } from "@/lib/api/work-trackers";

/**
 * "Jira PAY-142", linked to the ticket, beside a weekly task that was synced
 * rather than typed. Renders nothing for a hand-logged task, so callers can
 * place it unconditionally.
 */
export function TaskSource({ source }: { source: ApiTaskSource | undefined }) {
  if (!source) return null;
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noreferrer"
      className="mt-1 inline-flex items-center gap-1 rounded-sm bg-sunken px-1.5 py-0.5 text-meta font-medium text-body hover:text-ink"
    >
      {PROVIDER_NAME[source.provider]} {source.key}
      <ExternalLink aria-hidden="true" className="size-3" />
      <span className="sr-only">(opens the ticket)</span>
    </a>
  );
}
