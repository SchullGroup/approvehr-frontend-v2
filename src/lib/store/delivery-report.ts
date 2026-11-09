"use client";

import { useCallback, useState } from "react";
import type { ApiError } from "@/lib/api/client";
import {
  deliveryReportApi,
  type ApiDeliveryReport,
} from "@/lib/api/delivery-report";
import { useFetched } from "@/lib/use-fetched";
import { useSession } from "./session";

/**
 * The weekly delivery report, connected only.
 *
 * ## No demo version, as with the rest of the frame it sits in
 *
 * The Wellness shell refuses every tab without an API, and this report is one
 * of its tabs, so there is nothing here to run offline: a demo answer would be
 * invented grades about invented people. The hook asks nothing while there is no
 * API, and the shell says why before a screen is drawn.
 *
 * ## Nothing is kept past the screen
 *
 * The answer is held in component state through `useFetched` and goes with the
 * screen. It names people and how their work was graded, and the API answers
 * `Cache-Control: no-store` for the same reason: no shared cache, no storage.
 *
 * ## One week at a time, and a page at a time
 *
 * The key is the week and the page. Turning a page keeps the page on screen
 * until the next lands (`data` stays, `loading` is true), so the table does not
 * collapse to skeletons under the reader's cursor. Changing the **week** does
 * not keep it: last week's figures under this week's heading would be a false
 * claim, so a new week reads as loading until it answers. A failure still
 * replaces what was kept: `LoadState` lets the failure win.
 */

export type DeliveryRead = {
  data: ApiDeliveryReport | null;
  loading: boolean;
  error: ApiError | null;
  reload: () => void;
};

/** Rows to a page. The API allows up to a hundred; a screen of people does not need that. */
export const DELIVERY_PAGE_SIZE = 25;

export function useDeliveryReport(
  weekStart: string | null,
  page: number,
): DeliveryRead {
  const { isConnected } = useSession();
  const load = useCallback(
    (signal: AbortSignal) =>
      deliveryReportApi.report(
        {
          ...(weekStart ? { weekStart } : {}),
          page,
          pageSize: DELIVERY_PAGE_SIZE,
        },
        signal,
      ),
    [weekStart, page],
  );
  const live = useFetched<ApiDeliveryReport>(
    `delivery|${weekStart ?? "this"}|${String(page)}`,
    isConnected && weekStart !== null,
    load,
  );

  /* The last answer, for turning a page. Keyed by the week it was for. */
  const [kept, setKept] = useState<{
    week: string | null;
    value: ApiDeliveryReport;
  } | null>(null);
  if (
    live.data !== null &&
    (kept?.week !== weekStart || kept.value !== live.data)
  ) {
    setKept({ week: weekStart, value: live.data });
  }
  const data =
    live.data ?? (kept !== null && kept.week === weekStart ? kept.value : null);

  return {
    data,
    loading: live.loading,
    error: live.error,
    reload: live.reload,
  };
}
