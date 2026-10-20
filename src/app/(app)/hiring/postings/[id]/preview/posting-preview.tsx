"use client";

import { useMemo } from "react";
import { ArrowLeft, Lock } from "lucide-react";
import {
  ButtonLink,
  Callout,
  Card,
  EmptyState,
  Skeleton,
} from "@/components/ui";
import { ApplyForm } from "@/components/marketing/apply/apply-form";
import { RoleView } from "@/components/marketing/role-view";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import type { ApiPosting } from "@/lib/api/careers";
import { previewClient } from "@/lib/marketing/apply-client";
import { type PublicRoleDetail } from "@/lib/marketing/careers";
import { plainToRichText } from "@/lib/marketing/rich-text";
import { usePermissions } from "@/lib/permissions";
import {
  DEMO_SETTINGS,
  useCareersSettings,
  usePosting,
  usePostingForm,
} from "@/lib/store/careers-form";

/**
 * An advert exactly as an applicant meets it, page and form together.
 *
 * It draws the **same** `RoleView` and `ApplyForm` the careers page draws, given
 * the advert, the company's branding and the saved form, with a client that sends
 * nothing. So a draft can be read the way a stranger will read it before it is
 * published, and the demo has a working applicant's form with no API behind it.
 *
 * What it shows is what is saved: edits still sitting in the builder are not here,
 * and the banner says so.
 */

/** The advert as the public read would answer it. */
function asPublic(
  posting: ApiPosting,
  company: string,
  branding: PublicRoleDetail["branding"],
): PublicRoleDetail {
  return {
    slug: posting.slug,
    title: posting.title,
    summary: posting.summary,
    location: posting.location,
    employmentType: posting.employmentType,
    salaryMinKobo: posting.showSalary ? posting.salaryMinKobo : null,
    salaryMaxKobo: posting.showSalary ? posting.salaryMaxKobo : null,
    closesOn: posting.closesOn,
    acceptingApplications: true,
    postedOn: posting.publishedAt?.slice(0, 10) ?? null,
    company,
    description: posting.description,
    descriptionHtml:
      posting.descriptionHtml ?? plainToRichText(posting.description),
    ...(branding ? { branding } : {}),
  };
}

export function PostingPreview({ id }: { id: string }) {
  const { can, loading } = usePermissions();
  const advert = usePosting(id);
  const settings = useCareersSettings();
  const form = usePostingForm(id);
  const posting = advert.posting;

  const company =
    settings.settings?.branding.name ?? DEMO_SETTINGS.branding.name;
  const branding = settings.settings?.branding;
  const role = useMemo(
    () =>
      posting
        ? asPublic(
            posting,
            company,
            branding
              ? {
                  name: branding.name,
                  logoUrl: branding.logoUrl,
                  description: branding.description,
                  websiteUrl: branding.websiteUrl,
                  accentColor: branding.accentColor,
                }
              : undefined,
          )
        : null,
    [posting, company, branding],
  );
  const client = useMemo(
    () =>
      previewClient(advert.live ? "preview" : "demo", {
        company,
        postingTitle: posting?.title ?? "",
      }),
    [advert.live, company, posting?.title],
  );

  const crumbs = [
    { href: "/hiring", label: "Hiring" },
    { href: "/hiring/postings", label: "Job adverts" },
    { href: `/hiring/postings/${id}`, label: posting?.title ?? "Advert" },
  ];

  if (loading || advert.loading || form.loading) {
    return (
      <>
        <PageHeader title="Preview" breadcrumb={crumbs} />
        <PageBody>
          <Skeleton className="h-64 w-full" />
          <span className="sr-only-focusable">Loading the preview</span>
        </PageBody>
      </>
    );
  }

  if (!can("MANAGE_HIRING")) {
    return (
      <>
        <PageHeader title="Preview" breadcrumb={crumbs} />
        <PageBody>
          <Card>
            <EmptyState
              icon={<Lock aria-hidden="true" />}
              title="You cannot preview this advert"
              description="Ask whoever manages access to add hiring to your role."
            />
          </Card>
        </PageBody>
      </>
    );
  }

  if (!posting || !role || !form.definition) {
    return (
      <>
        <PageHeader title="Preview" breadcrumb={crumbs} />
        <PageBody>
          {advert.error && advert.error.status !== 404 ? (
            <LoadFailure
              subject="this advert"
              error={advert.error}
              onRetry={advert.reload}
            />
          ) : (
            <Card>
              <EmptyState
                icon={<Lock aria-hidden="true" />}
                title="That advert is not here"
                action={
                  <ButtonLink
                    href="/hiring/postings"
                    variant="secondary"
                    size="sm"
                  >
                    Back to job adverts
                  </ButtonLink>
                }
              />
            </Card>
          )}
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Preview"
        breadcrumb={crumbs}
        action={
          <ButtonLink
            href={`/hiring/postings/${id}`}
            variant="secondary"
            size="sm"
          >
            <ArrowLeft aria-hidden="true" className="size-3.5" />
            Back to the advert
          </ButtonLink>
        }
      />
      <PageBody className="flex flex-col gap-4">
        <Callout
          tone="info"
          title={
            advert.live
              ? "A preview. Nothing here is sent."
              : "Demo. Try it as an applicant would."
          }
        >
          This is the saved advert and the saved form, the way an applicant sees
          them. Changes still sitting in the editor are not here.
        </Callout>
        <div
          data-testid="posting-preview"
          className="overflow-hidden rounded-xl bg-sand text-slate-soft"
        >
          <RoleView
            role={role}
            motion={false}
            titleAs="h2"
            aside={
              <ApplyForm
                client={client}
                roleTitle={posting.title}
                company={company}
                form={form.definition}
                uploadsEnabled={form.filesAvailable}
              />
            }
          />
        </div>
      </PageBody>
    </>
  );
}
