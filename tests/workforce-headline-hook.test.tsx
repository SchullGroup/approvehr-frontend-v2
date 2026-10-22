import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiWorkforceHeadline } from "@/lib/api/insights";
import { useWorkforceHeadline } from "@/app/(app)/reports/explore/use-lenses";

/**
 * What the Explore screen's headline line is handed.
 *
 * `null` is the clean absence and the screen draws nothing for it. The
 * assertions are on the hook because the line itself is one `headline && <p>`:
 * everything that decides whether there is something to say lives here, in
 * `printableHeadline`, shared with the dashboard banner.
 */

const gate = vi.hoisted(() => ({
  connected: true,
  canEditRecords: true,
  response: null as unknown,
  fail: false,
}));

vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: gate.connected }),
}));
vi.mock("@/lib/permissions", () => ({
  useCan: () => gate.canEditRecords,
}));
vi.mock("@/lib/api/insights", async (original) => ({
  ...(await original<typeof import("@/lib/api/insights")>()),
  insightsApi: {
    workforceHeadline: () =>
      gate.fail
        ? Promise.reject(new Error("503"))
        : Promise.resolve(gate.response),
  },
}));

const headline = (
  rule: string,
  sentence = "A sentence.",
): ApiWorkforceHeadline =>
  ({
    cycleId: null,
    cycleName: null,
    departments: [],
    rule,
    sentence,
  }) as ApiWorkforceHeadline;

beforeEach(() => {
  gate.connected = true;
  gate.canEditRecords = true;
  gate.response = null;
  gate.fail = false;
});

describe("useWorkforceHeadline", () => {
  it("hands over a sentence the screen may print", async () => {
    gate.response = headline(
      "off-track-goals",
      "Operations has 2 of 4 off track.",
    );
    const { result } = renderHook(() => useWorkforceHeadline());
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.sentence).toBe("Operations has 2 of 4 off track.");
  });

  it("stays null when the API says nothing stands out", async () => {
    gate.response = headline("none", "Nothing stands out this cycle.");
    const { result } = renderHook(() => useWorkforceHeadline());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current).toBeNull();
  });

  it("stays null for the retired task-logging rule", async () => {
    gate.response = headline(
      "task-intensity-outlier",
      "Engineering has the weakest task-logging this cycle.",
    );
    const { result } = renderHook(() => useWorkforceHeadline());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current).toBeNull();
  });

  it("stays null when the request fails", async () => {
    gate.fail = true;
    const { result } = renderHook(() => useWorkforceHeadline());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current).toBeNull();
  });

  it("stays null without EDIT_RECORDS, without asking", async () => {
    gate.canEditRecords = false;
    gate.response = headline("off-track-goals");
    const { result } = renderHook(() => useWorkforceHeadline());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current).toBeNull();
  });
});
