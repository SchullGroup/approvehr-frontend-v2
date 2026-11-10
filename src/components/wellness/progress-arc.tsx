import { cn } from "@/lib/cn";

/**
 * The big arc: one large number, and how it sits against a mark.
 *
 * ## The mark is never a target
 *
 * An arc needs something to fill against, and Wellness has nothing it may
 * honestly use: the API's challenge has no goal, a medical target would be a
 * claim about health, and a goal stored in the browser is forbidden. So the
 * caller passes `reference`, which on the Overview is the person's own best day
 * in the previous four weeks, and says so in `referenceText`. With no reference
 * the arc is only a track and the number stands on its own: an unfilled arc
 * must not read as "nothing done".
 *
 * ## The reading is text
 *
 * The geometry is decoration. `label` is the sentence a screen reader gets
 * (the number, and what it is measured against), and the number is real text
 * inside the card, not drawn.
 */

const SWEEP = 240; // degrees of the gauge
const START = 150; // from the bottom left, over the top, to the bottom right

function pointAt(angle: number, r: number): [number, number] {
  const rad = (angle * Math.PI) / 180;
  return [100 + r * Math.cos(rad), 100 + r * Math.sin(rad)];
}

const ARC_D = (() => {
  const [x1, y1] = pointAt(START, 80);
  const [x2, y2] = pointAt(START + SWEEP, 80);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A80 80 0 1 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
})();

export function ProgressArc({
  value,
  reference,
  valueText,
  unit,
  title,
  caption,
  referenceText,
  label,
  variant = "soft",
  art,
  children,
  className,
}: {
  /** What the person has so far. */
  value: number | null;
  /** The mark to fill against, or null when there is none. */
  reference: number | null;
  /** The big number, worded: `6,200`. */
  valueText: string;
  /** Under the number: `steps today`. */
  unit: string;
  /** The card's heading: `Steps`. */
  title: string;
  /** A line under the arc: the date, or how today compares. */
  caption?: React.ReactNode;
  /** What the mark is, in words, so nobody mistakes it for a goal. */
  referenceText?: React.ReactNode;
  /** The sentence for a screen reader. */
  label: string;
  /** `hero` is the indigo card with a green arc; `soft` is a pale wash. */
  variant?: "hero" | "soft";
  /** A mascot beside the title. */
  art?: React.ReactNode;
  /** Controls under the arc. */
  children?: React.ReactNode;
  className?: string;
}) {
  const hero = variant === "hero";
  const fraction =
    reference !== null && reference > 0 && value !== null
      ? Math.max(0, Math.min(1, value / reference))
      : null;

  return (
    <section
      aria-label={title}
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-3xl p-5 sm:p-6",
        hero
          ? "bg-accent text-white"
          : "border border-line bg-well-peri-soft text-ink",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className={cn("text-h4", hero ? "text-white" : "text-ink")}>
          {title}
        </h2>
        {art && (
          <div aria-hidden="true" className="-mb-2 -mt-3 shrink-0">
            {art}
          </div>
        )}
      </div>

      <div
        role="img"
        aria-label={label}
        className="relative mx-auto w-full max-w-[16rem]"
      >
        <svg
          viewBox="0 0 200 150"
          className="w-full"
          aria-hidden="true"
          focusable={false}
        >
          <path
            d={ARC_D}
            pathLength={1}
            style={{
              fill: "none",
              strokeWidth: 16,
              strokeLinecap: "round",
              stroke: hero
                ? "rgb(255 255 255 / 0.18)"
                : "color-mix(in srgb, var(--color-well-peri) 45%, transparent)",
            }}
          />
          {fraction !== null && fraction > 0 && (
            <path
              d={ARC_D}
              pathLength={1}
              style={{
                fill: "none",
                strokeWidth: 16,
                strokeLinecap: "round",
                stroke: hero
                  ? "var(--color-well-green)"
                  : "var(--color-well-peri-text)",
                strokeDasharray: `${String(fraction)} 1`,
                transition: "stroke-dasharray 0.8s var(--ease-out-soft)",
              }}
            />
          )}
        </svg>
        <div className="absolute inset-x-0 top-[34%] flex flex-col items-center text-center">
          <span
            className={cn(
              "tabular text-h2 sm:text-h1",
              hero ? "text-white" : "text-ink",
            )}
          >
            {valueText}
          </span>
          <span
            className={cn("text-body-sm", hero ? "text-white/85" : "text-body")}
          >
            {unit}
          </span>
        </div>
      </div>

      {(caption || referenceText) && (
        <div
          className={cn(
            "flex flex-col gap-0.5 text-center text-body-sm",
            hero ? "text-white/90" : "text-body",
          )}
        >
          {caption && <p>{caption}</p>}
          {referenceText && (
            <p className={hero ? "text-white/80" : "text-muted"}>
              {referenceText}
            </p>
          )}
        </div>
      )}

      {children}
    </section>
  );
}
