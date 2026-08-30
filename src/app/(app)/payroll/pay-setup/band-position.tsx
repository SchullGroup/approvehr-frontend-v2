"use client";

import { AlertTriangle, ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge, Money, Skeleton } from "@/components/ui";
import { naira } from "@/lib/api/grades";
import {
  bandBadge,
  bandLabel,
  bandPositionOf,
  markerPercent,
  type Band,
  type BandPlacement,
} from "@/lib/grades/band";
import { useBandPosition } from "@/lib/store/grades";

/**
 * Where a figure sits in a salary band.
 *
 * Two call shapes, one drawing:
 *
 * ```tsx
 * <BandPosition employeeId={person.id} />                 // fetches
 * <BandPosition grade={band} offerKobo={kobo(1_750_000)} /> // pure
 * ```
 *
 * The second is what the hiring offer screen wants: a figure nobody has been
 * paid yet, drawn against the band for the grade the role is being opened at. It
 * makes no request and works with no session, so it can render inside a form as
 * the number is typed.
 *
 * ## Kobo, both ways
 *
 * `grade` and `offerKobo` are integer kobo, because that is the unit the grade
 * endpoint speaks and re-deriving a band edge from a rounded naira figure is how
 * a meter ends up disagreeing with the offer letter beside it. A caller holding
 * naira converts at the call site with `bandFromNaira` from
 * `@/lib/grades/band` — which lives there rather than here on purpose, because
 * this module is `"use client"` and a server component cannot call a function
 * exported from one, only render it.
 *
 * ## Out of band is drawn, not hidden
 *
 * The marker leaves the track when somebody is paid outside their own band,
 * because that is the single case worth acting on and a meter pinned to the end
 * of its track reads as "at the top" — the opposite of the truth. The colour
 * changes with it and the sentence says which way.
 *
 * ## The label is a sentence
 *
 * "Mid-point". "Below the band for this grade". Never "62nd percentile" — the
 * words are from `lib/grades/band.ts` so this component and the grades table
 * cannot describe the same figure differently.
 */

type Common = {
  className?: string;
  /** Small heading above the meter. Omit for a bare meter. */
  label?: string;
  /** `sm` drops the three edge figures and keeps the track and the sentence. */
  size?: "sm" | "md";
  /**
   * Rendered in the "not on a grade" state.
   *
   * A slot rather than a built-in link, because only the host screen knows where
   * putting somebody on a grade happens from — and an empty state with no way
   * out is the thing this product is trying not to ship.
   */
  action?: React.ReactNode;
};

export type BandPositionProps = Common &
  (
    | { employeeId: string; grade?: never; offerKobo?: never; gradeLabel?: never }
    | {
        employeeId?: never;
        grade: Band;
        /** The figure to place, in kobo. */
        offerKobo: number;
        /** "G3 Lead", or whatever names this band. Optional. */
        gradeLabel?: string;
      }
  );

export function BandPosition(props: BandPositionProps) {
  if (props.employeeId !== undefined) {
    return <FetchedBandPosition {...props} employeeId={props.employeeId} />;
  }
  return (
    <BandMeter
      band={props.grade}
      grossKobo={props.offerKobo}
      placement={bandPositionOf(props.offerKobo, props.grade)}
      gradeLabel={props.gradeLabel}
      {...pick(props)}
    />
  );
}

/** The presentation props, forwarded without repeating the list three times. */
function pick(props: Common): Common {
  return {
    ...(props.className === undefined ? {} : { className: props.className }),
    ...(props.label === undefined ? {} : { label: props.label }),
    ...(props.size === undefined ? {} : { size: props.size }),
    ...(props.action === undefined ? {} : { action: props.action }),
  };
}

/* -------------------------------------------------------------------------- */

function FetchedBandPosition(props: Common & { employeeId: string }) {
  const { data, error, loading } = useBandPosition(props.employeeId);

  if (loading) {
    return (
      <div className={cn("flex flex-col gap-2", props.className)}>
        {props.label && (
          <p className="text-meta font-semibold text-faint">
            {props.label}
          </p>
        )}
        <Skeleton className="h-2 w-full rounded-full" />
        <Skeleton className="h-4 w-40" />
      </div>
    );
  }

  if (error) {
    return (
      <p
        className={cn(
          "flex items-center gap-2 text-body-sm text-danger-text",
          props.className,
        )}
      >
        <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
        {error.message}
      </p>
    );
  }

  if (!data || !data.grade || !data.position) {
    return (
      <div className={cn("flex flex-col gap-2", props.className)}>
        {props.label && (
          <p className="text-meta font-semibold text-faint">
            {props.label}
          </p>
        )}
        <p className="text-body-sm text-muted">
          Not on a grade, so there is no band to compare against.
        </p>
        {props.action}
      </div>
    );
  }

  return (
    <BandMeter
      band={data.grade}
      grossKobo={data.employee.grossMonthlyKobo}
      placement={data.position}
      gradeLabel={`${data.grade.code} ${data.grade.name}`}
      {...pick(props)}
    />
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The drawing. Exported because the grades table draws a row-sized version of
 * the same thing and two meters that disagree is worse than one that is plain.
 */
export function BandMeter({
  band,
  grossKobo,
  placement,
  gradeLabel,
  className,
  label,
  size = "md",
  action,
}: Common & {
  band: Band;
  grossKobo: number;
  placement: BandPlacement;
  gradeLabel?: string;
}) {
  const width = band.maxGrossKobo - band.minGrossKobo;
  const badge = bandBadge(grossKobo, band);
  const sentence = bandLabel(grossKobo, band);
  const marker = markerPercent(grossKobo, band);
  const midPercent =
    width > 0 ? ((band.midGrossKobo - band.minGrossKobo) / width) * 100 : 50;

  const over = placement.headroomKobo < 0;
  const under = placement.shortfallKobo > 0;
  const outside = over || under;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {(label ?? gradeLabel) && (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          {label && (
            <p className="text-meta font-semibold text-faint">
              {label}
            </p>
          )}
          {gradeLabel && (
            <p className="text-body-sm font-medium text-ink">{gradeLabel}</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="flex items-baseline gap-1.5">
          <Money amount={naira(grossKobo)} decimals size="lg" />
          <span className="text-body-sm text-muted">a month</span>
        </p>
        <Badge tone={badge.tone} size="sm">
          {badge.label}
        </Badge>
      </div>

      {/* Padded so a marker sitting past either end is not clipped. */}
      <div className="px-2 pt-1 pb-0.5">
        <div className="relative h-2 rounded-full bg-sunken">
          {/* The midpoint, because compa-ratio is measured against it. */}
          {width > 0 && (
            <span
              aria-hidden="true"
              className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-line-strong"
              style={{ left: `${midPercent}%` }}
            />
          )}
          {/* The part of the band this figure has covered. */}
          <span
            aria-hidden="true"
            className={cn(
              "absolute inset-y-0 left-0 rounded-full",
              outside ? "bg-warning/40" : "bg-success/60",
            )}
            style={{ width: `${Math.max(0, Math.min(100, marker))}%` }}
          />
          <span
            aria-hidden="true"
            className={cn(
              "absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface",
              over
                ? "bg-warning"
                : under
                  ? "bg-info"
                  : "bg-success-strong",
            )}
            style={{ left: `${marker}%` }}
          />
        </div>

        {size === "md" && (
          <div className="mt-2 grid grid-cols-3 text-meta">
            <Edge label="Bottom" kobo={band.minGrossKobo} align="left" />
            <Edge label="Mid-point" kobo={band.midGrossKobo} align="center" />
            <Edge label="Top" kobo={band.maxGrossKobo} align="right" />
          </div>
        )}
      </div>

      <p className="flex flex-wrap items-center gap-x-2 text-body-sm">
        <span className="font-medium text-ink">{sentence}</span>
        {over && (
          <span className="inline-flex items-center gap-1 text-warning-text">
            <ArrowUp aria-hidden="true" className="size-3.5" />
            {formatNaira(-placement.headroomKobo)} over the top
          </span>
        )}
        {under && (
          <span className="inline-flex items-center gap-1 text-info-text">
            <ArrowDown aria-hidden="true" className="size-3.5" />
            {formatNaira(placement.shortfallKobo)} short of the bottom
          </span>
        )}
        {!outside && placement.headroomKobo > 0 && (
          <span className="text-muted">
            {formatNaira(placement.headroomKobo)} of room before the top
          </span>
        )}
      </p>

      {action}
    </div>
  );
}

function Edge({
  label,
  kobo,
  align,
}: {
  label: string;
  kobo: number;
  align: "left" | "center" | "right";
}) {
  return (
    <div
      className={cn(
        align === "center" && "text-center",
        align === "right" && "text-right",
      )}
    >
      <span className="block tabular text-muted">{formatNaira(kobo)}</span>
      <span className="block text-faint">{label}</span>
    </div>
  );
}

/**
 * Two decimals and thousands separators, every time.
 *
 * A band edge is quoted in an offer letter and reconciled against a payslip, so
 * it is never abbreviated — `₦1.9m` and `₦1,900,000.00` are not the same
 * promise. `Money` with `decimals` renders exactly this; this wrapper exists
 * because half of these figures sit mid-sentence where a block element is wrong.
 */
function formatNaira(kobo: number): React.ReactElement {
  return <Money amount={naira(kobo)} decimals className="inline-flex" />;
}
