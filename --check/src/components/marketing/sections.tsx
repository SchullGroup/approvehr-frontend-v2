import { cn } from "@/lib/cn";
import {
  CHIP_CLASS,
  MODULES,
  WASH_CLASS,
  type ModuleDef,
} from "@/lib/marketing/modules";
import { LearnMore } from "./pill";
import { Reveal } from "./motion";
import {
  DeskMockup,
  LeaveMockup,
  PayrollCardMockup,
  PipelineMockup,
  RecordMockup,
  ReviewMockup,
} from "./mockups";

/* -------------------------------------------------------------------------- */

export function SectionHeading({
  eyebrow,
  title,
  lead,
  align = "left",
  className,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div
      className={cn(
        align === "center" && "mx-auto max-w-2xl text-center",
        "max-w-3xl",
        className,
      )}
    >
      {eyebrow && (
        <p className="mb-3 text-[0.75rem] font-semibold uppercase tracking-widest text-slate-muted">
          {eyebrow}
        </p>
      )}
      <h2 className="text-h1 text-slate">{title}</h2>
      {lead && <p className="mt-5 text-lead text-slate-muted">{lead}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/* Every module gets a mockup. A card without one collapsed to half the height
   of its neighbours and tore a hole in the grid. */
const CARD_MOCKUP: Record<
  ModuleDef["id"],
  (p: { className?: string }) => React.ReactElement
> = {
  payroll: PayrollCardMockup,
  hiring: PipelineMockup,
  "core-hr": RecordMockup,
  time: LeaveMockup,
  performance: ReviewMockup,
  desk: DeskMockup,
};

/**
 * The module grid. Each card is a washed tint carrying a chip, a claim, and a
 * cutaway of the screen it describes — the mockup is cropped at the card edge
 * so it reads as a window onto something larger rather than a finished
 * picture. Hovering lifts the card and nudges the mockup up into view.
 */
export function ModuleCard({
  module,
  featured = false,
}: {
  module: ModuleDef;
  featured?: boolean;
}) {
  const Mockup = CARD_MOCKUP[module.id];

  /* One link per card, stretched over the whole surface. Wrapping the card in
     an anchor would nest the "Find out more" link inside it — invalid HTML,
     and it breaks hydration. */
  return (
    <article
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-3xl transition-all duration-300 ease-out-soft",
        "hover:-translate-y-1 hover:shadow-[0_12px_28px_-8px_rgb(20_18_15/0.14)]",
        "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-slate",
        WASH_CLASS[module.wash],
        featured ? "lg:col-span-2" : "",
      )}
    >
      {/* Chip tab, sitting proud of the card like a folder label. */}
      <div className="px-7 pt-7">
        <span
          className={cn(
            "inline-flex items-center rounded-lg px-2.5 py-1 text-[0.75rem] font-medium",
            CHIP_CLASS[module.wash],
          )}
        >
          {module.label}
        </span>
      </div>

      {/* Copy block is a fixed proportion so every headline sits on the same
          baseline across a row, however long the blurb runs. */}
      <div className="flex min-h-[13.5rem] flex-col px-7 pb-6 pt-5">
        <h3 className="text-h4 text-slate">{module.headline}</h3>
        <p className="mt-2.5 max-w-md text-[0.9375rem] leading-relaxed text-slate-soft">
          {module.blurb}
        </p>
        <div className="mt-auto pt-5">
          <LearnMore
            href={`/product/${module.id}`}
            className="after:absolute after:inset-0 after:content-['']"
          >
            <span className="sr-only-focusable">About {module.label}: </span>
            Find out more
          </LearnMore>
        </div>
      </div>

      <div className="pointer-events-none mt-auto overflow-hidden px-7">
        <div className="translate-y-4 transition-transform duration-500 ease-out-soft group-hover:translate-y-1">
          <Mockup />
        </div>
      </div>
    </article>
  );
}

export function ModuleGrid() {
  return (
    /* items-stretch so a row's cards share a height and the mockups line up
       along one edge rather than floating at three different depths. */
    <div className="grid items-stretch gap-5 lg:grid-cols-2 2xl:grid-cols-3">
      {MODULES.map((m, i) => (
        <Reveal key={m.id} as="div" delay={(i % 3) * 70} className="h-full">
          <ModuleCard module={m} />
        </Reveal>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** A claim with the number that backs it. */
export function ProofRow({
  items,
}: {
  items: { value: string; label: string }[];
}) {
  return (
    <dl className="grid gap-8 sm:grid-cols-3">
      {items.map((item, i) => (
        <Reveal key={item.label} as="div" delay={i * 70}>
          <dt className="text-mega text-slate">{item.value}</dt>
          <dd className="mt-2 text-[0.9375rem] leading-relaxed text-slate-muted">
            {item.label}
          </dd>
        </Reveal>
      ))}
    </dl>
  );
}
