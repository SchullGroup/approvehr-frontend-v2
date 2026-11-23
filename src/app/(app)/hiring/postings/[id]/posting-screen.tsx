"use client";

import { useState } from "react";
import { ExternalLink, Eye, Lock, Send, Users } from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  EmptyState,
  Skeleton,
  Tabs,
  TextLink,
  useToast,
} from "@/components/ui";
import { PublishAdvertDialog } from "@/components/hiring/publish-advert-dialog";
import { FormWorkbench } from "@/components/hiring/form-workbench";
import { ScreeningWorkbench } from "@/components/hiring/screening/screening-workbench";
import { ShareLinks } from "@/components/hiring/share-links";
import { SourceBadge } from "@/components/hiring/source-badge";
import { LoadFailure } from "@/components/portal/load-failure";
import { ExportButton } from "@/components/portal/export-button";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { LIVE_TONE, careersApi, careersPath, liveOf } from "@/lib/api/careers";
import { actionMessage } from "@/lib/use-action";
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

const CRUMBS = [
  { href: "/hiring", label: "Hiring" },
  { href: "/hiring/postings", label: "Job adverts" },
];

export type PostingTab = "form" | "screening";

export function PostingScreen({
  id,
  initialTab = "form",
}: {
  id: string;
  /** Which tab a link asked for: `?tab=screening`. */
  initialTab?: PostingTab;
}) {
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
              plain
              icon={<Lock aria-hidden="true" />}
              title="You cannot open this advert"
              description="The form decides what strangers are asked, so it is kept to whoever hires. Ask whoever manages access to add hiring to your role."
            />
          </Card>
        </PageBody>
      </>
    );
  }

  return <Posting id={id} initialTab={initialTab} />;
}

function Posting({ id, initialTab }: { id: string; initialTab: PostingTab }) {
  const advert = usePosting(id);
  const settings = useCareersSettings();
  const share = useShareLinks(advert.posting);
  const posting = advert.posting;
  const [tab, setTab] = useState<PostingTab>(initialTab);
  const toast = useToast();
  /* Publish lives on the advert as well as on Job adverts (UAT 23 Nov, U99 /
     PERF-19): this page used to say it could only be published from there. */
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const publish = async () => {
    setPublishing(true);
    try {
      await careersApi.publishPosting(id);
      setPublishOpen(false);
      toast.push({
        title: `${advert.posting?.title ?? "The advert"} is live`,
        tone: "success",
      });
      advert.reload();
    } catch (error) {
      toast.push({
        title: "Not published",
        tone: "danger",
        detail: actionMessage(error),
      });
    } finally {
      setPublishing(false);
    }
  };

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
                plain
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
  /* What is shown follows whether it is live (U90 / PERF-10): a published
     advert past its closing date is closed. Publish follows the stored status,
     which is what it changes. */
  const shown = liveOf(posting);
  const live = shown.state === "LIVE";
  const published = posting.status === "PUBLISHED";

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
            <Badge tone={LIVE_TONE[shown.state]} dot>
              {shown.label}
            </Badge>
            <SourceBadge live={advert.live} />
          </span>
        }
        action={
          <>
            {!published && advert.live && (
              <Button size="sm" onClick={() => setPublishOpen(true)}>
                <Send aria-hidden="true" className="size-3.5" />
                {posting.status === "CLOSED" ? "Publish again" : "Publish"}
              </Button>
            )}
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
            title={
              shown.state === "DRAFT"
                ? `${posting.title} is a draft`
                : `${posting.title}: ${shown.label}`
            }
          >
            {shown.state === "DRAFT"
              ? "Set the form up, then publish it. Nobody can apply until then."
              : published
                ? "Its closing date has passed, so nobody can apply. Change the closing date to take applications again."
                : "Nobody can apply. Publish it again to take applications."}
          </Callout>
        )}

        <PublishAdvertDialog
          posting={posting}
          open={publishOpen}
          busy={publishing}
          onClose={() => setPublishOpen(false)}
          onPublish={() => void publish()}
        />

        <Tabs
          items={[
            { id: "form", label: "Form and links" },
            { id: "screening", label: "Screening" },
          ]}
          value={tab}
          onChange={(next) => {
            const chosen: PostingTab =
              next === "screening" ? "screening" : "form";
            setTab(chosen);
            /* Kept in the address so the tab can be linked to and survives a
               reload; no navigation, nothing to fetch. */
            window.history.replaceState(
              null,
              "",
              chosen === "form"
                ? `/hiring/postings/${posting.id}`
                : `/hiring/postings/${posting.id}?tab=screening`,
            );
          }}
        >
          {tab === "screening" ? (
            <ScreeningWorkbench postingId={posting.id} />
          ) : (
            <div className="flex flex-col gap-6">
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
            </div>
          )}
        </Tabs>
      </PageBody>
    </>
  );
}
