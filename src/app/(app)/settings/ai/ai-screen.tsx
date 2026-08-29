"use client";

import {
  CircleDashed,
  ListChecks,
  MessageSquareText,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import {
  Badge,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Disclosure,
  Spinner,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { useCan } from "@/lib/permissions";
import { useAssistantAvailable } from "@/lib/store/ai";

/**
 * The assistant: what it does, whether it is on, and how it is switched on.
 *
 * ## Why a settings page for something with no settings on it
 *
 * There is no form here and there must not be one. The credential is an
 * environment variable read at boot (`server.ts` picks Gemini when
 * `GEMINI_API_KEY` is set, Anthropic otherwise), so a field on this page could
 * only ever be a box that looks like it saves a key and does not — the same
 * failure as a green "Paid" against money nobody moved.
 *
 * What this page is for is **finding out the thing exists**.
 *
 * Every screen that can offer a suggestion follows the project's own rule:
 * absent, not disabled. `components/performance/suggestions.tsx` renders `null`
 * when no assistant is wired, which is right — a button that is present and
 * always refuses teaches people the product is broken. But that rule was the
 * *only* thing in the frontend reading `useAssistantAvailable`, so with no key
 * set the feature was not merely invisible, it was **undiscoverable**: no card,
 * no row, no sentence anywhere told an administrator that an assistant was a
 * thing, that it was off, or that there was a key to switch it on.
 *
 * That is the company-logo defect exactly — a feature present, correct, and
 * findable by nobody. A thing you cannot find is a thing you do not have.
 *
 * So: the rule stays where it is, and discoverability lives here instead.
 */

/** The three places a suggestion can appear, and what each is built from. */
const USES = [
  {
    icon: <ListChecks aria-hidden="true" />,
    title: "Objectives under a company goal",
    where: "KPIs → a company goal → Suggest objectives",
    from: "The goal's own title and description, and nothing else.",
    href: "/performance?tab=kpis",
  },
  {
    icon: <MessageSquareText aria-hidden="true" />,
    title: "A progress note from a headline",
    where: "KPIs → a measure → record progress",
    from: "The headline you type. Fewer than ten characters is refused — a note written from “did work” would be entirely invention.",
    href: "/performance?tab=kpis",
  },
  {
    icon: <TrendingUp aria-hidden="true" />,
    title: "Development areas on an appraisal",
    where: "An appraisal form, beside the competency scores",
    from: "Only competencies scored below their target. Somebody meeting every target is refused rather than handed a weakness invented to fill the panel.",
    href: "/performance",
  },
];

export function AiScreen() {
  const { available, loading, assistant, reason } = useAssistantAvailable();
  const canManage = useCan("MANAGE_SETTINGS");

  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/settings", label: "Settings" }]}
        title="Assistant"
      />

      <PageBody className="flex flex-col gap-6">
        <p className="max-w-prose text-body-sm text-body">
          Suggested objectives, drafted progress notes and development areas.
          Every one of them is a draft somebody edits and submits themselves.
        </p>

        <Card>
          <CardHeader
            title="Status"
            action={
              loading ? (
                <Spinner size="sm" />
              ) : (
                <Badge tone={available ? "success" : "neutral"} size="sm" dot>
                  {available ? "On" : "Off"}
                </Badge>
              )
            }
          />
          <CardBody className="flex flex-col gap-2">
            {loading ? (
              <p className="flex items-center gap-2 text-body-sm text-muted">
                <Spinner size="sm" />
                Asking the server
              </p>
            ) : available ? (
              <>
                <p className="text-body-sm text-body">
                  Suggestions are available across the product.
                </p>
                {/* The adapter names itself — "Google gemini-2.5-flash". Read
                    from the server rather than assumed here, so this cannot
                    disagree with whichever key is actually answering. */}
                {assistant && (
                  <p className="text-body-sm text-muted">
                    Answering: <span className="text-ink">{assistant}</span>
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="flex items-start gap-2 text-body-sm text-body">
                  <CircleDashed
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-faint"
                  />
                  <span>
                    {reason ??
                      "No assistant is connected. Everything below still works; you write it yourself."}
                  </span>
                </p>
                <p className="text-body-sm text-muted">
                  Nothing is broken while it is off. The Suggest buttons are not
                  rendered at all rather than shown and refused, so no screen
                  offers something it cannot do.
                </p>
              </>
            )}
          </CardBody>
        </Card>

        {!available && !loading && canManage && (
          <Callout tone="info" title="Switching it on">
            <p>
              The credential is an environment variable on the API, read once at
              boot — there is deliberately no field for it on this page, because
              a box that looks like it saves a key and does not is worse than no
              box.
            </p>
            <p className="mt-2">
              Set <code className="text-ink">GEMINI_API_KEY</code> on the API and
              restart it. <code className="text-ink">ANTHROPIC_API_KEY</code> is
              read the same way; with both set, Gemini answers and the API logs a
              warning saying so. The three places below start working
              immediately — nothing else has to be configured.
            </p>
          </Callout>
        )}

        {!available && !loading && !canManage && (
          <Callout tone="neutral" title="Switching it on">
            This needs a credential set on the server, which is not something
            this screen can do. Whoever manages your settings can turn it on.
          </Callout>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="text-meta font-semibold uppercase tracking-[0.08em] text-muted">
            What it does
          </h2>

          {USES.map((use) => (
            <Card key={use.title}>
              <CardBody className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text [&>svg]:size-4"
                >
                  {use.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <h3 className="text-body-sm font-semibold text-ink">
                    {use.title}
                  </h3>
                  <p className="mt-0.5 text-meta text-muted">{use.where}</p>
                  <p className="mt-1.5 text-body-sm text-body">{use.from}</p>
                </span>
                <ButtonLink href={use.href} variant="ghost" size="sm">
                  Go there
                </ButtonLink>
              </CardBody>
            </Card>
          ))}
        </section>

        {/* Closed by default. Somebody arriving to switch the thing on does not
            need the data-protection argument first — but somebody deciding
            whether to switch it on needs it to be here and to be exact. */}
        <Disclosure
          title="What is sent, and what is not"
          level={2}
          hint="No name, no salary, no written appraisal comment leaves the platform."
        >
          <div className="flex flex-col gap-3 text-body-sm text-body">
            <p>
              A suggestion request carries a short list of stated facts and the
              instruction. It does not carry the summary sentence that names the
              person — that is assembled here, shown to you beside the
              suggestion, and never put in the request.
            </p>
            <p>
              So a request about somebody&rsquo;s development areas sends the
              competencies scored below target and the targets. It does not send
              their name, their pay, their written comments, or anything about
              anybody else.
            </p>
            <p>
              Nothing a suggestion produces is ever saved on its own. It lands in
              a field, somebody edits it, and the ordinary Save writes it under
              their name — there is no endpoint that accepts a suggestion
              directly, on purpose.
            </p>
            <p className="text-muted">
              Whichever provider is answering is named in the{" "}
              <a
                href="/dpa"
                className="text-accent-text underline hover:text-ink"
              >
                data processing agreement
              </a>{" "}
              along with what reaches it.
            </p>
          </div>
        </Disclosure>

        <p className="flex items-center gap-2 text-meta text-muted">
          <Sparkles aria-hidden="true" className="size-3.5" />
          Every suggestion is a draft. Nothing is submitted, scored or recorded
          without somebody reading it first.
        </p>
      </PageBody>
    </>
  );
}
