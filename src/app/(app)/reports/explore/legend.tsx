import {
  LENS_COLORS,
  LENS_TONE_MEANINGS,
  type Lens,
  type LensTone,
} from "./lens-data";
import { cn } from "@/lib/cn";

/**
 * What the colours mean, for whichever lens is active right now.
 *
 * Only the tones that lens actually produces — `topScorerLens` never emits
 * `warning` or `danger`, for instance, and a legend entry for a tone that
 * can never appear would be a key to a colour the viewer will never see.
 * Headcount has no lens at all, so it gets its own one-line explanation
 * instead of an empty colour key.
 */
export function ExploreLegend({
  activeLens,
  className,
}: {
  activeLens: Lens | null;
  className?: string;
}) {
  if (!activeLens) {
    return (
      <p className={cn("text-meta text-muted", className)}>
        Sphere size shows headcount
      </p>
    );
  }

  const meanings = LENS_TONE_MEANINGS[activeLens.id];
  const entries = Object.entries(meanings) as [LensTone, string][];

  return (
    <ul
      className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5", className)}
    >
      {entries.map(([tone, label]) => (
        <li key={tone} className="inline-flex items-center gap-1.5 text-meta">
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: LENS_COLORS[tone] }}
          />
          {label}
        </li>
      ))}
    </ul>
  );
}
