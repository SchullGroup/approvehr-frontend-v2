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
  CircleDashed,
  FileText,
  Gauge,
  BriefcaseBusiness,
  ClipboardCheck,
  Megaphone,
  ScrollText,
  Sparkles,
  SunMoon,
  Timer,
  TriangleAlert,
  Users,
  Plug,
  /* Webhook — with the Webhooks card below, commented out for now. */
  ToggleRight,
} from "lucide-react";
import {
  Badge,
  ButtonLink,
  Callout,
  Disclosure,
  Input,
  LinkCard,
  ProgressMeter,
  Spinner,
  TextLink,
  type BadgeTone,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { useSettingsSearchHistory } from "@/lib/store/settings-search-history";
import { useSetupChecklist } from "@/lib/store/setup-checklist";
import { BillingCard, useBillingStatus } from "./billing-card";
import {
  checklistProgress,
  checklistRows,
  type ChecklistRow,
  type RowStatus,
} from "./checklist";
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

const STATUS: Record<
  RowStatus,
  { label: string; tone: BadgeTone; icon: React.ReactNode }
> = {
  done: {
    label: "Done",
    tone: "success",
    icon: <Check aria-hidden="true" className="size-4" />,
  },
  attention: {
    label: "Needs attention",
    tone: "warning",
    icon: <TriangleAlert aria-hidden="true" className="size-4" />,
  },
  todo: {
    label: "Not set up",
    tone: "danger",
    icon: <CircleDashed aria-hidden="true" className="size-4" />,
  },
  optional: {
    label: "Your choice",
    tone: "neutral",
    icon: <CircleDashed aria-hidden="true" className="size-4" />,
  },
  unknown: {
    label: "Not known offline",
    tone: "neutral",
    icon: <CircleDashed aria-hidden="true" className="size-4" />,
  },
};

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

function Row({ row, module }: { row: ChecklistRow; module?: string }) {
  const status = STATUS[row.status];
  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:gap-5">
      <span
        aria-hidden="true"
        className={
          row.status === "done"
            ? "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-success-soft text-success-text"
            : row.status === "attention"
              ? "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning-text"
              : row.status === "todo"
                ? "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning-text"
                : "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-canvas text-faint"
        }
      >
        {status.icon}
      </span>

      <span className="min-w-0 flex-1">
        {module && (
          <span className="block text-meta font-semibold text-muted">
            {module}
          </span>
        )}
        <span className="flex flex-wrap items-center gap-2">
          <h3 className="text-body-sm font-semibold text-ink">{row.title}</h3>
          <Badge tone={status.tone} size="sm">
            {status.label}
          </Badge>
        </span>
        <p className="mt-1 text-body-sm text-body">{row.detail}</p>
        <p className="mt-1 text-meta text-muted">{row.affects}</p>
      </span>

      <span className="flex shrink-0 flex-wrap items-center gap-2">
        {row.also && (
          <ButtonLink href={row.also.href} variant="ghost" size="sm">
            {row.also.label}
          </ButtonLink>
        )}
        <ButtonLink
          href={row.href}
          variant={
            row.status === "done" || row.status === "optional"
              ? "secondary"
              : "accent"
          }
          size="sm"
        >
          {row.linkLabel}
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </ButtonLink>
      </span>
    </li>
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

        {/**
         * Open while anything is outstanding; collapsed once it is done.
         *
         * It was always collapsed, on the argument that a company reaching for
         * one card should not scroll past six checklist rows every time, and
         * that the outstanding items show on the closed line anyway so there is
         * nothing to open just to *learn* something needs doing.
         *
         * The second half is where it failed. The closed line reads
         * "Outstanding: Company profile, Work locations…" — and those are
         * **prose, not links**. Somebody who has just read that a company
         * profile is outstanding has nowhere to click, and the nine cards
         * below are the ongoing surfaces, none of which is the company
         * profile. The product owner asked three times where to upload a
         * company logo; it is on `/settings/company`, behind this chevron,
         * and every time the answer was "expand a thing you had no reason to
         * think was hiding a route".
         *
         * So the first half of the argument is kept and the second is
         * answered: a **finished** company still gets the collapsed line it
         * was written for, and an unfinished one gets the rows it needs to
         * act on. Same rule as everywhere else in this product — closed for a
         * year of dates or an audit trail, open for something waiting on the
         * reader.
         */}
        {/* While a word is typed the checklist is not a closed reveal that
            might hold a match: the rows that match are listed, so the answer is
            on screen and not behind a chevron. The reveal comes back when the
            box is cleared. */}
        {filtering ? (
          shownRows.length > 0 && (
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
          )
        ) : (
          <Disclosure
            /**
             * The key is what makes `defaultOpen` work here.
             *
             * `Disclosure` reads `defaultOpen` once, into `useState` — which is
             * the right contract for an uncontrolled component and means a later
             * change to the prop does nothing. `loading` is true on the first
             * render, so without this the checklist would mount closed and stay
             * closed however many items turned out to be outstanding.
             *
             * Remounting once, when the answer arrives, gives the right default
             * and leaves it a normal uncontrolled disclosure afterwards — the
             * reader can still close it, and it stays closed. Controlling `open`
             * instead would take that away.
             */
            key={loading ? "loading" : complete ? "done" : "outstanding"}
            title="Setting up your company"
            defaultOpen={!loading && !complete}
            level={2}
            meta={
              !loading && progress.total > 0 ? (
                <span className="flex min-w-32 flex-col items-end gap-1.5">
                  <span className="text-meta font-semibold text-muted">
                    {progress.done} of {progress.total} done
                  </span>
                  <ProgressMeter
                    value={progress.done}
                    max={progress.total}
                    tone={complete ? "success" : "accent"}
                    size="sm"
                    showValue={false}
                  />
                </span>
              ) : undefined
            }
            hint={
              loading ? (
                "Reading what is set up."
              ) : complete ? (
                /* The collapsed line is the only thing a finished company
                     reads — the rows below it are behind a closed reveal. So
                     anything still worth doing has to be said here or it is
                     said nowhere, which is exactly how the logo upload stayed
                     invisible: present on `/settings/company`, below a form
                     with thirty-seven states in it, and mentioned by nothing.

                     Saying it was still not enough. It was a **sentence**, and
                     the reader had nowhere to click — asked three separate
                     times where to upload a company logo, having read this
                     exact line. Naming a gap without a route to it is half a
                     job, and the missing half is the one that costs the time. */
                facts && !facts.company.logo ? (
                  <>
                    Everything a payroll needs is in place. No logo yet: it goes
                    on every payslip and on the emails the platform sends.{" "}
                    <TextLink href="/settings/company">Add one</TextLink>.
                  </>
                ) : (
                  "Everything a payroll needs is in place."
                )
              ) : progress.outstanding.length > 0 ? (
                `Outstanding: ${progress.outstanding.map((row) => row.title).join(", ")}.`
              ) : (
                "Seven things decide how the product behaves."
              )
            }
          >
            {loading ? (
              <div className="flex justify-center py-10">
                <Spinner />
              </div>
            ) : facts === null ? (
              <p className="text-body-sm text-body">
                Nothing to show. The checklist reads one endpoint and it did not
                answer; every page below is unaffected.
              </p>
            ) : (
              <ul className="divide-y divide-line rounded-md border border-line">
                {rows.map((row) => (
                  <Row key={row.id} row={row} />
                ))}
              </ul>
            )}
          </Disclosure>
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
