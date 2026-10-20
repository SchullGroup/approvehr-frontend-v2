"use client";

import { Lock } from "lucide-react";
import { Card, EmptyState, Skeleton, TextLink } from "@/components/ui";
import { HiredList } from "@/components/hiring/hired/hired-list";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { whatAcceptingDoes } from "@/lib/hiring/hired/copy";
import { useHiredSettings } from "@/lib/hiring/hired/use-hired";
import { usePermissions } from "@/lib/permissions";

/**
 * Everybody whose offer was accepted.
 *
 * Gated on `MANAGE_HIRING`: the list carries names, contact details and the
 * decisions about them, and it is where employee records are made. A person who may
 * only approve hiring has no use for it.
 *
 * Under the heading it says what accepting an offer does for this company right now,
 * because that changed: it used to make the employee record itself, and now it
 * stops at this list unless the company chose otherwise.
 */

const CRUMBS = [{ href: "/hiring", label: "Hiring" }];

export function HiredScreen({ initialJob = "" }: { initialJob?: string }) {
  const { can, loading } = usePermissions();
  const settings = useHiredSettings();

  if (loading) {
    return (
      <>
        <PageHeader title="Hired" breadcrumb={CRUMBS} />
        <PageBody>
          <Skeleton className="h-40 w-full" />
          <span className="sr-only-focusable">Loading the Hired list</span>
        </PageBody>
      </>
    );
  }

  if (!can("MANAGE_HIRING")) {
    return (
      <>
        <PageHeader title="Hired" breadcrumb={CRUMBS} />
        <PageBody>
          <Card>
            <EmptyState
              icon={<Lock aria-hidden="true" />}
              title="You cannot see the Hired list"
              description="It holds the names and contact details of people who accepted an offer, and it is where employee records are made, so it is kept to whoever hires. Ask whoever manages access to add hiring to your role."
            />
          </Card>
        </PageBody>
      </>
    );
  }

  const words = settings.settings
    ? whatAcceptingDoes({
        setting: settings.settings.onOfferAccepted,
        coreHr: settings.settings.coreHr,
      })
    : null;

  return (
    <>
      <PageHeader
        title="Hired"
        breadcrumb={CRUMBS}
        description="People whose offer was accepted. Making somebody an employee is a separate step."
      />
      <PageBody className="flex flex-col gap-5">
        {words && (
          <p className="max-w-3xl text-body-sm text-muted">
            <span className="font-medium text-ink">
              When an offer is accepted:
            </span>{" "}
            {words.headline}{" "}
            <TextLink href="/hiring/settings/accepted-offers">
              Change this in Hiring settings
            </TextLink>
          </p>
        )}
        <HiredList initialJob={initialJob} />
      </PageBody>
    </>
  );
}
