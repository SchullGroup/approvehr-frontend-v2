"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronRight, Eye, FolderOpen, Library } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Badge,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  SkeletonText,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { Can } from "@/lib/permissions";
import { useKbArticles, useKbCategories } from "@/lib/store/knowledge";
import type { ApiKbCategory } from "@/lib/api/knowledge";
import { KbSearch } from "./kb-search";

/**
 * The help centre, as staff read it.
 *
 * ## One route per concept
 *
 * There is no separate "browse" and "manage" reader. This screen is what
 * everybody sees; the only thing role changes is the one link to the editor,
 * which appears for whoever can actually use it. An article has its own route
 * so that the URL somebody pastes into a group chat opens the article.
 *
 * ## The number beside a section is what clicking it will show
 *
 * `published`, not `totalArticles`. Filtering by a section returns the articles
 * filed *directly* in it — a parent does not absorb its children's — and drafts
 * are not in a reader's list at all. Any other number here would be a count that
 * disagrees with the list beside it, which is the kind of small lie that makes
 * somebody stop trusting a screen.
 *
 * ## Drafts are absent, not greyed out
 *
 * The API decides that, not this screen: a reader's list simply does not contain
 * them, and a reader who guesses a draft slug gets "not here". Nothing here
 * filters on `status`, so there is no chance of a screen leaking the existence
 * of a half-written policy.
 */
export function KbScreen() {
  const sections = useKbCategories();
  const [selected, setSelected] = useState<string | null>(null);

  /* `status: "published"` is sent even though the API forces it for a reader:
     an editor opening this screen should see what staff see, not their drafts. */
  const articles = useKbArticles({
    status: "published",
    sort: "views",
    order: "desc",
    pageSize: 100,
    ...(selected ? { categoryId: selected } : {}),
  });

  const selectedName = selected
    ? (sections.flat.find((s) => s.id === selected)?.name ?? null)
    : null;

  return (
    <>
      <PageHeader
        title="Help articles"
        description="Answers to the things people ask most. Search it before you raise a ticket."
        breadcrumb={[{ href: "/help", label: "Help desk" }]}
        action={
          <Can permission="MANAGE_SETTINGS">
            <ButtonLink href="/settings/knowledge" variant="secondary" size="sm">
              Manage articles
            </ButtonLink>
          </Can>
        }
      />

      <PageBody className="flex flex-col gap-6">
        <Card>
          <CardBody>
            <KbSearch />
          </CardBody>
        </Card>

        <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
          <nav aria-label="Sections" className="flex flex-col gap-1">
            <SectionButton
              label="Everything"
              count={sections.counts.published}
              icon={<Library aria-hidden="true" />}
              active={selected === null}
              onClick={() => setSelected(null)}
            />
            {sections.tree.map((node) => (
              <SectionBranch
                key={node.id}
                node={node}
                selected={selected}
                onSelect={setSelected}
              />
            ))}
            {sections.loading && (
              <div className="p-2">
                <SkeletonText lines={3} />
              </div>
            )}
          </nav>

          <Card>
            <CardHeader
              title={selectedName ?? "Everything"}
              description={
                articles.total === 1
                  ? "1 article"
                  : `${articles.total} articles, most read first`
              }
            />

            {articles.error && (
              <CardBody>
                <p className="text-[0.875rem] text-danger-text">
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
                title="Nothing here yet"
                description={
                  selectedName
                    ? `No articles are filed in ${selectedName} yet.`
                    : "No articles have been published yet."
                }
                action={
                  <ButtonLink href="/help" variant="accent" size="sm">
                    Ask the help desk
                  </ButtonLink>
                }
              />
            ) : (
              <CardBody className="flex flex-col gap-1.5">
                {articles.articles.map((article) => (
                  <Link
                    key={article.id}
                    href={`/help/kb/${article.slug}`}
                    className={cn(
                      "group flex items-start gap-3 rounded-md border border-line p-3.5",
                      "transition-colors duration-100 hover:bg-canvas",
                      "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/25",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[0.9375rem] font-medium text-ink">
                          {article.title}
                        </span>
                        {article.categoryName && selected === null && (
                          <Badge tone="neutral" size="sm">
                            {article.categoryName}
                          </Badge>
                        )}
                      </span>
                      <span className="mt-1 block text-[0.875rem] leading-relaxed text-muted">
                        {article.excerpt}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 text-[0.75rem] text-muted">
                      <Eye aria-hidden="true" className="size-3.5" />
                      <span className="tabular">{article.views}</span>
                      <span className="sr-only-focusable">
                        {article.views === 1 ? "read once" : "reads"}
                      </span>
                    </span>
                  </Link>
                ))}
              </CardBody>
            )}
          </Card>
        </div>
      </PageBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */

/** A section and everything under it, indented by depth. */
function SectionBranch({
  node,
  selected,
  onSelect,
}: {
  node: ApiKbCategory;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <SectionButton
        label={node.name}
        count={node.published}
        depth={node.depth}
        icon={<FolderOpen aria-hidden="true" />}
        active={selected === node.id}
        onClick={() => onSelect(node.id)}
      />
      {node.children.map((child) => (
        <SectionBranch
          key={child.id}
          node={child}
          selected={selected}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

function SectionButton({
  label,
  count,
  icon,
  active,
  depth = 0,
  onClick,
}: {
  label: string;
  count: number;
  icon: React.ReactNode;
  active: boolean;
  depth?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      style={depth > 0 ? { marginLeft: depth * 14 } : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-[0.875rem]",
        "transition-colors duration-100",
        "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/25",
        active
          ? "bg-accent-soft font-medium text-accent-text"
          : "text-body hover:bg-canvas hover:text-ink",
      )}
    >
      <span aria-hidden="true" className="shrink-0 [&>svg]:size-4">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="tabular shrink-0 text-[0.75rem] text-muted">{count}</span>
      {active && (
        <ChevronRight aria-hidden="true" className="size-3.5 shrink-0" />
      )}
    </button>
  );
}
