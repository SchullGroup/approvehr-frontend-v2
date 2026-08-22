import type { Metadata } from "next";
import { cn } from "@/lib/cn";
import { Logo, LogoMark } from "@/components/brand/logo";
import { Badge, Card, CardBody } from "@/components/ui";
import {
  BRAND,
  CATEGORICAL,
  NEUTRALS,
  RADII,
  SEMANTIC,
  SHADOWS,
  TYPE_SCALE,
  type Swatch,
} from "./tokens";
import { notFound } from "next/navigation";
import {
  ButtonsDemo,
  CardsDemo,
  ChartsDemo,
  FeedbackDemo,
  FormsDemo,
  NavigationDemo,
  PeopleDemo,
  SparklineDemo,
  StatsDemo,
  TableDemo,
} from "./sections";

/*
 * Why this internal page is gated, and why its example values are synthetic.
 *
 * This is a style reference, not demo *mode* — so the compile-time
 * `DEMO_ENABLED` gate that strips seeded personas from every other screen never
 * applied to it, and it shipped to production carrying example records that read
 * as real ones: staff names taken from the seed directory, salaries, a manager,
 * and a fabricated pension PIN. `scripts/verify-demo.ts` could not see them,
 * because it looks for demo-mode strings and these were ordinary component props.
 *
 * Two things fix it, and the order matters. Gating the route was tried first and
 * is **not** sufficient on its own: `notFound()` stops the render, and putting
 * the demos behind a lazily-imported module boundary still emitted their chunk,
 * so every value stayed fetchable from `.next/static` regardless. What actually
 * removes them is that the values are no longer persona-shaped — Example Alpha,
 * and a PIN of all zeroes at a real PIN's length. Nothing here can be mistaken
 * for somebody's record, in any build, however it is chunked.
 *
 * The gate stays as well, because an internal token showcase is not part of the
 * product and has no business answering in production.
 */

export const metadata: Metadata = {
  title: "Design system",
  description:
    "The ApproveHR design language: tokens, typography and every component, in one place.",
};

/* Tailwind scans for literal class names, so these maps exist instead of
   interpolating the token name into the class at render time. */
const TYPE_CLASS: Record<string, string> = {
  display: "text-display",
  h1: "text-h1",
  h2: "text-h2",
  h3: "text-h3",
  h4: "text-h4",
  lead: "text-lead",
  eyebrow: "text-eyebrow uppercase",
};

const SHADOW_CLASS: Record<string, string> = {
  xs: "shadow-xs",
  sm: "shadow-sm",
  md: "shadow-md",
  lg: "shadow-lg",
  xl: "shadow-xl",
};

const SECTIONS = [
  { id: "brand", label: "Brand" },
  { id: "colour", label: "Colour" },
  { id: "type", label: "Typography" },
  { id: "form", label: "Shape and depth" },
  { id: "buttons", label: "Buttons" },
  { id: "forms", label: "Forms" },
  { id: "tables", label: "Tables" },
  { id: "stats", label: "Stats" },
  { id: "charts", label: "Charts" },
  { id: "cards", label: "Cards" },
  { id: "navigation", label: "Navigation" },
  { id: "people", label: "People" },
  { id: "feedback", label: "Feedback" },
];

export default function DesignSystemPage() {
  /* Not a customer-facing page. `DEMO_ENABLED` is substituted at compile time,
     so in a production build this reads `if (true) notFound()` and every demo
     below is unreachable. */
  if (!DEMO_ENABLED) notFound();

  return (
    <div className="min-h-dvh bg-canvas">
      {/* Header */}
      <header className="grid-fade border-b border-line">
        <div className="container-page py-14">
          <Logo size={32} className="text-ink" />
          <h1 className="mt-8 max-w-3xl text-h1 text-ink">
            The ApproveHR design system
          </h1>
          <p className="mt-4 max-w-2xl text-lead text-body">
            Every token, control and pattern the product is built from. Nothing
            here is decorative — each decision below is recorded so a screen
            never has to re-invent it.
          </p>
          <div className="mt-7 flex flex-wrap gap-2">
            <Badge tone="success" dot>
              27 colour pairs pass WCAG 2.1 AA
            </Badge>
            <Badge tone="accent" dot>
              Geist · one family, no monospace
            </Badge>
            <Badge tone="neutral" dot>
              Next.js 16 · React 19 · Tailwind v4
            </Badge>
          </div>
        </div>
      </header>

      <div className="container-page flex gap-10 py-12">
        {/* Section nav */}
        <nav
          aria-label="Sections"
          className="sticky top-8 hidden h-fit w-44 shrink-0 lg:block"
        >
          <p className="mb-3 px-3 text-eyebrow uppercase text-faint">
            Contents
          </p>
          <ul className="flex flex-col gap-0.5">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="block rounded-md px-3 py-1.5 text-body-sm text-body transition-colors hover:bg-surface hover:text-ink"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <main id="main" className="flex min-w-0 flex-1 flex-col gap-16">
          {/* ---------------------------------------------------------- */}
          <Section
            id="brand"
            title="Brand"
            intro="The mark is an A resolved by a check. Both brand colours are lifted straight from it, which is why the palette below has only one accent and one approval green rather than an invented set."
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <Card>
                <CardBody className="flex flex-col items-center gap-4 py-9">
                  <LogoMark size={56} className="text-ink" />
                  <p className="text-meta text-muted">Mark</p>
                </CardBody>
              </Card>
              <Card>
                <CardBody className="flex flex-col items-center gap-4 py-9">
                  <Logo size={28} className="text-ink" />
                  <p className="text-meta text-muted">Lockup on light</p>
                </CardBody>
              </Card>
              <Card className="overflow-hidden border-ink bg-ink">
                <div className="flex flex-col items-center gap-4 py-9">
                  <Logo size={28} className="text-white" />
                  <p className="text-meta text-white/60">
                    Lockup on ink
                  </p>
                </div>
              </Card>
            </div>
          </Section>

          {/* ---------------------------------------------------------- */}
          <Section
            id="colour"
            title="Colour"
            intro="Text colours carry a measured contrast ratio on white. Fills carry the ratio of the label that sits on them. Anything under 4.5:1 is restricted to icons, borders and large text — the restriction is stated on the swatch, not left to memory."
          >
            <SwatchGrid title="Brand" swatches={BRAND} />
            <SwatchGrid title="Neutrals" swatches={NEUTRALS} />
            <SwatchGrid title="Semantic" swatches={SEMANTIC} />
            <SwatchGrid
              title="Categorical — charts only"
              swatches={CATEGORICAL}
              note="Series colour never signals status. A bar is green because it is the second series, not because things are going well."
            />
          </Section>

          {/* ---------------------------------------------------------- */}
          <Section
            id="type"
            title="Typography"
            intro="Geist, in one family. Numbers align through tabular figures rather than a second monospace face, so tables stay in the same voice as everything else."
          >
            <Card>
              <CardBody className="flex flex-col divide-y divide-line">
                {TYPE_SCALE.map((t) => (
                  <div
                    key={t.name}
                    className="flex flex-wrap items-baseline justify-between gap-4 py-5 first:pt-0 last:pb-0"
                  >
                    <p
                      className={cn(
                        "min-w-0 truncate text-ink",
                        TYPE_CLASS[t.name],
                      )}
                      style={{ maxWidth: "60%" }}
                    >
                      Approve with confidence
                    </p>
                    <dl className="flex shrink-0 gap-5 text-meta text-muted">
                      <div>
                        <dt className="sr-only-focusable">Token</dt>
                        <dd className="font-medium text-ink">
                          text-{t.name}
                        </dd>
                      </div>
                      <div>
                        <dt className="sr-only-focusable">Size</dt>
                        <dd className="tabular">{t.size}</dd>
                      </div>
                      <div className="hidden sm:block">
                        <dt className="sr-only-focusable">Usage</dt>
                        <dd>{t.usage}</dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </CardBody>
            </Card>
          </Section>

          {/* ---------------------------------------------------------- */}
          <Section
            id="form"
            title="Shape and depth"
            intro="Six radii and five elevations. Elevation is tinted with the ink hue rather than pure black, so shadows read as the same material as the text."
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardBody>
                  <p className="mb-4 text-meta font-medium tracking-wide text-muted">
                    Radius
                  </p>
                  <div className="flex flex-wrap gap-5">
                    {RADII.map((r) => (
                      <div key={r.name} className="flex flex-col items-center gap-2">
                        <div
                          className="size-14 border border-line-strong bg-sunken"
                          style={{ borderRadius: r.value }}
                        />
                        <p className="text-meta font-medium text-ink">
                          {r.name}
                        </p>
                        <p className="tabular text-meta text-muted">
                          {r.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardBody>
                  <p className="mb-4 text-meta font-medium tracking-wide text-muted">
                    Elevation
                  </p>
                  <div className="flex flex-wrap gap-5">
                    {SHADOWS.map((s) => (
                      <div key={s.name} className="flex flex-col items-center gap-2">
                        <div
                          className={cn(
                            "size-14 rounded-lg bg-surface",
                            SHADOW_CLASS[s.name],
                          )}
                        />
                        <p className="text-meta font-medium text-ink">
                          {s.name}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>
            </div>
          </Section>

          {/* ---------------------------------------------------------- */}
          <Section
            id="buttons"
            title="Buttons"
            intro="Approve is its own variant, not a green primary. It is the only control that uses the brand green as a fill, and it carries ink rather than white because the green is too light for white text."
          >
            <Card>
              <CardBody>
                <ButtonsDemo />
              </CardBody>
            </Card>
          </Section>

          {/* ---------------------------------------------------------- */}
          <Section
            id="forms"
            title="Forms"
            intro="Label above, control, then help text or an error — never both, so the row height never shifts during validation. Every control is reachable by keyboard and announces its own error."
          >
            <Card>
              <CardBody>
                <FormsDemo />
              </CardBody>
            </Card>
          </Section>

          {/* ---------------------------------------------------------- */}
          <Section
            id="tables"
            title="Tables"
            intro="The identifying cell is a row header, so screen readers announce which row a value belongs to. Money right-aligns with tabular figures. Wide tables scroll inside their own box — the page body never scrolls sideways."
          >
            <TableDemo />
          </Section>

          {/* ---------------------------------------------------------- */}
          <Section
            id="stats"
            title="Stats"
            intro="Direction is carried by the word as well as the colour, so a trend survives greyscale printing and colour blindness."
          >
            <div className="flex flex-col gap-6">
              <StatsDemo />
              <Card>
                <CardBody>
                  <p className="mb-4 text-meta font-medium tracking-wide text-muted">
                    Sparklines
                  </p>
                  <SparklineDemo />
                </CardBody>
              </Card>
            </div>
          </Section>

          {/* ---------------------------------------------------------- */}
          <Section
            id="charts"
            title="Charts"
            intro="Drawn in SVG from the palette tokens rather than pulled from a chart library, so they match the rest of the system exactly and add nothing to the bundle. Each one ships a visually hidden data table."
          >
            <ChartsDemo />
          </Section>

          {/* ---------------------------------------------------------- */}
          <Section id="cards" title="Cards">
            <CardsDemo />
          </Section>

          {/* ---------------------------------------------------------- */}
          <Section
            id="navigation"
            title="Navigation"
            intro="Tabs follow the ARIA authoring practice: arrow keys, Home and End, with a roving tabindex. The stepper is the backbone of every wizard in the product."
          >
            <Card>
              <CardBody>
                <NavigationDemo />
              </CardBody>
            </Card>
          </Section>

          {/* ---------------------------------------------------------- */}
          <Section id="people" title="People">
            <PeopleDemo />
          </Section>

          {/* ---------------------------------------------------------- */}
          <Section
            id="feedback"
            title="Feedback"
            intro="Every state a screen can be in: loading, empty, confirming, and done. Empty states always offer the next action rather than just reporting the absence."
          >
            <Card>
              <CardBody>
                <FeedbackDemo />
              </CardBody>
            </Card>
          </Section>
        </main>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Section({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-8">
      <h2 className="text-h3 text-ink">{title}</h2>
      {intro && (
        <p className="mt-2.5 max-w-3xl text-body-sm leading-relaxed text-body">
          {intro}
        </p>
      )}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function SwatchGrid({
  title,
  swatches,
  note,
}: {
  title: string;
  swatches: Swatch[];
  note?: string;
}) {
  return (
    <div className="mb-8 last:mb-0">
      <p className="mb-1 text-meta font-semibold tracking-wide text-ink">
        {title}
      </p>
      {note && (
        <p className="mb-3 max-w-2xl text-meta leading-relaxed text-muted">
          {note}
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {swatches.map((s) => (
          <div
            key={s.name}
            className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3"
          >
            <span
              aria-hidden="true"
              className="size-11 shrink-0 rounded-md border border-line-strong"
              style={{ backgroundColor: s.hex }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-body-sm font-medium text-ink">
                  {s.name}
                </p>
                {s.ratio && (
                  <span className="tabular shrink-0 text-meta font-medium text-success-text">
                    {s.ratio}
                  </span>
                )}
              </div>
              <p className="tabular text-meta uppercase text-muted">
                {s.hex}
              </p>
              <p className="mt-0.5 text-meta leading-snug text-muted">
                {s.usage}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
