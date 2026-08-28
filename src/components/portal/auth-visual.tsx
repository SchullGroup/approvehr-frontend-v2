import { LogoMark } from "@/components/brand/logo";
import { PayrollCardMockup, PipelineMockup } from "@/components/marketing/mockups";

/**
 * The decorative half of the sign-in and account screens.
 *
 * Purely atmosphere: every string on it is `aria-hidden`, and the panel
 * carries no interactive control and no fact a screen reader needs — the
 * actual form sits in the other column with a plain `bg-canvas` behind it,
 * untouched by any of this.
 *
 * That split matters for a reason `globals.css` already states at length: this
 * app removed a hairline grid from behind its own body text because a pattern
 * at low opacity is invisible against a card and legible *through* small
 * type, making the real contrast ratio of that type unknowable. Every line of
 * text on this gradient is measured against it rather than eyeballed, and the
 * measurement is what decides its opacity — see the comment lower down for
 * where a reduced-opacity white is safe and where it measured out to 3:1 and
 * had to become solid instead.
 *
 * ## The mockups are static on purpose
 *
 * `PayrollCardMockup` and `PipelineMockup` are the homepage's own hand-drawn
 * illustrations — see `components/marketing/mockups.tsx` — each built to
 * animate on `group-hover`. Nothing here wraps them in `.group`: this panel
 * is furniture somebody's cursor crosses on the way to the password field,
 * not a demonstration asking to be hovered on purpose, and reacting to an
 * incidental pass would read as a flicker rather than a feature. Both render
 * a complete, sensible frame in their un-hovered state — that was checked
 * before picking them, since not every mockup in that file does (a couple
 * gate a field's entire width behind `group-hover` and show nothing at rest).
 */
export function AuthVisual() {
  return (
    <div
      aria-hidden="true"
      className="relative hidden overflow-hidden bg-accent lg:flex lg:flex-1 lg:flex-col lg:justify-start"
      style={{
        backgroundImage: [
          "radial-gradient(120% 100% at 0% 0%, var(--color-accent-hover) 0%, transparent 55%)",
          "radial-gradient(90% 80% at 100% 100%, var(--color-success-strong) 0%, transparent 50%)",
        ].join(", "),
      }}
    >
      {/* The headline sits at the top on purpose, not for symmetry: the
          top-left gradient only ever *darkens* the accent fill, so white text
          there stays at accent's own 10:1 contrast or better everywhere. The
          bottom-right gradient *lightens* it toward success green, measured
          at its hottest point to drop white-on-it to 3.65:1 and
          white/70-on-it to 2.6:1 — both fail AA. Nothing below reads text, so
          nothing there needs to survive that measurement — the mockups are
          opaque white cards, unaffected by whatever is behind them. */}
      <div className="pointer-events-none absolute -left-24 top-1/4 size-96 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-1/4 size-72 rounded-full bg-success/20 blur-3xl" />

      <LogoMark
        size={620}
        className="pointer-events-none absolute -bottom-24 -right-28 rotate-[-8deg] text-white/[0.07]"
      />

      <div className="relative flex flex-col gap-4 px-14 pt-20">
        <p className="text-h1 leading-[1.1] text-white">
          A smarter way to manage staff.
        </p>
        <p className="max-w-sm text-body leading-relaxed text-white/70">
          Employee records, payroll, recruitment, leave and approvals —
          managed in one platform.
        </p>
      </div>

      {/* Two of the homepage's own module cards, staggered the way a stack of
          real screens would fall. Payroll leads because it is the module
          this product is sold on; Recruitment behind it says "one platform"
          without a third line of copy claiming it.

          Normal flow, not `absolute`: an absolutely positioned child's
          `left`/`top` are measured from the containing block's PADDING edge
          (the outer boundary of the padding, i.e. flush with the border) —
          not inset by that padding the way a flow child's content is. `left-0`
          here previously landed flush against this panel's own left seam,
          ignoring the `px-14` entirely, which is what put the card hard
          against the boundary with the sign-in column. Flow children don't
          have that gotcha, so the stack now respects the same padding the
          headline above it uses, at every viewport width, with no pixel
          value to re-measure by hand when a mockup's content changes its
          height.

          No vertical overlap, on purpose, after two rounds of it looking
          "not arranged properly": a negative margin here previously pulled
          Payroll up by more than its own `p-3.5` top padding, which meant
          the overlap was cutting into its header row — the amount and the
          "Ready to approve" pill — not sitting harmlessly over Pipeline's
          empty bottom padding as the comment here used to claim. Measuring
          the gap between two cards' bounding boxes is not the same as
          checking what sits inside the region where they cross, and this is
          the second time that distinction mattered. A plain gap has nothing
          to get wrong. */}
      <div className="relative mt-12 flex flex-col gap-4 px-14">
        <PipelineMockup className="w-[27rem] shrink-0 self-start rotate-2 shadow-2xl" />
        <PayrollCardMockup className="ml-14 w-96 shrink-0 self-start shadow-2xl" />
      </div>
    </div>
  );
}
