"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Eye,
  Pencil,
  Plus,
  SearchX,
  ThumbsDown,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Input,
  SegmentedControl,
  SkeletonText,
  Stat,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  useToast,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import type { KbArticleListParams } from "@/lib/api/knowledge";
import {
  useKbAnalytics,
  useKbArticle,
  useKbArticles,
  useKbCategories,
} from "@/lib/store/knowledge";
import { ArticleForm } from "./article-form";
import { SectionsPanel } from "./sections-panel";

/**
 * Keeping the knowledge base right.
 *
 * ## The backlog is the screen, not a tab on it
 *
 * "Searches that found nothing" sits above everything else on purpose. It is a
 * list of questions people actually had, in their own words, that the help
 * centre could not answer — a better brief for the next article than anybody's
 * opinion about what staff need. Every row carries the button that turns it into
 * one, with the question already in the title field.
 *
 * The API collapses prefixes before sending it, so these are whole questions
 * rather than the keystrokes on the way to them.
 *
 * ## Reads and votes are on the same row as the title
 *
 * Which article to fix is a comparison, and a comparison needs the numbers
 * beside each other: a heavily-read article with a poor score is urgent, the
 * same score on an article nobody opens is noise. An article with more "no"
 * votes than "yes" is badged as well as scored, because a percentage in a column
 * is easy to scroll past.
 *
 * ## When feedback is switched off, the columns say so
 *
 * The two tables behind votes and the miss log come from a migration that is not
 * part of the Prisma schema. When they are absent the API says so in one plain
 * sentence and every affected panel repeats it. Nothing here renders a zero or
 * an empty list in that case: "nobody has voted" and "we cannot read the votes"
 * look identical on screen and only one of them is something an editor can act
 * on.
 *
 * ## One honest wart
 *
 * Opening **Edit** on a live article fetches the article, and fetching a live
 * article is what counts a read — so an editor opening one adds one to its own
 * view count. The list response carries an excerpt rather than the body, so
 * there is no way to fill the editor without that request. Recorded here rather
 * than worked around, because a workaround would mean caching article bodies in
 * the list and that is a megabyte nobody asked for.
 */
type Filter = "all" | "published" | "draft";
type Order = "views" | "updatedAt" | "title";

const SORTS: Record<Order, { sort: KbArticleListParams["sort"]; order: "asc" | "desc" }> =
  {
    views: { sort: "views", order: "desc" },
    updatedAt: { sort: "updatedAt", order: "desc" },
    title: { sort: "title", order: "asc" },
  };

export function KnowledgeScreen() {
  const toast = useToast();
  const sections = useKbCategories();
  const { analytics, loading: analyticsLoading, unavailable } = useKbAnalytics();

  const [filter, setFilter] = useState<Filter>("all");
  const [order, setOrder] = useState<Order>("views");
  const [search, setSearch] = useState("");

  const articles = useKbArticles({
    status: filter,
    pageSize: 100,
    ...SORTS[order],
    ...(search.trim() ? { q: search.trim() } : {}),
  });

  const [hiding, setHiding] = useState<{ id: string; title: string } | null>(null);
  const [writing, setWriting] = useState<{ suggestedTitle?: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = useKbArticle(editingId);

  const report = (error: unknown) =>
    toast.push({
      title: "That did not work",
      tone: "danger",
      detail:
        error instanceof ApiError
          ? error.message
          : "Something went wrong. Try again.",
    });

  const done = (title: string) => toast.push({ title, tone: "success" });

  const totals = analytics?.totals;

  return (
    <>
      <PageHeader
        title="Help articles"
        description="What people read, what they voted down, and what they could not find."
        breadcrumb={[{ href: "/settings", label: "Settings" }]}
        action={
          <div className="flex items-center gap-2">
            <ButtonLink href="/help/kb" variant="secondary" size="sm">
              Open the help centre
            </ButtonLink>
            {articles.editable && (
              <Button
                variant="accent"
                size="sm"
                onClick={() => setWriting({})}
              >
                <Plus aria-hidden="true" className="size-4" />
                Write an article
              </Button>
            )}
          </div>
        }
      />

      <PageBody className="flex flex-col gap-6">
        {DEMO_ENABLED && !articles.editable && (
          <Callout tone="warning" title="Read-only in demo mode">
            Publishing an article needs the API. Everything on this screen can be
            read; nothing can be saved.
          </Callout>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Articles" value={count(totals?.published ?? 0)} hint="live" />
          <Stat
            label="Drafts"
            value={count(totals?.drafts ?? 0)}
            hint="not visible to staff"
          />
          <Stat label="Reads" value={count(totals?.views ?? 0)} />
          <Stat
            label="Never opened"
            value={count(totals?.neverRead ?? 0)}
            hint="published, no reads"
          />
        </div>

        {/* The editorial backlog. First, because it is the useful one. */}
        <Card>
          <CardHeader
            title="Searches that found nothing"
            description="Questions people typed that no article answers."
            action={
              <SearchX aria-hidden="true" className="size-4 text-faint" />
            }
          />

          {unavailable ? (
            <CardBody>
              <p className="text-body-sm leading-relaxed text-warning-text">
                {unavailable}
              </p>
            </CardBody>
          ) : analyticsLoading ? (
            <CardBody>
              <SkeletonText lines={4} />
            </CardBody>
          ) : (analytics?.unansweredSearches.length ?? 0) === 0 ? (
            <EmptyState
              compact
              icon={<SearchX aria-hidden="true" />}
              title="Every search found something"
              description="Nothing has come up empty yet."
            />
          ) : (
            <TableWrap
              className="rounded-none border-0"
              caption="Searches that returned no articles, most searched first"
            >
              <THead>
                <TH>What they searched for</TH>
                <TH align="right">Times</TH>
                <TH>Last asked</TH>
                <TH>
                  <span className="sr-only-focusable">Action</span>
                </TH>
              </THead>
              <TBody>
                {analytics?.unansweredSearches.map((miss) => (
                  <TR key={miss.term}>
                    <TDPrimary title={`“${miss.term}”`} />
                    <TD align="right" className="tabular">
                      {miss.searches}
                    </TD>
                    <TD className="text-muted">{dayLabel(miss.lastSearchedAt)}</TD>
                    <TD align="right">
                      {articles.editable && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            setWriting({ suggestedTitle: sentence(miss.term) })
                          }
                        >
                          <Pencil aria-hidden="true" className="size-3.5" />
                          Write this article
                        </Button>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          )}
        </Card>

        {!unavailable && (analytics?.leastHelpful.length ?? 0) > 0 && (
          <Card>
            <CardHeader
              title="Where readers said no"
              description="Most “no” votes first, whatever the ratio."
              action={
                <ThumbsDown aria-hidden="true" className="size-4 text-faint" />
              }
            />
            <CardBody className="flex flex-col gap-1.5">
              {analytics?.leastHelpful.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center gap-3 rounded-md border border-line p-3"
                >
                  <Link
                    href={`/help/kb/${row.slug}`}
                    className="min-w-0 flex-1 text-body font-medium text-ink underline-offset-4 hover:text-accent-text hover:underline"
                  >
                    {row.title}
                  </Link>
                  <span className="tabular shrink-0 text-body-sm text-muted">
                    {row.notHelpful} said no · {row.helpful} said yes
                  </span>
                  {row.notHelpful > row.helpful && (
                    <Badge tone="warning" size="sm" dot>
                      Needs a look
                    </Badge>
                  )}
                  {articles.editable && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setEditingId(row.id)}
                    >
                      Fix it
                    </Button>
                  )}
                </div>
              ))}
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader
            title="Every article"
            description="How much each one is read, and how readers rated it."
          />

          <CardBody className="flex flex-wrap items-center gap-3">
            <SegmentedControl<Filter>
              label="Which articles to show"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All" },
                { value: "published", label: "Live" },
                { value: "draft", label: "Drafts" },
              ]}
            />
            <SegmentedControl<Order>
              label="Order"
              value={order}
              onChange={setOrder}
              options={[
                { value: "views", label: "Most read" },
                { value: "updatedAt", label: "Recently changed" },
                { value: "title", label: "A–Z" },
              ]}
            />
            <div className="min-w-[13rem] flex-1">
              <Input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Find an article by title"
                aria-label="Find an article by title"
              />
            </div>
          </CardBody>

          {articles.error && (
            <CardBody>
              <p className="text-body-sm text-danger-text">
                {articles.error.message}
              </p>
            </CardBody>
          )}

          {articles.loading ? (
            <CardBody>
              <SkeletonText lines={6} />
            </CardBody>
          ) : articles.articles.length === 0 ? (
            <EmptyState
              icon={<BookOpen aria-hidden="true" />}
              title={search.trim() ? "No article with that title" : "No articles yet"}
              description={
                search.trim()
                  ? "Try fewer words — this searches titles only."
                  : "Start with the question people ask most."
              }
              action={
                articles.editable && !search.trim() ? (
                  <Button
                    variant="accent"
                    size="sm"
                    onClick={() => setWriting({})}
                  >
                    Write the first article
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <TableWrap
              className="rounded-none border-0"
              caption="Every article with its reads and how readers rated it"
            >
              <THead>
                <TH>Article</TH>
                <TH align="right">Reads</TH>
                <TH>Helpful?</TH>
                <TH>State</TH>
                <TH>
                  <span className="sr-only-focusable">Actions</span>
                </TH>
              </THead>
              <TBody>
                {articles.articles.map((article) => {
                  const votes = article.helpful + article.notHelpful;
                  const poor =
                    !unavailable && article.notHelpful > article.helpful && votes > 0;
                  return (
                    <TR key={article.id}>
                      <TDPrimary
                        title={
                          article.status === "published" ? (
                            <Link
                              href={`/help/kb/${article.slug}`}
                              className="underline-offset-4 hover:text-accent-text hover:underline"
                            >
                              {article.title}
                            </Link>
                          ) : (
                            article.title
                          )
                        }
                        subtitle={article.categoryName ?? "No section"}
                      />
                      <TD align="right">
                        <span className="tabular inline-flex items-center gap-1.5 text-muted">
                          <Eye aria-hidden="true" className="size-3.5" />
                          {count(article.views)}
                        </span>
                      </TD>
                      <TD>
                        {unavailable ? (
                          <span className="text-body-sm text-muted">
                            Not switched on
                          </span>
                        ) : votes === 0 ? (
                          <span className="text-body-sm text-faint">
                            No votes yet
                          </span>
                        ) : (
                          <span className="flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                "tabular text-body-sm",
                                poor ? "font-medium text-ink" : "text-muted",
                              )}
                            >
                              {article.helpfulness}% of {votes}
                            </span>
                            {poor && (
                              <Badge tone="warning" size="sm" dot>
                                Needs a look
                              </Badge>
                            )}
                          </span>
                        )}
                      </TD>
                      <TD>
                        {article.status === "published" ? (
                          <Badge tone="neutral" size="sm">
                            Live
                          </Badge>
                        ) : (
                          <Badge tone="warning" size="sm" dot>
                            Draft
                          </Badge>
                        )}
                      </TD>
                      <TD align="right">
                        {articles.editable && (
                          <span className="flex justify-end gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingId(article.id)}
                            >
                              Edit
                            </Button>
                            {article.status === "draft" ? (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() =>
                                  void articles
                                    .publish(article.id)
                                    .then(() => done(`${article.title} is live`))
                                    .catch(report)
                                }
                              >
                                Publish
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setHiding({
                                    id: article.id,
                                    title: article.title,
                                  })
                                }
                              >
                                Hide
                              </Button>
                            )}
                          </span>
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </TableWrap>
          )}

          {articles.articles.length > 0 &&
            articles.total > articles.articles.length && (
              <CardBody className="border-t border-line">
                <p className="text-body-sm text-muted">
                  Showing {count(articles.articles.length)} of{" "}
                  {count(articles.total)}. Narrow it with the search box above.
                </p>
              </CardBody>
            )}
        </Card>

        <SectionsPanel
          sections={sections}
          onProblem={(message) =>
            toast.push({ title: "That did not work", tone: "danger", detail: message })
          }
          onDone={done}
        />
      </PageBody>

      {/* Reversible in one click, and the API's own note says so — but it
          changes what every member of staff sees, so it is asked first. */}
      <ConfirmDialog
        open={hiding !== null}
        onClose={() => setHiding(null)}
        title={`Hide ${hiding?.title ?? ""}?`}
        confirmLabel="Hide it"
        tone="danger"
        body="Staff stop seeing it straight away. Nothing is deleted — publish it again whenever you like."
        onConfirm={() => {
          if (!hiding) return;
          void articles
            .hide(hiding.id)
            .then((result) => {
              toast.push({
                title: `${hiding.title} is hidden`,
                tone: "info",
                detail: result.note,
              });
              setHiding(null);
            })
            .catch(report);
        }}
      />

      {writing && (
        <ArticleForm
          open
          article={null}
          sections={sections.flat}
          {...(writing.suggestedTitle
            ? { suggestedTitle: writing.suggestedTitle }
            : {})}
          onClose={() => setWriting(null)}
          onCreate={async (body) => {
            const created = await articles.create(body);
            done(
              body.publish
                ? `${created.title} is live`
                : `${created.title} saved as a draft`,
            );
            setWriting(null);
          }}
          onSave={async () => {
            /* Unreachable: this dialog is in create mode. */
          }}
        />
      )}

      {editingId && editing.article && (
        <ArticleForm
          key={editingId}
          open
          article={editing.article}
          sections={sections.flat}
          onClose={() => setEditingId(null)}
          onCreate={async () => {
            /* Unreachable: this dialog is in edit mode. */
          }}
          onSave={async (id, body) => {
            const saved = await articles.update(id, body);
            done(`${saved.title} saved`);
            setEditingId(null);
          }}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * `19 Aug 2026`, formatted by hand.
 *
 * Not `toLocaleDateString`: this component renders on the server as well, and a
 * server in one locale and a browser in another produce two different strings
 * for the same date, which React reports as a hydration mismatch.
 */
function dayLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()] ?? ""} ${date.getUTCFullYear()}`;
}

/**
 * `1,200`, grouped by hand.
 *
 * Not `toLocaleString`: this renders on the server too, and a server and a
 * browser in different locales produce two different strings for the same
 * number — which React reports as a hydration mismatch.
 */
const count = (value: number): string =>
  value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** "13th month" → "13th month". "how do i…" → "How do i…". */
function sentence(term: string): string {
  return term.charAt(0).toUpperCase() + term.slice(1);
}
