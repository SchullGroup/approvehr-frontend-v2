import type { ApiApplication } from "@/lib/api/careers";
import {
  demoPostingIdOf,
  demoScreening,
  summaryFor,
  type DemoPerson,
} from "./demo-store";
import { demoNow } from "./demo-clock";
import type { ScreeningSummary } from "./model";

/**
 * Where the demo's screening meets the demo's lists.
 *
 * The queue's rows and the board's cards are made elsewhere; this lays a summary on
 * each of them from the screening book, the way the API would send one with every
 * row. Read from event handlers and gateways, never during render: the book is
 * read with `current()`.
 */

const personOf = (
  row: Pick<
    ApiApplication,
    "id" | "email" | "name" | "postingId" | "postingTitle" | "knockoutCount"
  >,
): DemoPerson => ({
  id: row.id,
  applicationId: row.id,
  email: row.email,
  name: row.name,
  postingId: row.postingId,
  role: row.postingTitle,
  knockoutCount: row.knockoutCount ?? 0,
});

/**
 * Every row with its screening summary.
 *
 * `rows` should be the demo's whole list, in its own order: how far down an
 * advert's applicants a re-score has got is counted along that order.
 */
export function decorateQueue(rows: ApiApplication[]): ApiApplication[] {
  if (!DEMO_ENABLED) return rows;
  const book = demoScreening.current();
  const now = demoNow();
  const totals = new Map<string, number>();
  for (const row of rows)
    totals.set(row.postingId, (totals.get(row.postingId) ?? 0) + 1);
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const order = seen.get(row.postingId) ?? 0;
    seen.set(row.postingId, order + 1);
    const total = totals.get(row.postingId) ?? 0;
    return {
      ...row,
      fit: summaryFor({ book, now, total }, personOf(row), order),
    };
  });
}

/** One pipeline card's summary, from the same book. */
export function cardScreening(card: {
  id: string;
  email: string | null;
  name: string;
  requisitionId: string;
  roleTitle: string;
  knockoutCount: number;
}): ScreeningSummary {
  const book = demoScreening.current();
  return summaryFor(
    { book, now: demoNow(), total: 0 },
    {
      id: card.id,
      applicationId: card.id,
      email: card.email ?? `${card.id}@example.invalid`,
      name: card.name,
      postingId: demoPostingIdOf(card.requisitionId),
      role: card.roleTitle,
      knockoutCount: card.knockoutCount,
    },
    null,
  );
}
