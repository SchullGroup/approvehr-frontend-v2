"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/store/session";
import { useCan } from "@/lib/permissions";
import { reportsApi } from "@/lib/api/reports";
import { performanceApi } from "@/lib/api/performance";
import { goalLens, scoreLens, type Lens } from "./lens-data";

/**
 * Both lenses rank or compare people across departments a viewer might not
 * otherwise see into — the same category the performance module's own
 * nine-box and score register are gated on, and for the identical reason
 * (see that router's own comment, and `catalogue.ts`'s on the goals
 * dataset): a department-level rollup is only honest when the reader can
 * see every department, not a personally-filtered slice of some of them.
 *
 * Neither the Report Builder nor the score register has ever had a
 * demo-mode answer — both already refuse offline for every other screen
 * that reads them, not just this one — so there is nothing to build here
 * for that case. **Absent, not disabled**: without `EDIT_RECORDS` or
 * without a live connection, both lenses stay `null` and the switcher in
 * `explore-screen.tsx` simply does not offer them, rather than offering a
 * control that can only ever fail.
 */
export type LensesState = {
  goals: Lens | null;
  score: Lens | null;
};

export function useLenses(): LensesState {
  const { isConnected } = useSession();
  const canEditRecords = useCan("EDIT_RECORDS");
  const canSeeLenses = canEditRecords && isConnected;

  const [goals, setGoals] = useState<Lens | null>(null);
  const [score, setScore] = useState<Lens | null>(null);

  useEffect(() => {
    if (!canSeeLenses) return;
    let cancelled = false;

    void (async () => {
      try {
        const result = await reportsApi.run({
          dataset: "goals",
          columns: ["department", "status"],
          filters: {},
        });
        if (!cancelled) setGoals(goalLens(result));
      } catch {
        /* Absent, not a broken switcher — the headline Phase 0 view still
           works, and this lens simply does not appear. */
        if (!cancelled) setGoals(null);
      }
    })();

    void (async () => {
      try {
        const cycles = await performanceApi.cycles({ pageSize: 20 });
        /* The most recently due cycle that has actually started. A draft
           has no forms in it yet, so it has nothing a score lens could
           show — the same reasoning `useCycleRegister` applies one
           module along. */
        const current = cycles.data
          .filter((cycle) => cycle.stage !== "DRAFT")
          .sort((a, b) => (b.dueDate ?? "").localeCompare(a.dueDate ?? ""))
          .at(0);
        if (!current) {
          if (!cancelled) setScore(null);
          return;
        }
        const register = await performanceApi.cycleScores(current.id);
        if (!cancelled) setScore(scoreLens(register.rows));
      } catch {
        if (!cancelled) setScore(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canSeeLenses]);

  return canSeeLenses ? { goals, score } : { goals: null, score: null };
}
