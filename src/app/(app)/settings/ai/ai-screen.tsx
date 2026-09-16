"use client";

import {
  CircleDashed,
  ListChecks,
  MessageSquareText,
  MessagesSquare,
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
 * No form here — the credential is an environment variable read at boot, so a
 * field here could only look like it saves a key and not. This page exists so
 * the feature is discoverable at all: other screens render `null` when no
 * assistant is wired, which left nowhere saying it existed.
 */

/** Everywhere it appears, and what each one is built from. */
const USES = [
  {
    icon: <MessagesSquare aria-hidden="true" />,
    title: "A conversation about your own records",
    where: "Assistant, in the sidebar",
    from: "Whatever the lookups it runs return, and they run as you, with your permissions. It can offer to make a change, described from your records; nothing happens until you press Confirm.",
    href: "/assistant",
  },
  {
    icon: <ListChecks aria-hidden="true" />,
    title: "Objectives under a company goal",
    where: "KPIs → a company goal → Suggest objectives",
    from: "The goal's own title and description, and nothing else.",
    href: "/performance/kpis",
  },
  {
    icon: <MessageSquareText aria-hidden="true" />,
    title: "A progress note from a headline",
    where: "KPIs → a measure → record progress",
    from: "The headline you type. Fewer than ten characters is refused: a note written from “did work” would be entirely invention.",
    href: "/performance/kpis",
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
          A conversation about your own records, plus suggested objectives,
          drafted progress notes and development areas. Every suggestion is a
          draft somebody edits and submits themselves, and every change is one
          somebody confirms.
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
              boot: there is deliberately no field for it on this page, because
              a box that looks like it saves a key and does not is worse than no
              box.
            </p>
            <p className="mt-2">
              Set <code className="text-ink">GEMINI_API_KEY</code> on the API
              and restart it.{" "}
              <code className="text-ink">ANTHROPIC_API_KEY</code> is read the
              same way; with both set, Gemini answers and the API logs a warning
              saying so. Everything below starts working immediately: nothing
              else has to be configured.
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
          <h2 className="text-meta font-semibold text-muted">What it does</h2>

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

        <Disclosure
          title="What is sent, and what is not"
          level={2}
          hint="Suggestions send no name, no salary, no written comment. Asking a question sends more, and a conversation is kept nowhere."
        >
          <div className="flex flex-col gap-3 text-body-sm text-body">
            <p>
              A suggestion request carries a short list of stated facts and the
              instruction. It does not carry the summary sentence that names the
              person: that is assembled here, shown to you beside the
              suggestion, and never put in the request.
            </p>
            <p>
              So a request about somebody&rsquo;s development areas sends the
              competencies scored below target and the targets. It does not send
              their name, their pay, their written comments, or anything about
              anybody else.
            </p>
            <p>
              Nothing a suggestion produces is ever saved on its own. It lands
              in a field, somebody edits it, and the ordinary Save writes it
              under their name: there is no endpoint that accepts a suggestion
              directly, on purpose.
            </p>

            <p>
              <strong className="font-semibold text-ink">
                Asking a question is different, and sends more.
              </strong>{" "}
              To answer &ldquo;who has no bank account&rdquo; the assistant is
              sent the names it found. To answer a question about pay, it is
              sent the figures. Only ever what the person asking could already
              see on a screen: the lookups run as them, with their permissions,
              and a salary is withheld from somebody who may not view salaries
              rather than sent and then hidden.
            </p>
            <p>
              It reads. There is no lookup that writes, changes or approves
              anything, and every answer names the records it came from so the
              working can be checked. Account numbers, pension PINs and TINs are
              never sent at all: the assistant is told only whether each one is
              on file.
            </p>

            <p>
              <strong className="font-semibold text-ink">
                It can also offer to make a change, and never make one.
              </strong>{" "}
              In a conversation it may propose something: deciding a leave
              request, starting an appraisal period, posting an announcement. A
              proposal is only a description: the summary and the details beside
              the button are read out of your own records by the server, not
              written by the model, and the change happens on your press and on
              nothing else. The same permissions apply, so it can only ever
              offer you something you could have done yourself.
            </p>

            <p>
              A conversation is not stored anywhere. The whole exchange is sent
              again on every turn so that no transcript has to be kept, and
              closing the page ends it: there is nothing to go back to, by
              design.
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
