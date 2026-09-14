import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstallPrompt } from "@/components/portal/install-prompt";

/**
 * "Add to your home screen" — and the four ways it must stay silent.
 *
 * The manifest, the worker and the icons had been shipping for weeks and
 * nothing told anybody. On Android Chrome offers its own banner on its own
 * schedule; **on iOS there is no prompt at all**, because Add to Home Screen
 * lives behind the Share sheet and Safari never mentions it. So an install on
 * an iPhone only happened if somebody had been told in person.
 *
 * Every test here is about *not* rendering, because that is where this can do
 * harm: an instruction somebody cannot follow is worse than silence, and the
 * four cases below are four different ways to produce one. The positive cases
 * are the easy half.
 */

const PHONE = "(pointer: coarse)";
const NARROW = "(max-width: 767px)";

/**
 * jsdom's `localStorage` here has no `clear`, so it is given a real one.
 *
 * The same gap `setup-guide.test.tsx` found and for the same reason: a fresh
 * backing object per test is what stops one case reading the previous case's
 * dismissal, which would make every "stays silent" assertion pass for the
 * wrong reason.
 */
function freshStorage() {
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
    },
  });
}

/** jsdom implements no `matchMedia`, so the whole thing has to be supplied. */
function media(matching: string[]) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: matching.includes(query),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}

function userAgent(ua: string) {
  Object.defineProperty(window.navigator, "userAgent", {
    writable: true,
    configurable: true,
    value: ua,
  });
}

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 13; SM-A martphone) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";

/** Chrome's `beforeinstallprompt`, which is what "installable" actually means. */
function chromeSaysInstallable() {
  const event = new Event("beforeinstallprompt") as Event & {
    prompt: () => Promise<void>;
  };
  const prompt = vi.fn(() => Promise.resolve());
  event.prompt = prompt;
  act(() => {
    window.dispatchEvent(event);
  });
  return prompt;
}

beforeEach(() => {
  freshStorage();
  media([PHONE, NARROW]);
  userAgent(ANDROID_CHROME);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("when it must stay silent", () => {
  it("says nothing on a desktop", () => {
    /* Chrome on a laptop can install too, and a strip about home screens above
       somebody's payroll on a 27-inch monitor is noise. */
    media([]);
    render(<InstallPrompt />);
    chromeSaysInstallable();
    expect(screen.queryByText(/home screen/i)).toBeNull();
  });

  it("says nothing on a touchscreen laptop", () => {
    /* Coarse pointer alone is not a phone. Both conditions, or a Surface gets
       told to add ApproveHR to its home screen. */
    media([PHONE]);
    render(<InstallPrompt />);
    chromeSaysInstallable();
    expect(screen.queryByText(/home screen/i)).toBeNull();
  });

  it("says nothing when it is already installed", () => {
    media([PHONE, NARROW, "(display-mode: standalone)"]);
    render(<InstallPrompt />);
    chromeSaysInstallable();
    expect(screen.queryByText(/home screen/i)).toBeNull();
  });

  it("says nothing in Chrome on iOS, which cannot install at all", () => {
    /* Chrome, Firefox and Edge on iOS are all WebKit and none of them has Add
       to Home Screen. Telling them to look for it sends somebody into a Share
       sheet with no such item — the exact failure this component exists to
       avoid, inverted. */
    userAgent(IPHONE_CHROME);
    render(<InstallPrompt />);
    expect(screen.queryByText(/home screen/i)).toBeNull();
  });

  it("says nothing on Android until Chrome says it is installable", () => {
    /* `beforeinstallprompt` **is** the installability check — Chrome withholds
       it when the manifest is incomplete or the worker is unclaimed. Guessing
       from the user agent instead would put a dead button in front of people
       on exactly the deployments where something is wrong. */
    render(<InstallPrompt />);
    expect(screen.queryByText(/home screen/i)).toBeNull();
  });

  it("stays silent for good once dismissed", () => {
    render(<InstallPrompt />);
    chromeSaysInstallable();
    expect(
      screen.getByText(/Add ApproveHR to your home screen/i),
    ).toBeVisible();

    act(() => {
      screen.getByLabelText("Not now").click();
    });
    expect(screen.queryByText(/home screen/i)).toBeNull();

    /* And on the next visit. A suggestion that returns every morning is an
       irritation, which is why this persists where the verification banner
       deliberately does not. */
    render(<InstallPrompt />);
    chromeSaysInstallable();
    expect(screen.queryByText(/home screen/i)).toBeNull();
  });
});

describe("what it offers, where it can be done", () => {
  it("gives Android a button that opens the browser's own dialog", () => {
    render(<InstallPrompt />);
    const prompt = chromeSaysInstallable();

    const install = screen.getByRole("button", { name: "Install" });
    act(() => {
      install.click();
    });
    /* The only way to trigger the real dialog: the deferred event, prompted
       from a click. */
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it("gives iOS the two taps, and no button, because there is no API", () => {
    userAgent(IPHONE_SAFARI);
    render(<InstallPrompt />);

    expect(screen.getByText(/Add to Home Screen/)).toBeVisible();
    expect(screen.getByLabelText("the Share button")).toBeInTheDocument();
    /* A button here would do nothing — Safari exposes no install call. */
    expect(screen.queryByRole("button", { name: "Install" })).toBeNull();
  });

  it("survives a browser that keeps nothing", () => {
    /* Private mode throws on `localStorage`. The honest failure is to offer
       the install again next visit, not to crash the shell it sits in. */
    const getItem = vi
      .spyOn(window.localStorage, "getItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    render(<InstallPrompt />);
    chromeSaysInstallable();
    expect(
      screen.getByText(/Add ApproveHR to your home screen/i),
    ).toBeVisible();
    getItem.mockRestore();
  });
});
