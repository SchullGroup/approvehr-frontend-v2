"use client";

import { useSession } from "./session";
import { ai2Usage, type Ai2Usage, type Ai2UsageWindow } from "@/lib/api/ai2";
import { createSharedResource } from "@/lib/shared-resource";

/**
 * `GET /ai2/usage`, fetched once per organisation however many components
 * show the gauge. `refreshAi2Usage` is called after every completed turn in
 * `ai-chat.ts`/`ai2-chat.ts` so the gauge moves without a poll.
 */

const KEY = "org";

const usageResource = createSharedResource<Ai2Usage | null>(
  async (_key, signal) => {
    try {
      return await ai2Usage(signal);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError")
        throw error;
      // Absent, not a claim about spend — the gauge just doesn't render.
      return null;
    }
  },
);

/** The organisation's usage this month, or `null` while offline, loading or unreadable. */
export function useAi2Usage(): Ai2Usage | null {
  const { isConnected } = useSession();
  return usageResource.use(isConnected ? KEY : null);
}

export function refreshAi2Usage(): void {
  usageResource.refresh(KEY);
}

/**
 * Spent, on the tokens themselves rather than on `usedPercent` — that reading
 * is rounded, so 99.6% of a budget shows as 100 and would shut the composer on
 * a question there was still room for. A budget of zero or less is no budget
 * set, which caps nothing.
 */
function isSpent(spent: Ai2UsageWindow): boolean {
  return spent.limitTokens > 0 && spent.usedTokens >= spent.limitTokens;
}

/**
 * Which window has run out, and so why the composer is shut — `null` when
 * there is room, or while the reading is unknown. An unreadable gauge leaves
 * the assistant open: the server is what actually meters a turn, and refusing
 * to ask on a figure nobody could fetch would be a cap invented on the client.
 *
 * The day is named first when both are spent: it is the one that comes back.
 */
export function useAi2Cap(): "day" | "month" | null {
  const usage = useAi2Usage();
  if (!usage) return null;
  if (isSpent(usage.day)) return "day";
  if (isSpent(usage.month)) return "month";
  return null;
}

/**
 * Why a spent window shuts a composer, in the words the person reads. Written
 * once because both assistant chats meter against this one budget, and two
 * sentences would have them describing the same cap differently.
 */
export function capRefusal(cap: "day" | "month"): string {
  return cap === "day"
    ? "The assistant has spent today's tokens. It can answer again after midnight UTC."
    : "The assistant has spent this month's tokens. It can answer again when the new month starts.";
}
