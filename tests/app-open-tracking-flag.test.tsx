import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiFeatures } from "@/lib/api/setup";

/**
 * The company's "count days people open the app" switch, as the web reads it.
 *
 * It is the one flag the beacon and the HR card both turn on, so the cases are
 * about the places it could quietly read as on: while the store loads, from an API
 * one deploy behind that does not send it, and after a save whose answer omits it.
 * The features store is a module-level singleton, so each case gets a fresh one.
 */

const api = vi.hoisted(() => ({ features: vi.fn(), updateFeatures: vi.fn() }));

vi.mock("@/lib/store/session", () => ({
  useSession: () => ({
    isConnected: true,
    isLoading: false,
    user: { organizationId: "org-1" },
    can: () => true,
  }),
}));
vi.mock("@/lib/api/setup", async (original) => ({
  ...(await original<typeof import("@/lib/api/setup")>()),
  setup: { features: api.features, updateFeatures: api.updateFeatures },
}));

const features = (over: Partial<ApiFeatures> = {}): ApiFeatures => ({
  headcountBand: "UNDER_10",
  shifts: false,
  loans: false,
  expenses: false,
  appraisals: false,
  departments: false,
  hiring: true,
  grades: false,
  attendance: true,
  surveys: false,
  taxSetup: true,
  pensionSetup: true,
  bankDetails: true,
  multiAppraiser: false,
  leaveTwoStepApproval: false,
  probationTracking: false,
  probationMonths: 6,
  twoFactor: false,
  stepUpActions: [],
  setupStep: 5,
  totalSteps: 5,
  setupCompletedAt: "2026-01-01T00:00:00.000Z",
  setupRequired: false,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

async function read() {
  const { useFeatures } = await import("@/lib/store/features");
  return renderHook(() => useFeatures());
}

describe("appOpenTracking", () => {
  it("is off until the API says it is on, including while the store loads", async () => {
    api.features.mockResolvedValue(features({ appOpenTracking: true }));
    const { result } = await read();
    expect(result.current.loading).toBe(true);
    expect(result.current.appOpenTracking).toBe(false);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.appOpenTracking).toBe(true);
  });

  it("reads an API that does not send it as off", async () => {
    api.features.mockResolvedValue(features());
    const { result } = await read();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.appOpenTracking).toBe(false);
  });

  it("is a switch on the features screen, saved like any other", async () => {
    const { FEATURE_KEYS } = await import("@/lib/api/setup");
    const { FEATURE_COPY } = await import("@/lib/store/features");
    expect(FEATURE_KEYS).toContain("appOpenTracking");
    /* Says what is kept and what is not, in the same breath. */
    expect(FEATURE_COPY.appOpenTracking.line).toMatch(
      /never one person's days/,
    );
    expect(FEATURE_COPY.appOpenTracking.line).not.toContain("—");

    api.features.mockResolvedValue(features());
    api.updateFeatures.mockResolvedValue(features({ appOpenTracking: true }));
    const { useFeatureSettings } = await import("@/lib/store/features");
    const { result } = renderHook(() => useFeatureSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const after = await result.current.setFeature("appOpenTracking", true);
    expect(api.updateFeatures).toHaveBeenCalledWith({ appOpenTracking: true });
    expect(after.appOpenTracking).toBe(true);
    await waitFor(() =>
      expect(result.current.flags.appOpenTracking).toBe(true),
    );
  });
});
