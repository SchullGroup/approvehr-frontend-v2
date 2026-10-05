import type { ApiReportResult } from "@/lib/api/reports";
import type {
  ApiDepartmentPromotionReadiness,
  ApiDepartmentTaskIntensity,
  ApiScoreRow,
} from "@/lib/api/performance";

/**
 * Phase 1's two lenses, and the rule neither may break: a lens repaints
 * colour and never moves a cluster — `cluster-data.ts#layoutClusters` is
 * the only thing that ever decides a position, and nothing here returns
 * one.
 */

export type LensTone = "neutral" | "success" | "warning" | "danger";

export type LensValue = {
  tone: LensTone;
  /** Shown in the drawer for the selected department while this lens is active. */
  detail: string;
};

export type LensId =
  "goals" | "score" | "intensity" | "topScorer" | "promotion";

export type Lens = {
  id: LensId;
  label: string;
  /** Keyed by department name — the one thing `cluster-data.ts`'s nodes and
      a Report Builder row both carry, and the only field that is safe to
      join on (see `cluster-data.ts`'s own header on why position never
      carries a department id this lens could not also resolve). */
  byDepartment: ReadonlyMap<string, LensValue>;
};

export const LENS_COLORS: Record<LensTone, string> = {
  neutral: "#8492a0",
  success: "#8ac97d",
  warning: "#d99400",
  danger: "#dc3b32",
};

/**
 * Goal achievement, from the "goals" Report Builder dataset's raw rows.
 *
 * Fetched ungrouped (`columns: ["department", "status"]`, no `groupBy`) and
 * grouped here instead — the engine's grouping only sums a single column
 * per bucket, and a status *mix* needs every row, so one ungrouped fetch
 * answers it in a single round trip rather than one call per status value.
 *
 * A company-wide goal's `department` cell is `null` and is skipped: "the
 * whole company" has no one sphere to colour, and folding it into every
 * department would overstate each one's own achievement.
 *
 * Tone is real semantic colour, not a neutral quartile band — unlike a cost
 * or headcount comparison, "this department has an off-track goal" has
 * actual ground truth, the same reasoning that gives payroll-readiness its
 * real tones elsewhere in this codebase's charts.
 */
export function goalLens(result: ApiReportResult): Lens {
  const departmentIdx = result.columns.findIndex((c) => c.key === "department");
  const statusIdx = result.columns.findIndex((c) => c.key === "status");

  const buckets = new Map<
    string,
    { total: number; offTrack: number; atRisk: number }
  >();
  if (departmentIdx !== -1 && statusIdx !== -1) {
    for (const row of result.rows) {
      const department = row[departmentIdx];
      if (typeof department !== "string") continue;
      const status = row[statusIdx];
      const bucket = buckets.get(department) ?? {
        total: 0,
        offTrack: 0,
        atRisk: 0,
      };
      bucket.total += 1;
      if (status === "OFF_TRACK") bucket.offTrack += 1;
      else if (status === "AT_RISK") bucket.atRisk += 1;
      buckets.set(department, bucket);
    }
  }

  const byDepartment = new Map<string, LensValue>();
  for (const [department, { total, offTrack, atRisk }] of buckets) {
    const plural = (n: number) => (n === 1 ? "goal" : "goals");
    if (offTrack > 0) {
      byDepartment.set(department, {
        tone: "danger",
        detail: `${String(offTrack)} of ${String(total)} ${plural(total)} off track`,
      });
    } else if (atRisk > 0) {
      byDepartment.set(department, {
        tone: "warning",
        detail: `${String(atRisk)} of ${String(total)} ${plural(total)} at risk`,
      });
    } else {
      byDepartment.set(department, {
        tone: "success",
        detail: `All ${String(total)} ${plural(total)} on track or done`,
      });
    }
  }

  return { id: "goals", label: "Goal achievement", byDepartment };
}

/**
 * Composite score, from one cycle's score register.
 *
 * Aggregates the API's own `band` per person — never recomputes one, the
 * "never re-implement a score" rule this whole codebase keeps restating —
 * into "does this department have anyone below expectations" at a glance.
 * Someone with `band: null` (unscored) counts toward the department's total
 * but not its scored count, the same absent-is-not-zero distinction the
 * band itself already makes.
 */
export function scoreLens(rows: readonly ApiScoreRow[]): Lens {
  const buckets = new Map<
    string,
    { total: number; scored: number; below: number; partial: number }
  >();
  for (const row of rows) {
    const department = row.departmentName;
    if (department === null) continue;
    const bucket = buckets.get(department) ?? {
      total: 0,
      scored: 0,
      below: 0,
      partial: 0,
    };
    bucket.total += 1;
    if (row.band !== null) {
      bucket.scored += 1;
      if (row.band === "BELOW") bucket.below += 1;
      else if (row.band === "PARTIALLY_MEETS") bucket.partial += 1;
    }
    buckets.set(department, bucket);
  }

  const byDepartment = new Map<string, LensValue>();
  for (const [department, { total, scored, below, partial }] of buckets) {
    if (scored === 0) {
      byDepartment.set(department, {
        tone: "neutral",
        detail: `None of ${String(total)} scored yet`,
      });
    } else if (below > 0) {
      byDepartment.set(department, {
        tone: "danger",
        detail: `${String(scored)} of ${String(total)} scored — ${String(below)} below expectations`,
      });
    } else if (partial > 0) {
      byDepartment.set(department, {
        tone: "warning",
        detail: `${String(scored)} of ${String(total)} scored — ${String(partial)} partially meeting`,
      });
    } else {
      byDepartment.set(department, {
        tone: "success",
        detail: `${String(scored)} of ${String(total)} scored — meeting or exceeding`,
      });
    }
  }

  return { id: "score", label: "Composite score", byDepartment };
}

/**
 * Task-logging intensity, from one cycle's department breakdown.
 *
 * Reads participation, not quality — whether someone has a graded task at
 * all this cycle, never how good it was, which is what the score lens above
 * already answers. Tone comes from a count of people the cycle asked who
 * have logged nothing graded yet, the same "any/most is a problem, none is
 * fine" shape `goalLens` and `scoreLens` both use — not an invented
 * percentage cutoff. There is no existing band anywhere in this codebase for
 * what completion rate counts as "enough," and this lens does not invent
 * one: `avgRate` is shown as context in the detail text, never used to pick
 * the tone.
 */
export function intensityLens(
  rows: readonly ApiDepartmentTaskIntensity[],
): Lens {
  const byDepartment = new Map<string, LensValue>();

  for (const { departmentName, total, logging, silent, avgRate } of rows) {
    const plural = (n: number) => (n === 1 ? "person" : "people");

    if (logging === 0) {
      byDepartment.set(departmentName, {
        tone: "neutral",
        detail: `None of ${String(total)} ${plural(total)} have a graded task yet this cycle`,
      });
      continue;
    }

    const base = `${String(logging)} of ${String(total)} logging, averaging ${String(avgRate ?? 0)}% complete`;
    if (silent > logging) {
      byDepartment.set(departmentName, {
        tone: "danger",
        detail: `${base} — ${String(silent)} silent this cycle`,
      });
    } else if (silent > 0) {
      byDepartment.set(departmentName, {
        tone: "warning",
        detail: `${base} — ${String(silent)} silent this cycle`,
      });
    } else {
      byDepartment.set(departmentName, { tone: "success", detail: base });
    }
  }

  return { id: "intensity", label: "Task-logging intensity", byDepartment };
}

/** Narrows a score row to the ones with an actual mark — a department's
    "best performer" is silent about who has no mark at all, the same
    absence `scoreLens` already leaves out of `below`/`partial`. */
function isScored<
  T extends { scoreBp: number | null; departmentName: string | null },
>(row: T): row is T & { scoreBp: number; departmentName: string } {
  return row.scoreBp !== null && row.departmentName !== null;
}

/**
 * The top composite score in each department, from the same register rows
 * `scoreLens` already reads — no second fetch. Reusing `appraiserMark`
 * off the row is the "full transparency" half of this lens: a top score is
 * shown with how many appraisers actually produced it, never as a bare
 * number that could be one person's opinion.
 *
 * A tie names everybody at the top figure rather than picking one — silently
 * dropping a tied second place would be exactly the kind of bias this whole
 * screen exists to avoid.
 */
export function topScorerLens(rows: readonly ApiScoreRow[]): Lens {
  const byDept = new Map<string, ApiScoreRow[]>();
  for (const row of rows) {
    if (row.departmentName === null) continue;
    const list = byDept.get(row.departmentName) ?? [];
    list.push(row);
    byDept.set(row.departmentName, list);
  }

  const byDepartment = new Map<string, LensValue>();
  for (const [department, people] of byDept) {
    const scored = people.filter(isScored);
    if (scored.length === 0) {
      byDepartment.set(department, {
        tone: "neutral",
        detail: `None of ${String(people.length)} scored yet`,
      });
      continue;
    }

    const topScoreBp = Math.max(...scored.map((row) => row.scoreBp));
    const top = scored.filter((row) => row.scoreBp === topScoreBp);
    const names = top.map((row) => row.employeeName).join(" and ");
    const { appraisers } = top[0]!.appraiserMark;
    const percent = top[0]!.scorePercent ?? Math.round(topScoreBp / 100);
    byDepartment.set(department, {
      tone: "success",
      detail: `${names} — ${top[0]!.bandLabel ?? "Scored"} at ${String(percent)}%, ${String(appraisers)} ${appraisers === 1 ? "appraiser" : "appraisers"} weighted`,
    });
  }

  return { id: "topScorer", label: "Best performer", byDepartment };
}

/**
 * Promotion-readiness, from the API's own per-department breakdown.
 *
 * A department the API returned with an empty `people` list was checked and
 * nobody in it currently clears the bar — a real, common, and entirely
 * different fact from a department this lens never looked at, which is why
 * it still gets an entry here rather than being left for the generic
 * "No data for this department" fallback. See the API's own header for what
 * "clears the bar" means, and why there is no softer, partial version of it.
 */
export function promotionReadyLens(
  rows: readonly ApiDepartmentPromotionReadiness[],
): Lens {
  const byDepartment = new Map<string, LensValue>();

  for (const { departmentName, people } of rows) {
    if (people.length === 0) {
      byDepartment.set(departmentName, {
        tone: "neutral",
        detail: "Nobody clears the bar this cycle",
      });
      continue;
    }

    const names = people.map((person) => person.employeeName).join(", ");
    const [, latestCycle] = people[0]!.cycles;
    byDepartment.set(departmentName, {
      tone: "success",
      detail: `${names} — top band two cycles running (through ${latestCycle}), meeting every expected competency`,
    });
  }

  return { id: "promotion", label: "Promotion-readiness", byDepartment };
}
