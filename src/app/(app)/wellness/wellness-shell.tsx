"use client";

import {
  BellRing,
  ClipboardCheck,
  Heart,
  Lock,
  SlidersHorizontal,
  Sun,
  Trophy,
} from "lucide-react";
import { ButtonLink, Card, EmptyState, LoadState } from "@/components/ui";
import { PillNav, WellnessArt } from "@/components/wellness";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { useCan } from "@/lib/permissions";
import { useFeatures } from "@/lib/store/features";
import { useWellnessAvailable } from "@/lib/store/wellness";
import { YourDataMenu } from "./your-data";

/**
 * The frame every Wellness page sits in: the heading, the tabs, and what to say
 * when there is nothing to show yet.
 *
 * ## A route a tab, because one of them is fixed by the API
 *
 * A thank-you notification carries `/wellness/recognition` as its link, so that
 * path has to exist and open on kudos. Making the other tabs routes too keeps
 * the back button and a shared link honest, and the sidebar keeps one row for
 * all of them.
 *
 * ## Delivery is not wellness data
 *
 * The weekly delivery report is the performance module's weekly tasks, grouped
 * by week. It is a tab here only because the API puts it behind the same company
 * switch, so it is present and absent with the others. It is for everybody (your
 * own week), and shows a team only when the API sent one.
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
  { href: "/wellness", label: "Overview", icon: <Sun /> },
  { href: "/wellness/challenges", label: "Challenges", icon: <Trophy /> },
  { href: "/wellness/reminders", label: "Reminders", icon: <BellRing /> },
  { href: "/wellness/recognition", label: "Recognition", icon: <Heart /> },
  { href: "/wellness/delivery", label: "Delivery", icon: <ClipboardCheck /> },
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
    <PillNav
      items={
        canManage
          ? [
              ...BASE_TABS,
              {
                href: "/wellness/settings",
                label: "Settings",
                icon: <SlidersHorizontal />,
              },
            ]
          : BASE_TABS
      }
      activeHref={active}
      className="pb-3"
    />
  );

  return (
    <>
      <PageHeader title="Wellness" tabs={tabs} />
      <PageBody>
        {!available ? (
          <Card>
            <EmptyState
              art={<WellnessArt name="drop" mood="sleepy" size={96} />}
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
        art={<WellnessArt name="avocado" mood="sleepy" size={104} />}
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
