"use client";

import {
  ArrowRight,
  Bell,
  BookOpen,
  LifeBuoy,
  Check,
  CircleDashed,
  FileText,
  Gauge,
  Megaphone,
  Plug,
  ScrollText,
  Timer,
  TriangleAlert,
  Users,
  Webhook,
} from "lucide-react";
import {
  Badge,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  LinkCard,
  ProgressMeter,
  Spinner,
  type BadgeTone,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { useSetupChecklist } from "@/lib/store/setup-checklist";
import {
  checklistProgress,
  checklistRows,
  type ChecklistRow,
  type RowStatus,
} from "./checklist";

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
const ONGOING = [
  {
    href: "/settings/announcements",
    title: "Noticeboard",
    description:
      "Notices everybody sees on their dashboard. Publishing is what makes one visible; a draft appears nowhere.",
    icon: <Megaphone aria-hidden="true" />,
  },
  {
    href: "/settings/helpdesk",
    title: "Help desk",
    description:
      "What people can raise a request about, and how quickly you have promised to answer.",
    icon: <LifeBuoy aria-hidden="true" />,
  },
  {
    href: "/settings/knowledge",
    title: "Knowledge base",
    description:
      "Write and publish help articles, and see the searches that found nothing.",
    icon: <BookOpen aria-hidden="true" />,
  },
  {
    href: "/settings/policies",
    title: "Policies",
    description:
      "Documents people have to read and acknowledge, and who has not yet.",
    icon: <ScrollText aria-hidden="true" />,
  },
  {
    href: "/settings/overtime",
    title: "Overtime",
    description:
      "Whether overtime is paid, from how many minutes, and the weekday, weekend and public-holiday rates.",
    icon: <Timer aria-hidden="true" />,
  },
  {
    href: "/settings/performance",
    title: "Appraisal scoring",
    description:
      "How much each part of an appraisal counts. The weights must make 100% exactly, and they are frozen onto an appraisal period when it starts.",
    icon: <Gauge aria-hidden="true" />,
  },
  {
    href: "/settings/notifications",
    title: "Notifications",
    description: "What triggers an email, and who receives approval reminders.",
    icon: <Bell aria-hidden="true" />,
  },
  {
    href: "/settings/integrations",
    title: "Integrations",
    description: "Accounting, biometric devices and single sign-on.",
    icon: <Plug aria-hidden="true" />,
  },
  {
    href: "/settings/webhooks",
    title: "Webhooks",
    description:
      "We POST signed JSON to a URL you control. The one integration that needs nobody else's credential.",
    icon: <Webhook aria-hidden="true" />,
  },
  {
    href: "/settings/audit",
    title: "Audit trail",
    description:
      "Who changed what, and when. Every settings change on this page lands here.",
    icon: <FileText aria-hidden="true" />,
  },
  {
    href: "/people",
    title: "People",
    description:
      "The directory. Who has access is decided by the role on their account, under Roles and access above.",
    icon: <Users aria-hidden="true" />,
  },
];

function Row({ row }: { row: ChecklistRow }) {
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
                ? "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger-text"
                : "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-canvas text-faint"
        }
      >
        {status.icon}
      </span>

      <span className="min-w-0 flex-1">
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
          variant={row.status === "done" || row.status === "optional" ? "secondary" : "accent"}
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

  return (
    <>
      <PageHeader
        title="Settings"
      />

      <PageBody className="flex flex-col gap-6">
        {error && (
          <Callout
            tone="danger"
            title="Could not work out what is still to be set up"
          >
            {error.message} The pages below all still work — only the checklist
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

        <Card>
          <CardHeader
            level={2}
            className="flex-wrap"
            title="Setting up your company"
            description={
              loading
                ? "Reading what is set up."
                : complete
                  ? "Everything a payroll needs is in place. The rows below are worth a look when something changes."
                  : "Seven things decide how the product behaves. Each row says where it stands and what it affects."
            }
            action={
              !loading && progress.total > 0 ? (
                <span className="flex min-w-40 flex-col gap-1.5">
                  <span className="text-meta font-semibold uppercase tracking-[0.08em] text-muted">
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
          />

          {loading ? (
            <CardBody className="flex justify-center py-10">
              <Spinner />
            </CardBody>
          ) : facts === null ? (
            <CardBody>
              <p className="text-body-sm text-body">
                Nothing to show. The checklist reads one endpoint and it did not
                answer; every page below is unaffected.
              </p>
            </CardBody>
          ) : (
            <>
              {!complete && progress.outstanding.length > 0 && (
                <CardBody className="border-b border-line">
                  <p className="text-body-sm text-body">
                    Outstanding:{" "}
                    <strong className="text-ink">
                      {progress.outstanding.map((row) => row.title).join(", ")}
                    </strong>
                    .
                  </p>
                </CardBody>
              )}
              <ul className="divide-y divide-line">
                {rows.map((row) => (
                  <Row key={row.id} row={row} />
                ))}
              </ul>
            </>
          )}
        </Card>

        {DEMO_ENABLED && source === "demo" && (
          <Callout tone="warning" title="Demo data, this browser only">
            This checklist is worked out from the seeded company in this browser.
            Two rows cannot be answered offline at all — whether a bank account is
            on file, and how many pay components and salary bands exist — and they
            say so rather than reporting nothing as zero.
          </Callout>
        )}

        <section>
          <h2 className="mb-4 text-meta font-semibold uppercase tracking-[0.08em] text-muted">
            Ongoing, not setup
          </h2>
          <p className="mb-4 max-w-2xl text-body-sm text-muted">
            These have no finished state — a company never completes its
            noticeboard — so they sit outside the checklist rather than giving it a
            count that can never reach zero.
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {ONGOING.map((item) => (
              <LinkCard
                key={item.href}
                href={item.href}
                title={item.title}
                description={item.description}
                icon={item.icon}
              />
            ))}
          </div>
        </section>
      </PageBody>
    </>
  );
}
