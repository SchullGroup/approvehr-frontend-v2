import { BriefcaseBusiness } from "lucide-react";
import { Badge } from "@/components/ui";
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

        {/* The four capability cards stood here and are gone at the product
            owner's instruction.

            They were a walkthrough of what recruitment will do — requisitions,
            pipelines, screening, offers — taken from the same
            `lib/marketing/modules.ts` copy the public product page uses. The
            argument was that somebody already signed in and already paying
            deserves more than a bare "not yet".

            The counter-argument is the one that won: this reader is inside the
            product, and four cards describing software that does not exist yet
            read as a sales page served to a customer. The headline and the
            badge above say the true thing in one line. `MODULES` still carries
            the detail for the page whose job is to sell it. */}
      </PageBody>
    </>
  );
}
