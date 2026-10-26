import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The once-a-day "opened the app" mark.
 *
 * The API replies 204 whatever happened, so the only things worth holding here
 * are the client's own rules: it asks the company's switch before it speaks, it
 * speaks once per account per company day, it does not use a day up on a failure,
 * it survives storage that throws, and it never waits for or throws on the answer.
 */

const world = vi.hoisted(() => ({
  send: vi.fn(),
  connected: true,
  userId: "user-1" as string | null,
  timeZone: "Africa/Lagos",
  day: "2026-10-21",
  generation: 0,
  features: {
    loading: false,
    source: "api",
    appOpenTracking: true,
  },
}));

vi.mock("@/lib/api/me", () => ({ meApi: { appOpen: world.send } }));
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({
    isConnected: world.connected,
    user: world.userId === null ? null : { id: world.userId },
  }),
  useOrgTimezone: () => world.timeZone,
}));
vi.mock("@/lib/store/features", () => ({
  useFeatures: () => world.features,
}));
vi.mock("@/lib/revalidate", () => ({
  useRevalidation: () => world.generation,
}));
vi.mock("@/lib/time", () => ({ todayIn: () => world.day }));

const { AppOpenBeacon, sendAppOpenOnce } =
  await import("@/components/portal/app-open-beacon");

/**
 * jsdom's `localStorage` in this environment has no working `clear`, so it is
 * given a real one, the same gap `holiday-banner.test.tsx` and `setup-guide.test.tsx`
 * found: a fresh backing object per test is what stops one case's day leaking into
 * the next.
 */
function freshStorage(over: Partial<Storage> = {}) {
  let held: Record<string, string> = {};
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => held[k] ?? null,
      setItem: (k: string, v: string) => {
        held[k] = v;
      },
      removeItem: (k: string) => {
        delete held[k];
      },
      clear: () => {
        held = {};
      },
      ...over,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  freshStorage();
  world.send.mockResolvedValue(undefined);
  world.connected = true;
  world.userId = "user-1";
  world.timeZone = "Africa/Lagos";
  world.day = "2026-10-21";
  world.generation = 0;
  world.features = { loading: false, source: "api", appOpenTracking: true };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sendAppOpenOnce", () => {
  it("sends the first time in a day, and not again that day", async () => {
    expect(await sendAppOpenOnce("u", "2026-10-21", world.send)).toBe("sent");
    expect(await sendAppOpenOnce("u", "2026-10-21", world.send)).toBe(
      "skipped",
    );
    expect(world.send).toHaveBeenCalledTimes(1);
  });

  it("sends again the next company day", async () => {
    await sendAppOpenOnce("u", "2026-10-21", world.send);
    expect(await sendAppOpenOnce("u", "2026-10-22", world.send)).toBe("sent");
    expect(world.send).toHaveBeenCalledTimes(2);
  });

  it("keeps a day per account, so the second person on a shared machine is counted", async () => {
    await sendAppOpenOnce("ada", "2026-10-21", world.send);
    expect(await sendAppOpenOnce("chidi", "2026-10-21", world.send)).toBe(
      "sent",
    );
    expect(world.send).toHaveBeenCalledTimes(2);
  });

  it("does not use a day up on a failure, and does not retry in a loop", async () => {
    world.send.mockRejectedValueOnce(new Error("offline"));
    expect(await sendAppOpenOnce("u", "2026-10-21", world.send)).toBe("failed");
    expect(world.send).toHaveBeenCalledTimes(1);
    /* The next app load tries again. */
    expect(await sendAppOpenOnce("u", "2026-10-21", world.send)).toBe("sent");
    expect(world.send).toHaveBeenCalledTimes(2);
  });

  it("is one request when two callers race, which is what a double-run effect is", async () => {
    let finish: () => void = () => undefined;
    world.send.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const first = sendAppOpenOnce("u", "2026-10-21", world.send);
    const second = sendAppOpenOnce("u", "2026-10-21", world.send);
    expect(await second).toBe("skipped");
    finish();
    expect(await first).toBe("sent");
    expect(world.send).toHaveBeenCalledTimes(1);
  });

  it("still sends, and does not throw, when storage throws on every call", async () => {
    const blocked = () => {
      throw new Error("blocked");
    };
    freshStorage({ getItem: blocked, setItem: blocked });
    expect(await sendAppOpenOnce("u", "2026-10-21", world.send)).toBe("sent");
    expect(world.send).toHaveBeenCalledTimes(1);
  });
});

describe("AppOpenBeacon", () => {
  it("renders nothing", () => {
    const { container } = render(<AppOpenBeacon />);
    expect(container).toBeEmptyDOMElement();
  });

  it("sends once when the company has tracking on", async () => {
    const { rerender } = render(<AppOpenBeacon />);
    await waitFor(() => expect(world.send).toHaveBeenCalledTimes(1));
    rerender(<AppOpenBeacon />);
    rerender(<AppOpenBeacon />);
    expect(world.send).toHaveBeenCalledTimes(1);
  });

  it("stays quiet while the company's switch is off", () => {
    world.features = { loading: false, source: "api", appOpenTracking: false };
    render(<AppOpenBeacon />);
    expect(world.send).not.toHaveBeenCalled();
  });

  it("stays quiet until the switch is known, because off is its default while it loads", () => {
    world.features = {
      loading: true,
      source: "loading",
      appOpenTracking: true,
    };
    render(<AppOpenBeacon />);
    expect(world.send).not.toHaveBeenCalled();
  });

  it("stays quiet in a demo company, which has no server to tell", () => {
    world.features = { loading: false, source: "demo", appOpenTracking: true };
    render(<AppOpenBeacon />);
    expect(world.send).not.toHaveBeenCalled();
  });

  it("stays quiet when nobody is connected or there is no account", () => {
    world.connected = false;
    render(<AppOpenBeacon />);
    world.connected = true;
    world.userId = null;
    render(<AppOpenBeacon />);
    expect(world.send).not.toHaveBeenCalled();
  });

  it("counts the person again when they come back to a tab left open past midnight", async () => {
    const { rerender } = render(<AppOpenBeacon />);
    await waitFor(() => expect(world.send).toHaveBeenCalledTimes(1));

    /* They return to the window the same day: a no-op. */
    world.generation = 1;
    rerender(<AppOpenBeacon />);
    expect(world.send).toHaveBeenCalledTimes(1);

    /* They return the next company day: counted. */
    world.generation = 2;
    world.day = "2026-10-22";
    await act(async () => {
      rerender(<AppOpenBeacon />);
    });
    await waitFor(() => expect(world.send).toHaveBeenCalledTimes(2));
  });

  it("does not throw or leave a rejection behind when the answer is a failure", async () => {
    world.send.mockRejectedValue(new Error("429"));
    render(<AppOpenBeacon />);
    await waitFor(() => expect(world.send).toHaveBeenCalledTimes(1));
    /* An unhandled rejection would fail this run; reaching here is the assertion. */
    await Promise.resolve();
  });

  it("does not hold the screen while the request is in flight", () => {
    world.send.mockReturnValue(new Promise(() => undefined));
    const { container } = render(<AppOpenBeacon />);
    /* It rendered, synchronously, with the request still pending. */
    expect(container).toBeEmptyDOMElement();
  });
});
