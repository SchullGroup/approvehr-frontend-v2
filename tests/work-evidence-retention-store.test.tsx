import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiFeatures } from "@/lib/api/setup";

/**
 * The retention setting for the work kept behind a final rating, as the web reads and writes it.
 *
 * It has three states that must not collapse: a number (the company's period), `null` (the company's
 * own answer: none chosen, which keeps nothing and is every company's start) and `undefined` (this
 * server has no such setting, or there is no server). A card offers a control only for the first two,
 * so reading an absent field as `null` would offer a control against a server that cannot keep
 * anything. The features store is a module-level singleton, so each case gets a fresh one.
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
  appraisals: true,
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
  const { useFeatureSettings } = await import("@/lib/store/features");
  return renderHook(() => useFeatureSettings());
}

describe("reading it", () => {
  it("is not known while the store loads", async () => {
    api.features.mockResolvedValue(
      features({ workEvidenceRetentionMonths: 18 }),
    );
    const { result } = await read();
    expect(result.current.loading).toBe(true);
    expect(result.current.workEvidenceMonths).toBeUndefined();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.workEvidenceMonths).toBe(18);
  });

  it("keeps null as the company's own answer, none chosen", async () => {
    api.features.mockResolvedValue(
      features({ workEvidenceRetentionMonths: null }),
    );
    const { result } = await read();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.workEvidenceMonths).toBeNull();
  });

  it("keeps an API one deploy behind, which does not send it, as not known: not none chosen", async () => {
    api.features.mockResolvedValue(features());
    const { result } = await read();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.workEvidenceMonths).toBeUndefined();
  });
});

describe("writing it", () => {
  it("sends the number and nothing else, and shows what the server settled on", async () => {
    api.features.mockResolvedValue(
      features({ workEvidenceRetentionMonths: null }),
    );
    api.updateFeatures.mockResolvedValue(
      features({ workEvidenceRetentionMonths: 12 }),
    );
    const { result } = await read();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setWorkEvidenceMonths(12);
    });
    expect(api.updateFeatures).toHaveBeenCalledTimes(1);
    expect(api.updateFeatures).toHaveBeenCalledWith({
      workEvidenceRetentionMonths: 12,
    });
    expect(result.current.workEvidenceMonths).toBe(12);
  });

  it("sends null to stop, and does not leave it out: an absent key would leave the setting alone", async () => {
    api.features.mockResolvedValue(
      features({ workEvidenceRetentionMonths: 12 }),
    );
    api.updateFeatures.mockResolvedValue(
      features({ workEvidenceRetentionMonths: null }),
    );
    const { result } = await read();
    await waitFor(() => expect(result.current.workEvidenceMonths).toBe(12));

    await act(async () => {
      await result.current.setWorkEvidenceMonths(null);
    });
    expect(api.updateFeatures).toHaveBeenCalledWith({
      workEvidenceRetentionMonths: null,
    });
    expect(Object.keys(api.updateFeatures.mock.calls[0]![0] as object)).toEqual(
      ["workEvidenceRetentionMonths"],
    );
    expect(result.current.workEvidenceMonths).toBeNull();
  });

  it("says which setting is being saved while it is, and none after", async () => {
    api.features.mockResolvedValue(
      features({ workEvidenceRetentionMonths: null }),
    );
    let finish: (value: ApiFeatures) => void = () => undefined;
    api.updateFeatures.mockReturnValue(
      new Promise<ApiFeatures>((resolve) => {
        finish = resolve;
      }),
    );
    const { result } = await read();
    await waitFor(() => expect(result.current.loading).toBe(false));

    let saving: Promise<unknown> = Promise.resolve();
    act(() => {
      saving = result.current.setWorkEvidenceMonths(6);
    });
    await waitFor(() =>
      expect(result.current.saving).toBe("workEvidenceRetentionMonths"),
    );
    await act(async () => {
      finish(features({ workEvidenceRetentionMonths: 6 }));
      await saving;
    });
    expect(result.current.saving).toBeNull();
  });

  it("lets the server's refusal through, and leaves what was known as it was", async () => {
    api.features.mockResolvedValue(
      features({ workEvidenceRetentionMonths: 24 }),
    );
    api.updateFeatures.mockRejectedValue(
      new Error("You need the Manage settings permission."),
    );
    const { result } = await read();
    await waitFor(() => expect(result.current.workEvidenceMonths).toBe(24));

    await expect(
      act(async () => {
        await result.current.setWorkEvidenceMonths(36);
      }),
    ).rejects.toThrow("You need the Manage settings permission.");
    expect(result.current.workEvidenceMonths).toBe(24);
    expect(result.current.saving).toBeNull();
  });
});
