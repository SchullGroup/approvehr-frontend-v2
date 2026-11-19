"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  Bell,
  BookOpen,
  Clock,
  Cpu,
  LifeBuoy,
  MessageSquare,
  Search,
  ShieldCheck,
  Check,
  FileText,
  Gauge,
  ListChecks,
  BriefcaseBusiness,
  ClipboardCheck,
  Megaphone,
  ScrollText,
  Sparkles,
  SunMoon,
  Timer,
  Users,
  Plug,
  /* Webhook — with the Webhooks card below, commented out for now. */
  ToggleRight,
} from "lucide-react";
import { Callout, Input, LinkCard, ProgressMeter } from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { useSettingsSearchHistory } from "@/lib/store/settings-search-history";
import { useSetupChecklist } from "@/lib/store/setup-checklist";
import { BillingCard, useBillingStatus } from "./billing-card";
import { Row } from "./setup-row";
import { checklistProgress, checklistRows } from "./checklist";
import {
  BILLING,
  PAGE_MODULE,
  PAGE_WORDS,
  SETTINGS_PAGES,
  ROW_MODULE,
  ROW_WORDS,
  firstSentence,
  matches,
  termsOf,
} from "./filter";

/**
 * Settings — one place to set the company up.
 *
 * ## What this page used to be, and why it changed
 *
 * Eight `LinkCard`s in four groups. Every card was a real link and none of them
 * said whether there was anything behind it, so the page answered "here are
 * eight pages" and the question people arrive with is "what do I still need to
 * set up". The parameters of a company — how many offices, which employee fields
 * are asked for, leave types, holidays, pay setup — sit on a dozen screens, and
 * nothing presented them as one job.
 *
 * So the seven that constitute *setting the company up* are a checklist, each
 * row carrying its own state and what it affects, and the rest — the noticeboard,
 * the knowledge base, notifications, integrations, webhooks, the audit trail —
 * are below it as an index, which is the right shape for things that are ongoing
 * rather than a task with an end.
 *
 * The judgement about what "done" means is in `./checklist.ts`, deliberately
 * apart from the layout: it is a page of sentences and conditions, and mixing it
 * into JSX is how a sentence ends up written twice.
 *
 * ## Every row links somewhere real
 *
 * There are no "not built yet" cards on this page and there must never be. The
 * project's own rule is that nothing links at a page that is not there, and a
 * checklist is the worst place to break it — a row somebody cannot act on is
 * worse than a row that does not exist, because it looks like their fault.
 */

/**
 * The things that are not setup.
 *
 * Kept as plain links on purpose: none of them has a finished state. A company
 * does not complete its noticeboard. Putting them in the checklist would give
 * the count a denominator that never falls to zero, which is how a checklist
 * stops being read.
 */
const ICONS: Record<string, React.ReactNode> = {
  "/settings/features": <ToggleRight aria-hidden="true" />,
  "/settings/job-roles": <BriefcaseBusiness aria-hidden="true" />,
  "/settings/queries": <MessageSquare aria-hidden="true" />,
  "/settings/required-details": <ClipboardCheck aria-hidden="true" />,
  "/settings/announcements": <Megaphone aria-hidden="true" />,
  "/settings/security": <ShieldCheck aria-hidden="true" />,
  "/settings/helpdesk": <LifeBuoy aria-hidden="true" />,
  "/settings/knowledge": <BookOpen aria-hidden="true" />,
  "/settings/policies": <ScrollText aria-hidden="true" />,
  "/settings/attendance": <Clock aria-hidden="true" />,
  "/settings/devices": <Cpu aria-hidden="true" />,
  "/settings/overtime": <Timer aria-hidden="true" />,
  "/settings/performance": <Gauge aria-hidden="true" />,
  "/settings/notifications": <Bell aria-hidden="true" />,
  "/settings/sms": <MessageSquare aria-hidden="true" />,
  "/settings/appearance": <SunMoon aria-hidden="true" />,
  "/settings/ai": <Sparkles aria-hidden="true" />,
  "/settings/integrations": <Plug aria-hidden="true" />,
  "/settings/audit": <FileText aria-hidden="true" />,
  "/people": <Users aria-hidden="true" />,
};

/* The settings pages are data in `./filter` (the global search reads them too);
   this adds the icon. Comments about individual pages moved with their data
   to git history, not to the file. */
const ONGOING = SETTINGS_PAGES.map((page) => ({
  ...page,
  icon: ICONS[page.href],
}));

/**
 * The setup checklist, as one small link beside the search box.
 *
 * It used to be a full-width card above everything else, open while anything
 * was outstanding, and it pushed the page the owner came for below the fold.
 * The count and the bar stay, because they are what makes the link worth
 * pressing; the rows moved to their own page (`/settings/setup`), which is
 * where "what is still to set up" gets answered in full.
 *
 * Drawn only once the checklist has answered: a bar beside a number nobody has
 * worked out yet would be a figure with nothing under it.
 */
function SetupLink({
  loading,
  progress,
  complete,
}: {
  loading: boolean;
  progress: ReturnType<typeof checklistProgress>;
  complete: boolean;
}) {
  if (loading || progress.total === 0) return null;
  return (
    <Link
      href="/settings/setup"
      className="inline-flex min-h-10 items-center gap-3 rounded-md border border-line bg-surface px-3 py-1.5 hover:border-line-strong"
    >
      {complete ? (
        <Check aria-hidden="true" className="size-4 text-success-text" />
      ) : (
        <ListChecks aria-hidden="true" className="size-4 text-muted" />
      )}
      <span className="flex flex-col gap-1">
        <span className="text-meta font-semibold text-ink">
          {complete
            ? "Company set up"
            : `Setting up: ${progress.done} of ${progress.total} done`}
        </span>
        <ProgressMeter
          value={progress.done}
          max={progress.total}
          tone={complete ? "success" : "accent"}
          size="sm"
          showValue={false}
        />
      </span>
      <ArrowRight aria-hidden="true" className="size-3.5 text-muted" />
    </Link>
  );
}

export function SettingsScreen() {
  /* No year argument. Connected, the API answers from its own clock and says
     which year it used; offline the hook uses the demo's fixed date. Either way
     the figure the row renders comes back with the facts rather than being
     assumed here — see `lib/store/setup-checklist.ts`. */
  const { facts, loading, error, source, reload } = useSetupChecklist();

  const rows = facts === null ? [] : checklistRows(facts);
  const progress = checklistProgress(rows);
  const complete = progress.total > 0 && progress.done === progress.total;

  /* The filter. It narrows what is already on the page and changes nothing
     about what the page reads: the checklist is still one request, made once.
     Held in state and not in the address because there is nothing to share or
     come back to, and nothing is stored. See `./filter.ts`. */
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const history = useSettingsSearchHistory();
  const terms = termsOf(query);
  const filtering = terms.length > 0;
  const hasBillingCard = useBillingStatus() !== null;

  const shownRows = rows.filter((row) =>
    matches(terms, {
      title: row.title,
      description: row.affects,
      words: [
        ...(ROW_WORDS[row.id] ?? []),
        ...(row.also ? [row.also.label] : []),
      ],
    }),
  );
  const shownOngoing = ONGOING.filter((item) =>
    matches(terms, {
      title: item.title,
      description: item.description,
      words: PAGE_WORDS[item.href] ?? [],
    }),
  );
  /* The card is a status and not a page, so it answers only to its own words,
     and only where it is on this person's screen at all. */
  const showBilling = hasBillingCard && matches(terms, BILLING);
  const matchCount =
    shownRows.length + shownOngoing.length + (showBilling ? 1 : 0);

  return (
    <>
      <PageHeader title="Settings" />

      <PageBody className="flex flex-col gap-6">
        <div role="search" className="flex flex-col gap-2">
          <div className="flex flex-wrap items-start gap-3">
            <div className="w-full max-w-md">
              <Input
                type="search"
                value={query}
                placeholder="Search settings: leave, pension, overtime"
                aria-label="Search settings"
                icon={<Search aria-hidden="true" />}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => {
                  setFocused(false);
                  if (matchCount > 0) history.add(query);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") history.add(query);
                }}
              />
              {/* Offered when the box is clicked into and still empty. A press
                on the list must not take focus from the box, or the list would
                close before the press landed. */}
              {focused && !filtering && history.recent.length > 0 && (
                <div
                  className="mt-2 rounded-md border border-line bg-surface p-2"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <div className="flex items-center justify-between px-2 pb-1">
                    <span className="text-meta font-semibold text-muted">
                      Recent searches
                    </span>
                    <button
                      type="button"
                      onClick={history.clear}
                      className="text-meta text-muted underline hover:text-ink"
                    >
                      Clear history
                    </button>
                  </div>
                  <ul>
                    {history.recent.map((item) => (
                      <li key={item}>
                        <button
                          type="button"
                          onClick={() => setQuery(item)}
                          className="w-full rounded px-2 py-1.5 text-left text-body-sm text-ink hover:bg-canvas"
                        >
                          {item}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="px-2 pt-1 text-meta text-muted">
                    Saved in this browser, not on your account.
                  </p>
                </div>
              )}
            </div>
            <SetupLink
              loading={loading}
              progress={progress}
              complete={complete}
            />
          </div>
          {/* Said only once the checklist has been read: while it loads, its
              rows are not there to match, and a count taken now would be a
              count of half the page. */}
          {filtering && !loading && (
            <p role="status" className="text-body-sm text-muted">
              {matchCount === 0 ? (
                <>
                  Nothing in settings matches &ldquo;{query.trim()}&rdquo;. Try
                  one word, such as leave, pension or overtime.{" "}
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="underline hover:text-ink"
                  >
                    Clear the search
                  </button>
                  .
                </>
              ) : (
                `${matchCount} ${matchCount === 1 ? "match" : "matches"} for “${query.trim()}”.`
              )}
            </p>
          )}
        </div>

        {error && (
          <Callout
            tone="danger"
            title="Could not work out what is still to be set up"
          >
            {error.message} The pages below all still work: only the checklist
            needs this read.{" "}
            <button
              type="button"
              onClick={reload}
              className="underline hover:text-ink"
            >
              Try again
            </button>
            .
          </Callout>
        )}

        {/* The checklist itself lives on `/settings/setup`. While a word is
            typed the rows that match are listed here instead, so the answer is
            on screen and not one click away. */}
        {filtering && shownRows.length > 0 && (
          <section aria-labelledby="setup-matches">
            <h2
              id="setup-matches"
              className="mb-4 text-meta font-semibold text-muted"
            >
              Setting up your company
            </h2>
            <ul className="divide-y divide-line rounded-md border border-line">
              {shownRows.map((row) => (
                <Row key={row.id} row={row} module={ROW_MODULE[row.id]} />
              ))}
            </ul>
          </section>
        )}

        {DEMO_ENABLED &&
          source === "demo" &&
          (!filtering || shownRows.length > 0) && (
            <Callout tone="warning" title="Demo data, this browser only">
              This checklist is worked out from the seeded company in this
              browser. Two rows cannot be answered offline at all (whether a
              bank account is on file, and how many pay components and salary
              bands exist) and they say so rather than reporting nothing as
              zero.
            </Callout>
          )}

        {(shownOngoing.length > 0 || showBilling) && (
          <section>
            <h2 className="mb-4 text-meta font-semibold text-muted">Ongoing</h2>
            {(!filtering || showBilling) && <BillingCard />}
            {filtering ? (
              <ul className="grid gap-3 md:grid-cols-2">
                {shownOngoing.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="flex h-full flex-col gap-1 rounded-lg border border-line bg-surface px-4 py-3 hover:border-line-strong"
                    >
                      <span className="text-meta font-semibold text-muted">
                        {PAGE_MODULE[item.href]}
                      </span>
                      <span className="font-semibold text-ink">
                        {item.title}
                      </span>
                      <span className="text-body-sm text-body">
                        {firstSentence(item.description)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {shownOngoing.map((item) => (
                  <LinkCard
                    key={item.href}
                    href={item.href}
                    title={item.title}
                    description={item.description}
                    icon={item.icon}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </PageBody>
    </>
  );
}
