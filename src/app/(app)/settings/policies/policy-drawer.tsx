"use client";

import { Callout, Drawer, Spinner } from "@/components/ui";
import { usePolicyText } from "@/lib/store/conduct";

/**
 * One handbook section, open and readable.
 *
 * Shared by the handbook screen and by `MyPolicies` on `/profile`, because the
 * two want the same thing for different reasons — one is reviewing what was
 * published, the other is reading it before accepting it — and a second copy
 * would eventually render the text differently in the place that matters more.
 *
 * `footer` is where the Accept button goes when there is one. Somebody asked to
 * accept a policy should be able to accept it from inside the policy, not have
 * to close it and find the button again.
 */
export function PolicyDrawer({
  policyId,
  title,
  subtitle,
  footer,
  onClose,
}: {
  policyId: string;
  title: string;
  subtitle?: string;
  footer?: React.ReactNode;
  onClose: () => void;
}) {
  const detail = usePolicyText(policyId);

  return (
    <Drawer
      open
      onClose={onClose}
      title={title}
      size="xl"
      {...(subtitle ? { description: subtitle } : {})}
      {...(footer ? { footer } : {})}
    >
      {detail.loading ? (
        <div className="flex items-center gap-2 text-body-sm text-muted">
          <Spinner size="sm" />
          Loading
        </div>
      ) : detail.error ? (
        <Callout tone="danger" title="Could not open it">
          {detail.error.message}
        </Callout>
      ) : (
        <p className="whitespace-pre-wrap text-body leading-relaxed text-body">
          {detail.policy?.body ?? "This section has no text."}
        </p>
      )}
    </Drawer>
  );
}
