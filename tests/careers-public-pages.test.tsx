import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The careers pages a stranger opens, rendered the way the server renders them.
 *
 * The page components are async server components, so each test awaits the
 * component, renders what it returned, and reads the page. `fetch` is the only
 * thing faked: the API's real answers — a list, a 404, a 429 with a
 * `Retry-After`, a 500, a dead connection — are what these pages must tell
 * apart, and they used to tell nobody apart ("We could not load the roles just
 * now" for all of them, so a visitor throttled by a shared campus connection read
 * it as the company having no jobs).
 */

const API = "https://api.example.test/api/v1";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), {
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  },
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/careers/acme",
}));

/* What the hosting platform put on the incoming request. Each test sets it. */
let incoming: Record<string, string> = {};
vi.mock("next/headers", () => ({
  headers: async () => new Headers(incoming),
}));

/* The scroll-reveal reaches for `matchMedia` and `IntersectionObserver`, which
   jsdom does not have, and is not what is under test. */
vi.mock("@/components/marketing/motion", () => ({
  Reveal: ({ children, as }: { children: React.ReactNode; as?: string }) => {
    const Tag = (as ?? "div") as "div";
    return <Tag>{children}</Tag>;
  },
}));

const role = (over: Record<string, unknown> = {}) => ({
  slug: "payroll-analyst",
  title: "Payroll Analyst",
  summary: "Run payroll for four hundred people.",
  location: "Lagos",
  employmentType: "FULL_TIME",
  salaryMinKobo: null,
  salaryMaxKobo: null,
  closesOn: null,
  acceptingApplications: true,
  postedOn: "2026-10-01",
  ...over,
});

const detail = (over: Record<string, unknown> = {}) => ({
  ...role(),
  company: "Acme Ltd",
  description: "You will own the monthly run.",
  ...over,
});

const json = (status: number, body: unknown, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

let fetchMock: ReturnType<typeof vi.fn>;

async function pages() {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_API_URL", API);
  const list = (await import("@/app/(marketing)/careers/[org]/page")).default;
  const one = (await import("@/app/(marketing)/careers/[org]/[role]/page"))
    .default;
  return { list, one };
}

async function openList(org = "acme") {
  const { list } = await pages();
  render(await list({ params: Promise.resolve({ org }) }));
}

async function openRole(org = "acme", slug = "payroll-analyst") {
  const { one } = await pages();
  render(await one({ params: Promise.resolve({ org, role: slug }) }));
}

beforeEach(() => {
  incoming = {};
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("the list of open roles", () => {
  it("shows every role with where it is, and a link to each", async () => {
    fetchMock.mockResolvedValue(
      json(200, {
        data: [
          role(),
          role({
            slug: "hr-officer",
            title: "HR Officer",
            location: null,
            closesOn: "2026-11-30",
          }),
        ],
        meta: { total: 2 },
      }),
    );
    await openList();

    expect(
      screen.getByRole("heading", { name: "Payroll Analyst" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Apply by 30 November 2026")).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: /See the role/ });
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/careers/acme/payroll-analyst",
      "/careers/acme/hr-officer",
    ]);
    expect(screen.queryByTestId("careers-notice")).not.toBeInTheDocument();
  });

  it("says nothing is open, and only that, when the company has no live roles", async () => {
    fetchMock.mockResolvedValue(json(200, { data: [], meta: { total: 0 } }));
    await openList();

    expect(screen.getByText("Nothing open right now")).toBeInTheDocument();
    expect(screen.queryByTestId("careers-notice")).not.toBeInTheDocument();
  });

  it("is a 404 when the API says there is no such company", async () => {
    fetchMock.mockResolvedValue(
      json(404, { error: { code: "not_found", message: "Not found." } }),
    );
    const { list } = await pages();
    await expect(
      list({ params: Promise.resolve({ org: "nobody" }) }),
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });

  it("shows the API's own sentence to a throttled visitor, with a way to try again, and does not say there are no jobs", async () => {
    fetchMock.mockResolvedValue(
      json(
        429,
        {
          error: {
            code: "rate_limited",
            message:
              "Too many page views from this connection. Try again in about 3 minutes.",
            reason: "ip_read",
            retryAfterSeconds: 130,
          },
        },
        { "Retry-After": "130" },
      ),
    );
    await openList();

    const notice = screen.getByTestId("careers-notice");
    expect(notice).toHaveAttribute("data-reason", "rate_limited");
    expect(within(notice).getByText(/Too many visits/)).toBeInTheDocument();
    /* Verbatim: the API knows which limit it was, and says so for the visitor. */
    expect(notice).toHaveTextContent(
      "Too many page views from this connection. Try again in about 3 minutes.",
    );
    expect(
      within(notice).getByRole("link", { name: "Try again" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Nothing open right now"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/could not load/i)).not.toBeInTheDocument();
  });

  it("works out the wait itself when a 429 carries no sentence — rounded up, from the header", async () => {
    fetchMock.mockResolvedValue(
      json(429, { error: { code: "rate_limited" } }, { "Retry-After": "130" }),
    );
    await openList();

    const notice = screen.getByTestId("careers-notice");
    /* 130 seconds is "about 3 minutes": up, so nobody retries early. */
    expect(notice).toHaveTextContent("about 3 minutes");
  });

  it("falls back to a plain 'few minutes' when a 429 names no wait and no sentence", async () => {
    fetchMock.mockResolvedValue(json(429, { error: { code: "rate_limited" } }));
    await openList();
    expect(screen.getByTestId("careers-notice")).toHaveTextContent(
      "a few minutes",
    );
  });

  it("calls a 5xx our fault, with a way to try again", async () => {
    fetchMock.mockResolvedValue(
      json(502, { error: { code: "internal", message: "Bad gateway." } }),
    );
    await openList();

    const notice = screen.getByTestId("careers-notice");
    expect(notice).toHaveAttribute("data-reason", "server_error");
    expect(notice).toHaveTextContent("on our side, not yours");
    expect(
      within(notice).getByRole("link", { name: "Try again" }),
    ).toBeInTheDocument();
    expect(notice).not.toHaveTextContent("Too many visits");
  });

  it("says it could not reach the careers system when nothing answers", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await openList();

    const notice = screen.getByTestId("careers-notice");
    expect(notice).toHaveAttribute("data-reason", "unreachable");
    expect(notice).toHaveTextContent("could not reach the careers system");
    expect(
      within(notice).getByRole("link", { name: "Try again" }),
    ).toBeInTheDocument();
  });

  it("offers no retry on a build with no API behind it, because none would help", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    const list = (await import("@/app/(marketing)/careers/[org]/page")).default;
    render(await list({ params: Promise.resolve({ org: "acme" }) }));

    const notice = screen.getByTestId("careers-notice");
    expect(notice).toHaveAttribute("data-reason", "unconfigured");
    expect(
      within(notice).queryByRole("link", { name: "Try again" }),
    ).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gives up on an API that never answers rather than hanging the page", async () => {
    fetchMock.mockImplementation(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("timed out", "TimeoutError")),
          );
        }),
    );
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      const { list } = await pages();
      const pending = list({ params: Promise.resolve({ org: "acme" }) });
      await vi.advanceTimersByTimeAsync(8_500);
      render(await pending);
      expect(screen.getByTestId("careers-notice")).toHaveAttribute(
        "data-reason",
        "unreachable",
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("whose address the API sees", () => {
  const sentHeaders = (): Record<string, string> =>
    (fetchMock.mock.calls[0]?.[1] as { headers: Record<string, string> })
      .headers;

  it("passes the visitor's own address and proves it is the server, so visitors do not share one bucket", async () => {
    vi.stubEnv("PUBLIC_SSR_SECRET", "s".repeat(32));
    incoming = { "x-forwarded-for": "102.89.1.7, 10.0.0.1" };
    fetchMock.mockResolvedValue(json(200, { data: [role()], meta: {} }));
    await openList();

    expect(sentHeaders()["x-careers-client-ip"]).toBe("102.89.1.7");
    expect(sentHeaders()["x-careers-ssr-secret"]).toBe("s".repeat(32));
  });

  it("prefers the single-address header when the platform sets one", async () => {
    vi.stubEnv("PUBLIC_SSR_SECRET", "s".repeat(32));
    incoming = {
      "x-real-ip": "197.210.4.4",
      "x-forwarded-for": "1.2.3.4, 5.6.7.8",
    };
    fetchMock.mockResolvedValue(json(200, { data: detail() }));
    await openRole();

    expect(sentHeaders()["x-careers-client-ip"]).toBe("197.210.4.4");
  });

  it("sends the same two headers for the single-advert read as for the list", async () => {
    vi.stubEnv("PUBLIC_SSR_SECRET", "s".repeat(32));
    incoming = { "x-forwarded-for": "102.89.1.7" };
    fetchMock.mockResolvedValue(json(200, { data: detail() }));
    await openRole();

    expect(Object.keys(sentHeaders())).toEqual(
      expect.arrayContaining(["x-careers-client-ip", "x-careers-ssr-secret"]),
    );
  });

  it("sends neither header when there is no secret to prove it with", async () => {
    incoming = { "x-forwarded-for": "102.89.1.7" };
    fetchMock.mockResolvedValue(json(200, { data: [role()], meta: {} }));
    await openList();

    expect(sentHeaders()).not.toHaveProperty("x-careers-client-ip");
    expect(sentHeaders()).not.toHaveProperty("x-careers-ssr-secret");
  });

  it("sends neither when the platform gave no address, rather than a secret on its own", async () => {
    vi.stubEnv("PUBLIC_SSR_SECRET", "s".repeat(32));
    fetchMock.mockResolvedValue(json(200, { data: [role()], meta: {} }));
    await openList();

    expect(sentHeaders()).not.toHaveProperty("x-careers-ssr-secret");
  });

  it("reads the wait from the body when the header did not come through", async () => {
    fetchMock.mockResolvedValue(
      json(429, {
        error: { code: "rate_limited", retryAfterSeconds: 1500 },
      }),
    );
    await openList();
    expect(screen.getByTestId("careers-notice")).toHaveTextContent(
      "about 25 minutes",
    );
  });
});

describe("one role", () => {
  it("shows the advert and the form to apply for it", async () => {
    fetchMock.mockResolvedValue(json(200, { data: detail() }));
    await openRole();

    expect(
      screen.getByRole("heading", { level: 1, name: "Payroll Analyst" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("You will own the monthly run."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Apply for this role" }),
    ).toBeInTheDocument();
  });

  it("draws the check with the form when the API says the advert needs one", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "0xTESTKEY");
    fetchMock.mockResolvedValue(
      json(200, { data: detail({ captchaRequired: true, acceptsCv: true }) }),
    );
    await openRole();

    const slot = screen.getByTestId("captcha-slot");
    expect(slot).not.toHaveAttribute("data-state", "no-site-key");
    /* An API that says it can take a file gets a file box for the CV. */
    expect(document.querySelector('input[type="file"]')).not.toBeNull();
  });

  it("offers no file box when the API cannot take one, and says to paste a link", async () => {
    fetchMock.mockResolvedValue(json(200, { data: detail({}) }));
    await openRole();

    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(
      screen.getByText(/put a link to your CV in the note/),
    ).toBeInTheDocument();
  });

  it("says plainly that the form cannot be sent when the API needs the check and this site has no key for it", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    fetchMock.mockResolvedValue(
      json(200, { data: detail({ captchaRequired: true }) }),
    );
    await openRole();

    expect(screen.getByTestId("captcha-slot")).toHaveAttribute(
      "data-state",
      "no-site-key",
    );
    expect(screen.getByTestId("captcha-slot")).toHaveTextContent(
      "cannot be sent from here",
    );
  });

  it("draws no check when the API does not ask for one", async () => {
    fetchMock.mockResolvedValue(
      json(200, { data: detail({ captchaRequired: false }) }),
    );
    await openRole();
    expect(screen.queryByTestId("captcha-slot")).not.toBeInTheDocument();
  });

  it("replaces the form with the closing date once applications have closed, and keeps the advert readable", async () => {
    fetchMock.mockResolvedValue(
      json(200, {
        data: detail({ acceptingApplications: false, closesOn: "2026-09-30" }),
      }),
    );
    await openRole();

    expect(screen.getByText("Applications have closed")).toBeInTheDocument();
    expect(
      screen.getByText("The last day to apply was 30 September 2026."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("You will own the monthly run."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Apply for this role" }),
    ).not.toBeInTheDocument();
  });

  it("is a 404 for a draft, a typo or another company's advert alike", async () => {
    fetchMock.mockResolvedValue(
      json(404, { error: { code: "not_found", message: "Not found." } }),
    );
    const { one } = await pages();
    await expect(
      one({ params: Promise.resolve({ org: "acme", role: "nope" }) }),
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });

  it("shows the API's sentence to a throttled visitor, with a way back to the list", async () => {
    fetchMock.mockResolvedValue(
      json(
        429,
        {
          error: {
            code: "rate_limited",
            message:
              "Too many page views from this connection. Try again in about 60 minutes.",
            reason: "ip_read",
            retryAfterSeconds: 3600,
          },
        },
        { "Retry-After": "3600" },
      ),
    );
    await openRole();

    const notice = screen.getByTestId("careers-notice");
    expect(notice).toHaveAttribute("data-reason", "rate_limited");
    expect(notice).toHaveTextContent("Try again in about 60 minutes.");
    expect(
      within(notice).getByRole("link", { name: "See the open roles" }),
    ).toHaveAttribute("href", "/careers/acme");
    expect(
      screen.queryByRole("heading", { name: "Apply for this role" }),
    ).not.toBeInTheDocument();
  });

  it("calls a 5xx our fault and offers a retry", async () => {
    fetchMock.mockResolvedValue(json(500, { error: { code: "internal" } }));
    await openRole();

    const notice = screen.getByTestId("careers-notice");
    expect(notice).toHaveAttribute("data-reason", "server_error");
    expect(
      within(notice).getByRole("link", { name: "Try again" }),
    ).toBeInTheDocument();
  });
});
