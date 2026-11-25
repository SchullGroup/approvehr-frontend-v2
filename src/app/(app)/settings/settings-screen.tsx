"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Bell,
  BookOpen,
  Building2,
  Clock,
  Cpu,
  Landmark,
  LifeBuoy,
  MapPin,
  MessageSquare,
  Network,
  Search,
  ShieldCheck,
  FileText,
  Gauge,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardCheck,
  KeyRound,
  Megaphone,
  ScrollText,
  SlidersHorizontal,
  Sparkles,
  SunMoon,
  Timer,
  Banknote,
  Plug,
  ToggleRight,
} from "lucide-react";
import { Callout, Input, NextStep } from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { useSettingsSearchHistory } from "@/lib/store/settings-search-history";
import { useSetupChecklist } from "@/lib/store/setup-checklist";
import { useFeatures } from "@/lib/store/features";
import { useAssistantAvailable } from "@/lib/store/ai";
import { useSmsStatus } from "@/lib/store/sms";
import { useWorkTrackerProviders } from "@/lib/store/work-trackers";
import { BillingCard, useBillingStatus } from "./billing-card";
import { STATUS } from "./setup-row";
import { checklistRows, type ChecklistRow } from "./checklist";
import {
  BILLING,
  PAGE_WORDS,
  SETTINGS_GROUPS,
  SETTINGS_PAGES,
  matches,
  termsOf,
  type SettingsNeeds,
  type SettingsPage,
} from "./filter";

/**
 * Settings: one page, six titled groups, every setting once.
 *
 * UAT 23 Nov (U43: HR-9, NC-17). The page used to be 19 unsorted cards whose
 * names did not match the pages behind them, and the setup pages (company
 * profile, work locations, leave, payroll, bank accounts) were reachable only
 * through a small "Setting up" chip that opened a separate checklist page.
 * Every page is now listed under the title it carries, in one of six groups,
 * and the five setup pages say where they stand beside their name. What is
 * still to set up is also on the dashboard, as a card the owner can hide.
 *
 * A page that cannot be used yet on this server (the assistant, text messages,
 * integrations) is not listed until it can (U52).
 */

const ICONS: Record<string, React.ReactNode> = {
  "/settings/company": <Building2 aria-hidden="true" />,
  "/settings/locations": <MapPin aria-hidden="true" />,
  "/people/departments": <Network aria-hidden="true" />,
  "/settings/features": <ToggleRight aria-hidden="true" />,
  "/settings/announcements": <Megaphone aria-hidden="true" />,
  "/settings/policies": <ScrollText aria-hidden="true" />,
  "/settings/job-roles": <BriefcaseBusiness aria-hidden="true" />,
  "/settings/required-details": <ClipboardCheck aria-hidden="true" />,
  "/settings/queries": <MessageSquare aria-hidden="true" />,
  "/settings/performance": <Gauge aria-hidden="true" />,
  "/settings/helpdesk": <LifeBuoy aria-hidden="true" />,
  "/settings/knowledge": <BookOpen aria-hidden="true" />,
  "/settings/leave": <CalendarDays aria-hidden="true" />,
  "/settings/attendance": <Clock aria-hidden="true" />,
  "/settings/overtime": <Timer aria-hidden="true" />,
  "/settings/devices": <Cpu aria-hidden="true" />,
  "/settings/payroll": <Banknote aria-hidden="true" />,
  "/settings/bank-accounts": <Landmark aria-hidden="true" />,
  "/payroll/pay-setup": <SlidersHorizontal aria-hidden="true" />,
  "/settings/roles": <KeyRound aria-hidden="true" />,
  "/settings/security": <ShieldCheck aria-hidden="true" />,
  "/settings/audit": <FileText aria-hidden="true" />,
  "/settings/notifications": <Bell aria-hidden="true" />,
  "/settings/sms": <MessageSquare aria-hidden="true" />,
  "/settings/ai": <Sparkles aria-hidden="true" />,
  "/settings/integrations": <Plug aria-hidden="true" />,
  "/settings/appearance": <SunMoon aria-hidden="true" />,
};

/**
 * Which of the pages that need something on the server have it.
 *
 * Each answer is `false` until it is known, so a page appears a moment late
 * rather than appearing and then going.
 */
function useServerHas(): Record<SettingsNeeds, boolean> {
  const { available: assistant } = useAssistantAvailable();
  const sms = useSmsStatus();
  const trackers = useWorkTrackerProviders();
  return {
    assistant,
    sms: sms.data?.transport.sends === true,
    integrations: trackers.providers.some(
      (provider) =>
        (provider.available && provider.configured) ||
        provider.connections.length > 0,
    ),
  };
}

/** The pages this company can use, before any search. */
export function listedPages(
  pages: readonly SettingsPage[],
  features: Partial<Record<"departments" | "appraisals", boolean>>,
  has: Record<SettingsNeeds, boolean>,
): SettingsPage[] {
  return pages.filter(
    (page) =>
      (page.feature === undefined || features[page.feature] !== false) &&
      (page.needs === undefined || has[page.needs]),
  );
}

function PageRow({
  page,
  row,
}: {
  page: SettingsPage;
  row: ChecklistRow | undefined;
}) {
  const status = row ? STATUS[row.status] : null;
  return (
    <li>
      <Link
        href={page.href}
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
      >
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-text [&>svg]:size-4"
        >
          {ICONS[page.href]}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="font-semibold text-ink">{page.title}</span>
            {status && row && row.status !== "unknown" && (
              <span className="text-meta text-muted">{status.label}</span>
            )}
          </span>
        </span>
      </Link>
    </li>
  );
}

export function SettingsScreen() {
  /* No year argument. Connected, the API answers from its own clock and says
     which year it used; offline the hook uses the demo's fixed date. */
  const { facts, loading, error, reload } = useSetupChecklist();
  const rows = facts === null ? [] : checklistRows(facts);
  const rowById = new Map(rows.map((row) => [row.id, row]));
  /* One next step, never a list: the first row that still needs doing. */
  const nextRow = rows.find(
    (row) => row.status === "todo" || row.status === "attention",
  );

  const features = useFeatures();
  const has = useServerHas();
  const listed = listedPages(SETTINGS_PAGES, features, has);

  /* The filter. It narrows what is already on the page and changes nothing
     about what the page reads. Held in state and not in the address because
     there is nothing to share or come back to, and nothing is stored. */
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const history = useSettingsSearchHistory();
  const terms = termsOf(query);
  const filtering = terms.length > 0;
  const hasBillingCard = useBillingStatus() !== null;

  const shown = listed.filter((page) =>
    matches(terms, {
      title: page.title,
      description: page.description,
      words: PAGE_WORDS[page.href] ?? [],
    }),
  );
  /* The card is a status and not a page, so it answers only to its own words,
     and only where it is on this person's screen at all. */
  const showBilling = hasBillingCard && matches(terms, BILLING);
  const matchCount = shown.length + (showBilling ? 1 : 0);

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
          {filtering && (
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
          <Callout tone="danger" title="Could not read what is set up">
            {error.message} Every page below still works.{" "}
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

        {!filtering && !loading && nextRow && (
          <NextStep
            title={`Next: ${nextRow.title}`}
            detail={nextRow.detail}
            action={{ label: nextRow.linkLabel, href: nextRow.href }}
          />
        )}

        {showBilling && <BillingCard />}

        <div className="grid items-start gap-6 lg:grid-cols-2">
          {SETTINGS_GROUPS.map((group) => {
            const pages = shown.filter((page) => page.group === group.id);
            if (pages.length === 0) return null;
            return (
              <section
                key={group.id}
                aria-labelledby={`settings-group-${group.id}`}
                className="min-w-0"
              >
                <h2
                  id={`settings-group-${group.id}`}
                  className="mb-2 text-h4 text-ink"
                >
                  {group.title}
                </h2>
                <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
                  {pages.map((page) => (
                    <PageRow
                      key={page.href}
                      page={page}
                      row={
                        page.row && !loading ? rowById.get(page.row) : undefined
                      }
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </PageBody>
    </>
  );
}
