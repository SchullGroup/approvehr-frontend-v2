"use client";

import { HeartPulse, Lock } from "lucide-react";
import {
  ButtonLink,
  Card,
  EmptyState,
  LinkTabs,
  LoadState,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { useCan } from "@/lib/permissions";
import { useFeatures } from "@/lib/store/features";
import { useWellnessAvailable } from "@/lib/store/wellness";
import { YourDataMenu } from "./your-data";

/**
 * The frame every Wellness page sits in: the heading, the tabs, and what to say
 * when there is nothing to show yet.
 *
 * ## Four routes, because one of them is fixed by the API
 *
 * A thank-you notification carries `/wellness/recognition` as its link, so that
 * path has to exist and open on kudos. Making the other tabs routes too keeps
 * the back button and a shared link honest, and the sidebar keeps one row for
 * all of them.
 *
 * ## The module being off is a state, not a failure
 *
 * The API refuses every route while the company flag is off. The shell asks the
 * flags first and says so in one line, rather than letting four tabs each show a
 * refusal. The one thing that stays on offer is walking away (stop tracking,
 * delete what was logged), because the API keeps those open for the same reason.
 *
 * ## Settings is a tab only for people who can use it
 *
 * The privacy floor is `MANAGE_SETTINGS`. The tab is absent for everybody else,
 * and the page itself says so if somebody arrives by link; the API decides
 * either way.
 */

const BASE_TABS = [
  { href: "/wellness", label: "Overview" },
  { href: "/wellness/challenges", label: "Challenges" },
  { href: "/wellness/reminders", label: "Reminders" },
  { href: "/wellness/recognition", label: "Recognition" },
];

export function WellnessShell({
  active,
  children,
}: {
  /** The tab's href. */
  active: string;
  children: React.ReactNode;
}) {
  const features = useFeatures();
  const available = useWellnessAvailable();
  const canManage = useCan("MANAGE_SETTINGS");

  const tabs = (
    <LinkTabs
      items={
        canManage
          ? [...BASE_TABS, { href: "/wellness/settings", label: "Settings" }]
          : BASE_TABS
      }
      activeHref={active}
    />
  );

  return (
    <>
      <PageHeader title="Wellness" tabs={tabs} />
      <PageBody>
        {!available ? (
          <Card>
            <EmptyState
              icon={<HeartPulse aria-hidden="true" />}
              title="Wellness needs the API"
              description="There is no demo version. What you log is private to you, and only the server can make that true."
            />
          </Card>
        ) : (
          <LoadState
            loading={features.loading}
            error={features.error}
            onRetry={features.reload}
            subject="your company's settings"
            skeleton="list"
          >
            {features.wellness ? children : <ModuleOff canManage={canManage} />}
          </LoadState>
        )}
      </PageBody>
    </>
  );
}

function ModuleOff({ canManage }: { canManage: boolean }) {
  return (
    <Card>
      <EmptyState
        icon={<HeartPulse aria-hidden="true" />}
        title="Wellness is switched off"
        description={
          canManage
            ? "Switch it on under Settings, then Features."
            : "Ask an administrator to switch it on."
        }
        action={
          canManage ? (
            <ButtonLink href="/settings/features" variant="accent">
              Open features
            </ButtonLink>
          ) : undefined
        }
      />
      <div className="flex items-center justify-center gap-2 border-t border-line px-5 py-3 text-body-sm text-muted">
        Your data
        <YourDataMenu />
      </div>
    </Card>
  );
}

/** For the Settings route, when somebody without the permission opens it. */
export function NotYours() {
  return (
    <Card>
      <EmptyState
        icon={<Lock aria-hidden="true" />}
        title="You cannot change these"
        description="They apply to the whole company, so they are kept to administrators."
      />
    </Card>
  );
}
