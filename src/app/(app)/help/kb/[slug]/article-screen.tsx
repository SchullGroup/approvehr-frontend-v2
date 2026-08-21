"use client";

import Link from "next/link";
import {
  BookOpen,
  Check,
  Eye,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardFooter,
  EmptyState,
  SkeletonText,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { Can } from "@/lib/permissions";
import { useKbArticle } from "@/lib/store/knowledge";

/**
 * One article.
 *
 * ## The vote at the foot is two buttons and nothing else
 *
 * No form, no comment box, no "tell us more". The question a knowledge base
 * cannot answer on its own is "which of these articles is wrong", and one click
 * answers it. Asking for a paragraph as well is how you get no clicks.
 *
 * A second click **changes** your answer rather than adding to it — the API
 * upserts one row per person per article, and the buttons stay live and marked
 * so the interface says the same thing.
 *
 * ## "No" gets a way forward, not an apology
 *
 * Somebody who says an article did not help still has their original problem.
 * The button beside the answer takes them to the help desk, which is the thing
 * that actually resolves it.
 *
 * ## When feedback is switched off
 *
 * The two tables behind it are created by a migration that is not part of the
 * Prisma schema, so a database without it is a real state. The API refuses the
 * vote with a sentence naming what to do; that sentence replaces the buttons.
 * A tally of zero in its place would read as "nobody has voted", which is a
 * different and much more discouraging fact.
 */
export function ArticleScreen({ slug }: { slug: string }) {
  const {
    article,
    loading,
    error,
    notFound,
    yourVote,
    tally,
    feedbackRefusal,
    vote,
  } = useKbArticle(slug);

  if (loading) {
    return (
      <>
        <PageHeader
          title="Help article"
          breadcrumb={[
            { href: "/help", label: "Help desk" },
            { href: "/help/kb", label: "Help articles" },
          ]}
        />
        <PageBody>
          <Card>
            <CardBody>
              <SkeletonText lines={8} />
            </CardBody>
          </Card>
        </PageBody>
      </>
    );
  }

  if (!article) {
    return (
      <>
        <PageHeader
          title="Help article"
          breadcrumb={[
            { href: "/help", label: "Help desk" },
            { href: "/help/kb", label: "Help articles" },
          ]}
        />
        <PageBody>
          <Card>
            <EmptyState
              icon={<BookOpen aria-hidden="true" />}
              title={notFound ? "That article is not here" : "Could not open that"}
              description={
                notFound
                  ? "It may have been taken down while somebody rewrites it."
                  : (error?.message ??
                    "Something went wrong reading it. Try again.")
              }
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <ButtonLink href="/help/kb" variant="secondary" size="sm">
                    All help articles
                  </ButtonLink>
                  <ButtonLink href="/help" variant="accent" size="sm">
                    Ask the help desk
                  </ButtonLink>
                </div>
              }
            />
          </Card>
        </PageBody>
      </>
    );
  }

  const paragraphs = article.body
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  return (
    <>
      <PageHeader
        title={article.title}
        breadcrumb={[
          { href: "/help", label: "Help desk" },
          { href: "/help/kb", label: "Help articles" },
        ]}
        meta={
          <>
            {article.status === "draft" && (
              <Badge tone="warning" size="sm" dot>
                Draft — staff cannot see this yet
              </Badge>
            )}
            {article.section.map((section) => (
              <Badge key={section.id} tone="neutral" size="sm">
                {section.name}
              </Badge>
            ))}
          </>
        }
        action={
          <Can permission="MANAGE_SETTINGS">
            <ButtonLink href="/settings/knowledge" variant="secondary" size="sm">
              Manage articles
            </ButtonLink>
          </Can>
        }
      />

      <PageBody className="flex flex-col gap-5">
        <Card className="max-w-3xl">
          <CardBody className="flex flex-col gap-4">
            {paragraphs.map((block, index) => (
              <p
                key={index}
                className="text-body leading-relaxed text-body"
              >
                {block}
              </p>
            ))}
          </CardBody>

          <CardFooter className="flex flex-wrap items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-meta text-muted">
              <Eye aria-hidden="true" className="size-3.5" />
              <span className="tabular">{article.views}</span>
              {article.views === 1 ? "read" : "reads"}
              {tally.helpfulness !== null && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="tabular">{tally.helpfulness}%</span>
                  of {tally.helpful + tally.notHelpful} said it helped
                </>
              )}
            </span>
            <Link
              href="/help/kb"
              className="text-body-sm text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              All help articles
            </Link>
          </CardFooter>
        </Card>

        <Card className="max-w-3xl">
          <CardBody className="flex flex-col gap-3">
            <p className="text-body font-medium text-ink">
              Was this helpful?
            </p>

            {feedbackRefusal ? (
              /* The API's own sentence. It names what is missing and what fixes
                 it, which is more than this screen could say. */
              <p className="text-body-sm leading-relaxed text-warning-text">
                {feedbackRefusal}
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <VoteButton
                    chosen={yourVote === "helpful"}
                    onClick={() => void vote(true)}
                    icon={<ThumbsUp aria-hidden="true" className="size-4" />}
                  >
                    Yes, it helped
                  </VoteButton>
                  <VoteButton
                    chosen={yourVote === "not-helpful"}
                    onClick={() => void vote(false)}
                    icon={<ThumbsDown aria-hidden="true" className="size-4" />}
                  >
                    No, it did not
                  </VoteButton>
                </div>

                {yourVote === "helpful" && (
                  <p className="text-body-sm text-muted">
                    Saved — you said yes.
                  </p>
                )}

                {yourVote === "not-helpful" && (
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-body-sm text-muted">
                      Saved — you said no.
                    </p>
                    <ButtonLink href="/help" variant="accent" size="sm">
                      Ask the help desk
                    </ButtonLink>
                  </div>
                )}
              </>
            )}
          </CardBody>
        </Card>
      </PageBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * One of the two answers.
 *
 * The chosen one is marked three ways — `aria-pressed`, a tick, and a filled
 * button — because a state carried by colour alone is a state half the readers
 * cannot see. Never the `approve` variant: green in this product means somebody
 * approved something with money or employment behind it.
 */
function VoteButton({
  chosen,
  onClick,
  icon,
  children,
}: {
  chosen: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant={chosen ? "primary" : "secondary"}
      size="sm"
      aria-pressed={chosen}
      onClick={onClick}
      className={cn(chosen && "ring-3 ring-accent/25")}
    >
      {chosen ? <Check aria-hidden="true" className="size-4" /> : icon}
      {children}
    </Button>
  );
}
