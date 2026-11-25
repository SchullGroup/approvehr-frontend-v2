"use client";

import { BackHome } from "@/components/portal/require-permission";
import { Lock } from "lucide-react";
import { Card, EmptyState, LinkTabs, Skeleton } from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { usePermissions } from "@/lib/permissions";

/**
 * The frame every hiring settings page sits in: the same heading, the same
 * tabs, the same gate.
 *
 * These settings decide who is told what in the company's name and how a role's
 * pipeline is shaped, so they are kept to whoever hires. The gate is here, once,
 * rather than copied into each page where one copy would eventually go missing.
 */

/**
 * Every tab, in order. The careers page settings keep their own address,
 * `/hiring/postings/settings`, because candidate emails, interview invitations
 * and the adverts screen all link there, and they sit in this strip so hiring
 * has one settings area rather than two (UAT 23 Nov, U99 / PERF-19).
 */
export const HIRING_SETTINGS_TABS = [
  { href: "/hiring/postings/settings", label: "Careers page" },
  { href: "/hiring/settings/pipelines", label: "Pipelines" },
  { href: "/hiring/settings/rejection-reasons", label: "Rejection reasons" },
  { href: "/hiring/settings/tags", label: "Tags" },
  { href: "/hiring/settings/accepted-offers", label: "Accepted offers" },
  { href: "/hiring/settings/emails", label: "Candidate emails" },
  { href: "/hiring/settings/interviews", label: "Interview reminders" },
  { href: "/hiring/settings/retention", label: "Data retention" },
];

export const HIRING_SETTINGS_CRUMBS = [{ href: "/hiring", label: "Hiring" }];
const CRUMBS = HIRING_SETTINGS_CRUMBS;

/** The tab strip, for a settings page that draws its own header. */
export function HiringSettingsTabs({ active }: { active: string }) {
  return <LinkTabs items={HIRING_SETTINGS_TABS} activeHref={active} />;
}

export function HiringSettingsShell({
  active,
  title,
  description,
  action,
  children,
}: {
  /** The tab's href. */
  active: string;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { can, loading } = usePermissions();

  const tabs = <HiringSettingsTabs active={active} />;

  if (loading) {
    return (
      <>
        <PageHeader title="Hiring settings" breadcrumb={CRUMBS} />
        <PageBody>
          <Skeleton className="h-40 w-full" />
          <span className="sr-only-focusable">Loading the settings</span>
        </PageBody>
      </>
    );
  }

  if (!can("MANAGE_HIRING")) {
    return (
      <>
        <PageHeader title="Hiring settings" breadcrumb={CRUMBS} />
        <PageBody>
          <Card>
            <EmptyState
              plain
              icon={<Lock aria-hidden="true" />}
              title="You cannot change these"
              description="They shape every role's pipeline and what applicants are told, so they are kept to whoever hires. Ask whoever manages access to add hiring to your role."
              action={<BackHome />}
            />
          </Card>
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Hiring settings"
        breadcrumb={CRUMBS}
        tabs={tabs}
        {...(action ? { action } : {})}
      />
      <PageBody className="flex flex-col gap-5">
        <div>
          <h2 className="text-h4 text-ink">{title}</h2>
          <p className="mt-1 max-w-2xl text-body-sm text-muted">
            {description}
          </p>
        </div>
        {children}
      </PageBody>
    </>
  );
}
