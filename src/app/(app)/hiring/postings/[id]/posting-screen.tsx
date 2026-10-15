"use client";

import Link from "next/link";
import { ExternalLink, Eye, Lock, Users } from "lucide-react";
import {
  Badge,
  ButtonLink,
  Callout,
  Card,
  EmptyState,
  Skeleton,
  TextLink,
} from "@/components/ui";
import { FormWorkbench } from "@/components/hiring/form-workbench";
import { ShareLinks } from "@/components/hiring/share-links";
import { SourceBadge } from "@/components/hiring/source-badge";
import { LoadFailure } from "@/components/portal/load-failure";
import { ExportButton } from "@/components/portal/export-button";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { careersPath, type PostingStatus } from "@/lib/api/careers";
import { fetchFile } from "@/lib/api/download";
import { usePermissions } from "@/lib/permissions";
import {
  DEMO_SETTINGS,
  useCareersSettings,
  usePosting,
  useShareLinks,
} from "@/lib/store/careers-form";

/**
 * One advert: where to share it, and what applicants are asked.
 *
 * The list of adverts is for finding one; this is for the two things you do to an
 * advert after it is written. The links come first because on the day an advert
 * goes live they are the whole job, and the form below them is a thing you set up
 * once.
 *
 * Gated on `MANAGE_HIRING`, like every sibling: the form decides what strangers
 * are asked, and the links are the way their applications are attributed.
 */

const STATUS_LABEL: Record<PostingStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Live",
  CLOSED: "Closed",
};

const STATUS_TONE: Record<PostingStatus, "neutral" | "success" | "warning"> = {
  DRAFT: "neutral",
  PUBLISHED: "success",
  CLOSED: "warning",
};

const CRUMBS = [
  { href: "/hiring", label: "Hiring" },
  { href: "/hiring/postings", label: "Job adverts" },
];

export function PostingScreen({ id }: { id: string }) {
  const { can, loading } = usePermissions();

  if (loading) {
    return (
      <>
        <PageHeader title="Advert" breadcrumb={CRUMBS} />
        <PageBody>
          <Skeleton className="h-40 w-full" />
          <span className="sr-only-focusable">Loading this advert</span>
        </PageBody>
      </>
    );
  }

  if (!can("MANAGE_HIRING")) {
    return (
      <>
        <PageHeader title="Advert" breadcrumb={CRUMBS} />
        <PageBody>
          <Card>
            <EmptyState
              icon={<Lock aria-hidden="true" />}
              title="You cannot open this advert"
              description="The form decides what strangers are asked, so it is kept to whoever hires. Ask whoever manages access to add hiring to your role."
            />
          </Card>
        </PageBody>
      </>
    );
  }

  return <Posting id={id} />;
}

function Posting({ id }: { id: string }) {
  const advert = usePosting(id);
  const settings = useCareersSettings();
  const share = useShareLinks(advert.posting);
  const posting = advert.posting;

  if (advert.loading) {
    return (
      <>
        <PageHeader title="Advert" breadcrumb={CRUMBS} />
        <PageBody>
          <Skeleton className="h-40 w-full" />
          <span className="sr-only-focusable">Loading this advert</span>
        </PageBody>
      </>
    );
  }

  if (!posting) {
    return (
      <>
        <PageHeader title="Advert" breadcrumb={CRUMBS} />
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
                description="It may have been removed, or belong to another company."
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

  const company =
    settings.settings?.branding.name ?? DEMO_SETTINGS.branding.name;
  const live = posting.status === "PUBLISHED";

  return (
    <>
      <PageHeader
        title={posting.title}
        breadcrumb={[
          ...CRUMBS,
          { href: `/hiring/postings/${id}`, label: posting.title },
        ]}
        meta={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[posting.status]} dot>
              {STATUS_LABEL[posting.status]}
            </Badge>
            <SourceBadge live={advert.live} />
          </span>
        }
        action={
          <>
            <ButtonLink
              href={`/hiring/postings/applications?posting=${posting.id}&status=ALL`}
              variant="secondary"
              size="sm"
            >
              <Users aria-hidden="true" className="size-3.5" />
              Applications
              {posting.applicationCount > 0
                ? ` (${posting.applicationCount})`
                : ""}
            </ButtonLink>
            <ButtonLink
              href={`/hiring/postings/${posting.id}/preview`}
              variant="secondary"
              size="sm"
            >
              <Eye aria-hidden="true" className="size-3.5" />
              Preview as an applicant
            </ButtonLink>
          </>
        }
      />

      <PageBody className="flex flex-col gap-6">
        {live && advert.live && (
          <p className="text-body-sm text-muted">
            It is live at{" "}
            <TextLink
              href={careersPath(posting.publicPath)}
              target="_blank"
              rel="noopener noreferrer"
              className="tabular inline-flex items-center gap-1"
            >
              {careersPath(posting.publicPath)}
              <ExternalLink aria-hidden="true" className="size-3" />
            </TextLink>
            .
          </p>
        )}

        {!live && (
          <Callout
            tone="info"
            title={`${posting.title} is ${STATUS_LABEL[posting.status].toLowerCase()}`}
          >
            Set the form up now. Nobody can apply until the advert is published
            from{" "}
            <Link
              href="/hiring/postings"
              className="font-medium text-accent-text underline underline-offset-2"
            >
              Job adverts
            </Link>
            .
          </Callout>
        )}

        <ShareLinks
          links={share.links}
          loading={share.loading}
          error={share.error}
          onAdd={share.addChannel}
          title={posting.title}
        />

        <FormWorkbench
          postingId={posting.id}
          roleTitle={posting.title}
          company={company}
          live={live}
        />

        {advert.live && (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <h3 className="text-body-md font-semibold text-ink">
                  Everyone who applied, with their answers
                </h3>
                <p className="mt-1 text-body-sm text-muted">
                  A spreadsheet with one column per question. Files are
                  described, never linked.
                </p>
              </div>
              <ExportButton
                label="Export applications"
                download={() =>
                  fetchFile(
                    `/careers/postings/${posting.id}/applications.csv`,
                    `applications-${posting.slug}`,
                    undefined,
                    "No spreadsheet was produced.",
                  )
                }
              />
            </div>
          </Card>
        )}
      </PageBody>
    </>
  );
}
