"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Users } from "lucide-react";
import {
  Badge,
  Callout,
  Card,
  CardBody,
  EmptyState,
  Input,
  Skeleton,
  Stat,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { LoadFailure } from "@/components/portal/load-failure";
import { employees, type ApiOrgChart, type ApiOrgNode } from "@/lib/api/endpoints";
import { useSession } from "@/lib/store/session";
import { cn } from "@/lib/cn";

/**
 * Who reports to whom.
 *
 * ## Why this screen did not exist
 *
 * `Employee.managerId` has been on the model since it was written, the seed has
 * three levels of it, and every competitor ships an org chart. Nothing in this
 * product ever rendered one — the fourth instance of the class `HANDOVER.md`
 * keeps recording: a capability present, correct, and findable by nobody.
 *
 * ## An outline, not a canvas
 *
 * The obvious build is boxes and connector lines. This is a nested list, and
 * the reason is the audience: a Nigerian SME owner-manager reading on a phone,
 * where a 200-person canvas is a pan-and-zoom puzzle. An outline searches,
 * collapses, reads top to bottom on any width, and gets keyboard and screen
 * reader support from the markup rather than from an accessibility pass
 * somebody has to remember.
 *
 * ## No salary, deliberately
 *
 * The payload carries none at any permission — see `orgChart` on the API. The
 * rule `walk-payroll` left behind is gate the money, not the tree, and the way
 * to keep that true is for pay not to be in this request at all.
 */
export function OrgChartScreen() {
  const { isConnected } = useSession();
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [reloadAt, setReloadAt] = useState(0);

  /**
   * Staleness by comparing a key during render, never by a `setLoading(true)`
   * inside the effect — that is a synchronous setState in an effect, which
   * cascades a render for nothing and is what `npm run check` refuses. Same
   * shape as `lib/store/shifts.ts`.
   */
  const key = String(reloadAt);
  const [fetched, setFetched] = useState<{
    key: string;
    chart: ApiOrgChart | null;
    error: Error | null;
  } | null>(null);

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    void (async () => {
      try {
        const chart = await employees.orgChart();
        if (!cancelled) setFetched({ key, chart, error: null });
      } catch (caught) {
        if (!cancelled) {
          setFetched({
            key,
            chart: null,
            error: caught instanceof Error ? caught : new Error("failed"),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected, key]);

  const matched = fetched !== null && fetched.key === key;
  const chart = matched ? fetched.chart : null;
  const error = matched ? fetched.error : null;
  const loading = isConnected && !matched;

  /**
   * Filtering keeps the shape.
   *
   * A flat list of matches would answer "who is called Ada" and lose the thing
   * somebody opened an org chart for — where they sit. So a branch survives if
   * it matches *or* anything under it does, and the path down to a match stays
   * visible.
   */
  const shown = useMemo(() => {
    if (!chart) return [];
    const needle = query.trim().toLowerCase();
    if (needle === "") return chart.roots;

    const prune = (node: ApiOrgNode): ApiOrgNode | null => {
      const kept = node.reports.map(prune).filter((n): n is ApiOrgNode => n !== null);
      const hit =
        node.name.toLowerCase().includes(needle) ||
        node.jobTitle.toLowerCase().includes(needle) ||
        (node.department ?? "").toLowerCase().includes(needle);
      if (!hit && kept.length === 0) return null;
      return { ...node, reports: kept };
    };
    return chart.roots.map(prune).filter((n): n is ApiOrgNode => n !== null);
  }, [chart, query]);

  const searching = query.trim() !== "";

  if (!isConnected) {
    return (
      <>
        <PageHeader title="Org chart" />
        <PageBody>
          <EmptyState
            icon={<Users aria-hidden="true" />}
            title="The org chart needs the API"
            description="It is read from the reporting line on everybody's record, which only exists on a server."
          />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Org chart" />
      <PageBody className="flex flex-col gap-6">
        {loading && !chart ? (
          <Skeleton className="h-72 w-full" />
        ) : error ? (
          <LoadFailure
            subject="the org chart"
            error={error}
            onRetry={() => setReloadAt((n) => n + 1)}
          />
        ) : !chart || chart.roots.length === 0 ? (
          <EmptyState
            icon={<Users aria-hidden="true" />}
            title="Nobody has a manager yet"
            description="Set who somebody reports to on their record and they appear here."
          />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <Stat label="People on the chart" value={chart.covered.toLocaleString()} />
              <Stat
                label="At the top"
                value={chart.roots.length.toLocaleString()}
                hint="nobody above them"
              />
              <Stat
                label="Broken reporting lines"
                value={chart.detached.length.toLocaleString()}
                {...(chart.detached.length > 0
                  ? { hint: "loops — see below" }
                  : { hint: "none" })}
              />
            </div>

            {chart.detached.length > 0 && (
              /* Named rather than quietly straightened out. A loop is somebody's
                 record being wrong, and only a person can say which link is the
                 mistaken one. */
              <Callout tone="warning" title="Some reporting lines loop back on themselves">
                {chart.detached.map((person) => person.name).join(", ")} —{" "}
                {chart.detached.length === 1 ? "this person reports" : "these people report"}{" "}
                into a circle, so they are shown at the top until somebody corrects
                who they report to.
              </Callout>
            )}

            <Card>
              <CardBody className="flex flex-col gap-4">
                <div className="max-w-sm">
                  <Input
                    value={query}
                    placeholder="Find a person, a job title or a department"
                    aria-label="Search the org chart"
                    onChange={(event) => {
                      const next = event.target.value;
                      setQuery(next);
                    }}
                  />
                </div>

                {shown.length === 0 ? (
                  <p className="text-body-sm text-muted">
                    Nobody matches “{query.trim()}”.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {shown.map((node) => (
                      <Branch
                        key={node.id}
                        node={node}
                        depth={0}
                        /* While searching, everything is open — collapsing a
                           branch that only exists because of a match would hide
                           the match. */
                        collapsed={searching ? new Set() : collapsed}
                        onToggle={(id) =>
                          setCollapsed((current) => {
                            const next = new Set(current);
                            if (next.has(id)) next.delete(id);
                            else next.add(id);
                            return next;
                          })
                        }
                      />
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </>
        )}
      </PageBody>
    </>
  );
}

/**
 * One person and everybody under them.
 *
 * A real `<ul>`/`<li>` tree, so a screen reader announces the nesting and the
 * position in it without any of that being wired by hand. Indentation is
 * padding on the row rather than a nested container, which keeps a deep chart
 * from marching off the right edge of a phone.
 */
function Branch({
  node,
  depth,
  collapsed,
  onToggle,
}: {
  node: ApiOrgNode;
  depth: number;
  collapsed: ReadonlySet<string>;
  onToggle: (id: string) => void;
}) {
  const hasReports = node.reports.length > 0;
  const isOpen = !collapsed.has(node.id);

  return (
    <li>
      <div
        className="flex items-start gap-2 rounded-md py-1.5 pr-2 hover:bg-canvas"
        /* Capped so a tenth level still leaves room for a name on a phone. */
        style={{ paddingLeft: `${String(Math.min(depth, 8) * 18)}px` }}
      >
        {hasReports ? (
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            aria-expanded={isOpen}
            aria-label={`${isOpen ? "Hide" : "Show"} everybody under ${node.name}`}
            className="mt-0.5 shrink-0 rounded text-muted hover:text-ink"
          >
            {isOpen ? (
              <ChevronDown aria-hidden="true" className="size-4" />
            ) : (
              <ChevronRight aria-hidden="true" className="size-4" />
            )}
          </button>
        ) : (
          /* Keeps the names in a column whether or not somebody has reports. */
          <span className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        )}

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <a
              href={`/people/${node.id}`}
              className={cn(
                "text-body-sm font-medium text-ink hover:text-accent-text hover:underline",
                "underline-offset-4",
              )}
            >
              {node.name}
            </a>
            <span className="text-meta text-muted">{node.jobTitle}</span>
            {node.department && (
              <Badge tone="neutral" size="sm">
                {node.department}
              </Badge>
            )}
            {node.totalBelow > 0 && (
              <span className="text-meta text-faint tabular">
                {node.totalBelow} below
              </span>
            )}
          </p>
        </div>
      </div>

      {hasReports && isOpen && (
        <ul className="flex flex-col gap-1">
          {node.reports.map((child) => (
            <Branch
              key={child.id}
              node={child}
              depth={depth + 1}
              collapsed={collapsed}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
