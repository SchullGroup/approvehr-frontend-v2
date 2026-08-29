import {
  BriefcaseBusiness,
  Check,
  FileCheck2,
  FileSignature,
  ListChecks,
  Rows3,
  Send,
  type LucideIcon,
} from "lucide-react";
import { Badge, Card, CardBody } from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { MODULES } from "@/lib/marketing/modules";

/**
 * What replaced the four separate "Coming soon" links.
 *
 * Pipeline, job adverts, interviews and offers used to be four sidebar items
 * that all opened onto the same bare `ComingSoon` wall — four doors into one
 * empty room. `/hiring` is the one door now, and this is the room: a
 * walkthrough of what each of those four will actually do, not just a
 * heavier way of saying "not yet".
 *
 * The copy is `MODULES.find(m => m.id === "hiring")` from
 * `lib/marketing/modules.ts` — the same content the public product page
 * already makes this claim from, and the same file `nav.tsx` already reads
 * section headings out of. One sentence about this module, not two that
 * could quietly drift apart.
 *
 * ## Why this isn't `components/marketing/mockups.tsx`
 *
 * That file's illustrations are the right depth for a page trying to sell
 * the module to somebody who has never seen it. This is the opposite
 * reader: somebody already signed in, already paying, who clicked a nav
 * item and wants to know what is actually coming — a lighter, four-card
 * walkthrough in the app's own visual language belongs here more than an
 * import from the marketing surface would. Each card still earns a small
 * animation of its own claim on hover, same principle, sized for what this
 * page is.
 */
const HIRING = MODULES.find((m) => m.id === "hiring");

const ICONS = [FileCheck2, Rows3, ListChecks, FileSignature];

export function RecruitmentComingSoon() {
  if (!HIRING) return null;

  return (
    <>
      <PageHeader title="Recruitment" />
      <PageBody className="flex flex-col gap-8">
        <div className="animate-rise flex flex-col items-center gap-4 rounded-xl border border-line bg-accent-soft/40 px-6 py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-accent text-white">
            <BriefcaseBusiness aria-hidden="true" className="size-6" />
          </span>
          <Badge tone="warning" size="sm" dot>
            Coming soon
          </Badge>
          <h2 className="max-w-lg text-h2 text-ink">{HIRING.headline}</h2>
          <p className="max-w-md text-body leading-relaxed text-body">
            {HIRING.blurb}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {HIRING.capabilities.map((cap, i) => (
            <CapabilityCard
              key={cap.title}
              title={cap.title}
              detail={cap.detail}
              icon={ICONS[i] ?? FileCheck2}
              index={i}
              delayMs={i * 60}
            />
          ))}
        </div>

        <p className="text-center text-body-sm text-muted">
          We would rather build this properly than switch it on early — the
          nav will say so the day it is ready.
        </p>
      </PageBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * One capability, with a hover animation that performs its own sentence
 * rather than a generic lift — the same rule the marketing mockups follow.
 * `index` picks which small scene plays; there are four because there are
 * four capabilities, not because the mechanism generalises further.
 */
function CapabilityCard({
  title,
  detail,
  icon: Icon,
  index,
  delayMs,
}: {
  title: string;
  detail: string;
  icon: LucideIcon;
  index: number;
  delayMs: number;
}) {
  return (
    <Card
      className="animate-rise group overflow-hidden transition-shadow duration-300 hover:shadow-md"
      style={{ animationDelay: `${String(delayMs)}ms` }}
    >
      <CardBody className="flex gap-4">
        <span className="relative flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-text">
          <Icon aria-hidden="true" className="size-5" />
          <CapabilityAccent index={index} />
        </span>
        <div className="min-w-0">
          <h3 className="text-body-sm font-semibold text-ink">{title}</h3>
          <p className="mt-1 text-body-sm leading-relaxed text-muted">
            {detail}
          </p>
        </div>
      </CardBody>
    </Card>
  );
}

/**
 * The one moving detail on each card, held to `aria-hidden` — the sentence
 * beside it already carries the fact for anybody not hovering with a mouse.
 */
function CapabilityAccent({ index }: { index: number }) {
  switch (index) {
    /* Requisitions with approval: a sign-off badge that turns solid. */
    case 0:
      return (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-line-strong text-transparent transition-colors duration-300 group-hover:bg-success group-hover:text-white"
        >
          <Check aria-hidden="true" className="size-2.5" />
        </span>
      );
    /* Pipelines you configure: a card advancing one stage along a row. */
    case 1:
      return (
        <span
          aria-hidden="true"
          className="absolute -bottom-1.5 left-1/2 flex -translate-x-1/2 gap-1"
        >
          {[0, 1, 2].map((stage) => (
            <span
              key={stage}
              className="size-1.5 rounded-full bg-accent-text/30 transition-colors duration-300 group-hover:bg-accent-text"
              style={{ transitionDelay: `${String(stage * 90)}ms` }}
            />
          ))}
        </span>
      );
    /* Screening from your website: an answer being marked read. */
    case 2:
      return (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 size-3.5 rounded-full border-2 border-white bg-line-strong transition-colors duration-300 group-hover:bg-accent"
        />
      );
    /* Offers: drafted, then on its way. */
    case 3:
      return (
        <span
          aria-hidden="true"
          className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-line-strong text-transparent transition-colors duration-300 group-hover:bg-accent group-hover:text-white"
        >
          <Send aria-hidden="true" className="size-2.5" />
        </span>
      );
    default:
      return null;
  }
}
