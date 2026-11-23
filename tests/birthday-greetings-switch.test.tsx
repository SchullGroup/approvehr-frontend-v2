import {
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import type { ApiFeatures } from "@/lib/api/setup";

/**
 * The company's birthday greetings switch: how the store reads it, and the row
 * on "Turn on more features".
 *
 * It emails every employee once a year, so the cases are about the places it
 * could read as on without anybody having chosen it (while the store loads, from
 * an API one deploy behind that does not send it, after a save whose answer omits
 * it) and about the screen telling the truth when there is no server to send
 * anything.
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

describe("birthdayGreetings in the store", () => {
  it("is off while the store loads, and on only once the API says so", async () => {
    api.features.mockResolvedValue(features({ birthdayGreetings: true }));
    const { useFeatureSettings } = await import("@/lib/store/features");
    const { result } = renderHook(() => useFeatureSettings());
    expect(result.current.loading).toBe(true);
    expect(result.current.flags.birthdayGreetings).toBe(false);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.flags.birthdayGreetings).toBe(true);
  });

  it("reads an API that does not send it as off, never as on", async () => {
    api.features.mockResolvedValue(features());
    const { useFeatureSettings } = await import("@/lib/store/features");
    const { result } = renderHook(() => useFeatureSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.flags.birthdayGreetings).toBe(false);
  });

  it("is saved alone, like any other flag, and the answer is what is kept", async () => {
    api.features.mockResolvedValue(features());
    api.updateFeatures.mockResolvedValue(features({ birthdayGreetings: true }));
    const { useFeatureSettings } = await import("@/lib/store/features");
    const { result } = renderHook(() => useFeatureSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const after = await result.current.setFeature("birthdayGreetings", true);
    expect(api.updateFeatures).toHaveBeenCalledWith({
      birthdayGreetings: true,
    });
    expect(after.birthdayGreetings).toBe(true);
    await waitFor(() =>
      expect(result.current.flags.birthdayGreetings).toBe(true),
    );
  });

  it("reads a save whose answer omits it as off, not as what was sent", async () => {
    api.features.mockResolvedValue(features({ birthdayGreetings: true }));
    api.updateFeatures.mockResolvedValue(features());
    const { useFeatureSettings } = await import("@/lib/store/features");
    const { result } = renderHook(() => useFeatureSettings());
    await waitFor(() =>
      expect(result.current.flags.birthdayGreetings).toBe(true),
    );
    const after = await result.current.setFeature("birthdayGreetings", false);
    expect(after.birthdayGreetings).toBe(false);
  });

  it("says what it does, who is told, and that it starts off, in plain words", async () => {
    const { FEATURE_COPY } = await import("@/lib/store/features");
    const { FEATURE_KEYS, ADVANCED_FEATURE_KEYS } =
      await import("@/lib/api/setup");
    expect(FEATURE_KEYS).toContain("birthdayGreetings");
    expect(ADVANCED_FEATURE_KEYS).toContain("birthdayGreetings");
    const { label, line } = FEATURE_COPY.birthdayGreetings;
    expect(label).toBe("Birthday greetings");
    expect(line).toMatch(/email from the company/);
    expect(line).toMatch(/greeting in ApproveHR/);
    expect(line).toMatch(/Nobody else is told/);
    expect(line).toMatch(/off until you switch it on/);
    /* The one thing a company should know before it decides. */
    expect(line).toMatch(/nobody can opt out yet/);
    expect(line).not.toContain("—");
    /* No age and no date is promised or shown. */
    expect(line).not.toMatch(/\bage\b/i);
  });
});

/* ---------------------------------------------------------------- the row */

const screenMocks = vi.hoisted(() => ({
  setFeature: vi.fn(),
  flags: {} as Record<string, boolean>,
  editable: true,
  source: "api" as "api" | "demo",
}));

describe("the row on Turn on more features", () => {
  async function renderScreen() {
    vi.doMock("next/navigation", () => ({
      useSearchParams: () => new URLSearchParams(),
      usePathname: () => "/settings/features",
      useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
    }));
    vi.doMock("@/components/portal/shell", () => ({
      PageHeader: () => null,
      PageBody: ({ children }: { children: React.ReactNode }) => (
        <div>{children}</div>
      ),
    }));
    vi.doMock("@/hooks/use-url-tab", () => ({
      useUrlTab: () => ["advanced", vi.fn()],
    }));
    vi.doMock("@/lib/store/features", async (original) => ({
      ...(await original<typeof import("@/lib/store/features")>()),
      useFeatureSettings: () => ({
        flags: screenMocks.flags,
        headcountBand: "UNDER_10",
        loading: false,
        error: null,
        source: screenMocks.source,
        setupRequired: false,
        editable: screenMocks.editable,
        saving: null,
        setFeature: screenMocks.setFeature,
        setHeadcountBand: vi.fn(),
      }),
    }));
    const { FeaturesScreen } =
      await import("@/app/(app)/settings/features/features-screen");
    return render(
      <ToastProvider>
        <FeaturesScreen initialTab="advanced" />
      </ToastProvider>,
    );
  }

  beforeEach(() => {
    screenMocks.flags = { birthdayGreetings: false, appOpenTracking: false };
    screenMocks.editable = true;
    screenMocks.source = "api";
    screenMocks.setFeature.mockResolvedValue(undefined);
  });

  it("is off, with its one plain line under the switch, until somebody turns it on", async () => {
    await renderScreen();
    const toggle = screen.getByRole("switch", { name: /Birthday greetings/ });
    expect(toggle).not.toBeChecked();
    expect(toggle).toBeEnabled();
    expect(
      screen.getByText(/On each person's birthday, they get an email/),
    ).toBeInTheDocument();
    expect(screen.getByText(/off until you switch it on/)).toBeInTheDocument();
  });

  it("saves the one flag as it is switched, like the others on the page", async () => {
    await renderScreen();
    fireEvent.click(screen.getByRole("switch", { name: /Birthday greetings/ }));
    await waitFor(() =>
      expect(screenMocks.setFeature).toHaveBeenCalledWith(
        "birthdayGreetings",
        true,
      ),
    );
    expect(screenMocks.setFeature).toHaveBeenCalledTimes(1);
  });

  it("reads as on when the company has it on, and switches off the same way", async () => {
    screenMocks.flags = { birthdayGreetings: true };
    await renderScreen();
    const toggle = screen.getByRole("switch", { name: /Birthday greetings/ });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(screenMocks.setFeature).toHaveBeenCalledWith(
        "birthdayGreetings",
        false,
      ),
    );
  });

  it("cannot be changed by somebody who may not change settings", async () => {
    screenMocks.editable = false;
    await renderScreen();
    expect(
      screen.getByRole("switch", { name: /Birthday greetings/ }),
    ).toBeDisabled();
    expect(screenMocks.setFeature).not.toHaveBeenCalled();
  });

  it("cannot be switched on with no server, and says why instead of saving locally", async () => {
    screenMocks.source = "demo";
    await renderScreen();
    const toggle = screen.getByRole("switch", { name: /Birthday greetings/ });
    expect(toggle).toBeDisabled();
    expect(toggle).not.toBeChecked();
    expect(
      screen.getByText(/can only be switched on for a live company/),
    ).toBeInTheDocument();
    /* The neighbouring switch is not caught by the same rule. */
    expect(
      screen.getByRole("switch", { name: /Count days people open the app/ }),
    ).toBeEnabled();
  });
});
