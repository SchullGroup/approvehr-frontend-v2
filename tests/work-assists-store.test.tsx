import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiFeatures } from "@/lib/api/setup";

/**
 * The two-assists setting (linked tasks beside Confirm, weekly-line suggestions), as the web reads and writes it.
 *
 * It has three states that must not collapse: `true`, `false`, and `null`, which is a server that does
 * not say (one deploy behind, or no server). A card offers a switch only for the first two, so reading
 * an absent field as `false` would offer a switch against a server that cannot hold the setting. The
 * features store is a module-level singleton, so each case gets a fresh one.
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
    api.features.mockResolvedValue(features({ workAssists: true }));
    const { result } = await read();
    expect(result.current.loading).toBe(true);
    expect(result.current.workAssists).toBeNull();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.workAssists).toBe(true);
  });

  it("keeps false as the company's own answer", async () => {
    api.features.mockResolvedValue(features({ workAssists: false }));
    const { result } = await read();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.workAssists).toBe(false);
  });

  it("keeps an API one deploy behind, which does not send it, as not known: not off", async () => {
    api.features.mockResolvedValue(features());
    const { result } = await read();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.workAssists).toBeNull();
  });

  it("is not a feature flag: it hides no screen, so the nav cannot be filtered on it", async () => {
    api.features.mockResolvedValue(features({ workAssists: true }));
    const { result } = await read();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.flags).not.toHaveProperty("workAssists");
  });
});

describe("writing it", () => {
  it("sends the one boolean and nothing else, and shows what the server settled on", async () => {
    api.features.mockResolvedValue(features({ workAssists: false }));
    api.updateFeatures.mockResolvedValue(features({ workAssists: true }));
    const { result } = await read();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setWorkAssists(true);
    });
    expect(api.updateFeatures).toHaveBeenCalledTimes(1);
    expect(api.updateFeatures).toHaveBeenCalledWith({ workAssists: true });
    expect(Object.keys(api.updateFeatures.mock.calls[0]![0] as object)).toEqual(
      ["workAssists"],
    );
    expect(result.current.workAssists).toBe(true);
  });

  it("sends false to turn it off, and does not leave the key out", async () => {
    api.features.mockResolvedValue(features({ workAssists: true }));
    api.updateFeatures.mockResolvedValue(features({ workAssists: false }));
    const { result } = await read();
    await waitFor(() => expect(result.current.workAssists).toBe(true));

    await act(async () => {
      await result.current.setWorkAssists(false);
    });
    expect(api.updateFeatures).toHaveBeenCalledWith({ workAssists: false });
    expect(result.current.workAssists).toBe(false);
  });

  it("says which setting is being saved while it is, and none after", async () => {
    api.features.mockResolvedValue(features({ workAssists: false }));
    let release: (value: ApiFeatures) => void = () => undefined;
    api.updateFeatures.mockReturnValue(
      new Promise<ApiFeatures>((resolve) => {
        release = resolve;
      }),
    );
    const { result } = await read();
    await waitFor(() => expect(result.current.loading).toBe(false));

    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.setWorkAssists(true);
    });
    await waitFor(() => expect(result.current.saving).toBe("workAssists"));
    await act(async () => {
      release(features({ workAssists: true }));
      await pending;
    });
    expect(result.current.saving).toBeNull();
  });

  it("keeps the old value, and throws, when the server refuses", async () => {
    api.features.mockResolvedValue(features({ workAssists: false }));
    api.updateFeatures.mockRejectedValue(new Error("Not allowed"));
    const { result } = await read();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.setWorkAssists(true)).rejects.toThrow(
        "Not allowed",
      );
    });
    expect(result.current.workAssists).toBe(false);
    expect(result.current.saving).toBeNull();
  });
});
