import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The form a stranger fills in to apply.
 *
 * Rendered and typed into, with `fetch` as the only fake. The refusals matter as
 * much as the success: the API can say "too many", "already applied", "that
 * field is wrong", "complete the check", or fall over, and each has a different
 * next step for a person on a phone. They all used to land in one box.
 */

const API = "https://api.example.test/api/v1";
const SITE_KEY = "0xTESTSITEKEY";

type Sent = Record<string, unknown>;
let fetchMock: ReturnType<typeof vi.fn>;

const json = (status: number, body: unknown, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

const accepted = () =>
  json(201, {
    data: {
      id: "app-1",
      company: "Acme Ltd",
      postingTitle: "Payroll Analyst",
      note: "Acme Ltd has your application for Payroll Analyst.",
      cvNote: null,
    },
  });

async function mount(props: { captchaRequired?: boolean } = {}) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_API_URL", API);
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", SITE_KEY);
  const { ApplyForm } =
    await import("@/app/(marketing)/careers/[org]/[role]/apply-form");
  const user = userEvent.setup();
  render(
    <ApplyForm
      org="acme"
      roleSlug="payroll-analyst"
      roleTitle="Payroll Analyst"
      company="Acme Ltd"
      {...props}
    />,
  );
  return { user };
}

async function fillIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/First name/), "Chioma");
  await user.type(screen.getByLabelText(/Surname/), "Aduba");
  await user.type(screen.getByLabelText(/^Email/), "chioma@example.com");
}

const send = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: /Send application/ }));

const lastBody = (): Sent => {
  const init = fetchMock.mock.calls.at(-1)?.[1] as { body: string };
  return JSON.parse(init.body) as Sent;
};

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  document.head
    .querySelectorAll('script[src*="challenges.cloudflare.com"]')
    .forEach((node) => node.remove());
  delete (window as { turnstile?: unknown }).turnstile;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("sending an application", () => {
  it("checks the three required boxes first, names each, and sends nothing", async () => {
    const { user } = await mount();
    await send(user);

    expect(screen.getByText("Enter your first name.")).toBeInTheDocument();
    expect(screen.getByText("Enter your surname.")).toBeInTheDocument();
    expect(
      screen.getByText("We need an email to reply to."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/First name/)).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends what was typed and then says the application is sent, truthfully about email", async () => {
    fetchMock.mockResolvedValue(accepted());
    const { user } = await mount();
    await fillIn(user);
    await send(user);

    expect(
      await screen.findByRole("heading", { name: "Application sent" }),
    ).toBeInTheDocument();
    expect(lastBody()).toMatchObject({
      firstName: "Chioma",
      lastName: "Aduba",
      email: "chioma@example.com",
    });

    const panel = screen.getByRole("heading", { name: "Application sent" })
      .parentElement as HTMLElement;
    /* The two things the old line got wrong: "email is not connected" is a
       statement about our plumbing that no applicant can use, and "No
       confirmation email will arrive" read as a failure. What is true is that we
       do not send one yet, and that the company will be in touch. */
    expect(panel).not.toHaveTextContent(/not connected/i);
    expect(panel).toHaveTextContent("We do not send a confirmation email yet");
    expect(panel).toHaveTextContent("chioma@example.com");
    expect(panel).toHaveTextContent("Acme Ltd will contact you directly");
  });
});

describe("the honeypot", () => {
  const trap = () =>
    screen
      .getByTestId("apply-honeypot")
      .querySelector("input") as HTMLInputElement;

  it("is on the form, empty, out of the tab order and told not to autofill", async () => {
    await mount();
    const input = trap();

    expect(input.name).toBe("faxNumber");
    expect(input.value).toBe("");
    expect(input.tabIndex).toBe(-1);
    expect(input).toHaveAttribute("autocomplete", "off");
    expect(input).toHaveAttribute("data-1p-ignore", "true");
    expect(input).toHaveAttribute("data-lpignore", "true");
  });

  it("is hidden from assistive technology, so a screen reader never meets it", async () => {
    await mount();
    expect(screen.getByTestId("apply-honeypot")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    /* Only the five boxes a person fills in are exposed as text boxes. */
    const boxes = screen.getAllByRole("textbox").map((box) => box.id);
    expect(boxes).toEqual(["firstName", "lastName", "email", "phone", "note"]);
    expect(
      screen.queryByRole("textbox", { name: /Leave this box empty/ }),
    ).not.toBeInTheDocument();
  });

  it("is never reached by tabbing through the form", async () => {
    const { user } = await mount();
    const seen = new Set<Element>();
    for (let i = 0; i < 12; i += 1) {
      await user.tab();
      if (document.activeElement) seen.add(document.activeElement);
    }
    expect(seen.has(trap())).toBe(false);
    expect(
      seen.has(screen.getByRole("button", { name: /Send application/ })),
    ).toBe(true);
  });

  it("is off-screen rather than display:none, so a script that skips hidden fields still finds it", async () => {
    await mount();
    const wrapper = screen.getByTestId("apply-honeypot");
    expect(wrapper.style.display).not.toBe("none");
    expect(wrapper.style.position).toBe("absolute");
    expect(wrapper.style.left).toBe("-10000px");
  });

  it("is sent empty with every application from a person", async () => {
    fetchMock.mockResolvedValue(accepted());
    const { user } = await mount();
    await fillIn(user);
    await send(user);
    await screen.findByText("Application sent");

    expect(lastBody()).toHaveProperty("faxNumber", "");
  });

  it("is sent as filled when something filled it, leaving the verdict to the API", async () => {
    fetchMock.mockResolvedValue(accepted());
    const { user } = await mount();
    await fillIn(user);
    /* A script writes to every input it can find, including the trap. */
    await user.type(trap(), "http://spam.example");
    await send(user);
    await screen.findByText("Application sent");

    expect(lastBody()).toHaveProperty("faxNumber", "http://spam.example");
  });
});

describe("when the API refuses", () => {
  it("tells a throttled applicant how long to wait and keeps what they typed", async () => {
    fetchMock.mockResolvedValue(
      json(
        429,
        {
          error: {
            code: "rate_limited",
            message: "Old text that names a fixed hour.",
          },
        },
        { "Retry-After": "2400" },
      ),
    );
    const { user } = await mount();
    await fillIn(user);
    await send(user);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveAttribute("data-kind", "rate_limited");
    /* 2,400 seconds is 40 minutes. The API's own sentence names a fixed hour
       and would be wrong about the real remainder, so it is not shown. */
    expect(alert).toHaveTextContent("Wait about 40 minutes");
    expect(alert).not.toHaveTextContent("Old text");
    expect(alert).toHaveTextContent("What you typed is still here");

    expect(screen.getByLabelText(/First name/)).toHaveValue("Chioma");
    expect(screen.getByLabelText(/^Email/)).toHaveValue("chioma@example.com");
    expect(
      screen.getByRole("button", { name: /Send application/ }),
    ).toBeEnabled();
  });

  it("falls back to the body's figure when the header is not readable cross-origin", async () => {
    fetchMock.mockResolvedValue(
      json(429, {
        error: {
          code: "rate_limited",
          message: "Slow down.",
          retryAfterSeconds: 90,
        },
      }),
    );
    const { user } = await mount();
    await fillIn(user);
    await send(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Wait about 2 minutes",
    );
  });

  it("uses the API's own sentence for a 429 that names no wait at all", async () => {
    fetchMock.mockResolvedValue(
      json(429, {
        error: { code: "rate_limited", message: "Wait a little, please." },
      }),
    );
    const { user } = await mount();
    await fillIn(user);
    await send(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Wait a little, please.",
    );
  });

  it("says a server fault is ours, and keeps the form filled in to try again", async () => {
    fetchMock.mockResolvedValue(
      json(500, { error: { code: "internal", message: "stack trace here" } }),
    );
    const { user } = await mount();
    await fillIn(user);
    await send(user);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveAttribute("data-kind", "server_error");
    expect(alert).toHaveTextContent("on our side, not yours");
    expect(alert).not.toHaveTextContent("stack trace");
    expect(screen.getByLabelText(/Surname/)).toHaveValue("Aduba");
  });

  it("passes on the API's sentence when somebody has already applied", async () => {
    fetchMock.mockResolvedValue(
      json(409, {
        error: {
          code: "conflict",
          message: "You applied for this role on 14 October 2026.",
        },
      }),
    );
    const { user } = await mount();
    await fillIn(user);
    await send(user);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveAttribute("data-kind", "duplicate");
    expect(alert).toHaveTextContent(
      "You applied for this role on 14 October 2026.",
    );
  });

  it("points at the box the API objected to", async () => {
    fetchMock.mockResolvedValue(
      json(422, {
        error: {
          code: "validation_error",
          message: "Check the details.",
          details: [
            { field: "email", message: "That address cannot receive mail." },
          ],
        },
      }),
    );
    const { user } = await mount();
    await fillIn(user);
    await send(user);

    const email = screen.getByLabelText(/^Email/);
    await waitFor(() => expect(email).toHaveAttribute("aria-invalid", "true"));
    expect(
      screen.getByText("That address cannot receive mail."),
    ).toBeInTheDocument();
  });

  it("says when the request never arrived", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { user } = await mount();
    await fillIn(user);
    await send(user);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveAttribute("data-kind", "network");
    expect(alert).toHaveTextContent("could not reach the server");
  });
});

describe("the check that proves somebody is a person", () => {
  const turnstile = () => {
    let callbacks: {
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
    } = {};
    const api = {
      render: vi.fn((_node: HTMLElement, options: typeof callbacks) => {
        callbacks = options;
        return "widget-1";
      }),
      reset: vi.fn(),
      remove: vi.fn(),
    };
    return { api, solve: (token: string) => callbacks.callback?.(token) };
  };

  const scriptTags = () =>
    document.head.querySelectorAll('script[src*="challenges.cloudflare.com"]');

  it("is not on the page, and no third-party script is requested, when the API has not asked for it", async () => {
    const { user } = await mount();
    await fillIn(user);

    expect(screen.queryByTestId("captcha-slot")).not.toBeInTheDocument();
    expect(scriptTags()).toHaveLength(0);
  });

  it("appears, and only then asks for the script, when the advert says the check is on", async () => {
    await mount({ captchaRequired: true });

    expect(screen.getByTestId("captcha-slot")).toBeInTheDocument();
    await waitFor(() => expect(scriptTags()).toHaveLength(1));
  });

  it("will not send without it, says so beside the check, and spends no request", async () => {
    const { user } = await mount({ captchaRequired: true });
    await fillIn(user);
    await send(user);

    expect(
      await screen.findByText("Complete the check above before you send."),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the token it earned along with the application", async () => {
    fetchMock.mockResolvedValue(accepted());
    const fake = turnstile();
    window.turnstile = fake.api;
    const { user } = await mount({ captchaRequired: true });
    await fillIn(user);

    await waitFor(() => expect(fake.api.render).toHaveBeenCalled());
    expect(fake.api.render.mock.calls[0]?.[1]).toMatchObject({
      sitekey: SITE_KEY,
    });
    fake.solve("token-123");
    await send(user);

    await screen.findByText("Application sent");
    expect(lastBody()).toHaveProperty("captchaToken", "token-123");
  });

  it("is brought up by the API's refusal even when the advert did not say, and says what the API said", async () => {
    fetchMock.mockResolvedValue(
      json(422, {
        error: {
          code: "captcha_required",
          message:
            "Please complete the check above the Apply button, then send again.",
        },
      }),
    );
    const { user } = await mount();
    await fillIn(user);
    expect(screen.queryByTestId("captcha-slot")).not.toBeInTheDocument();
    await send(user);

    expect(await screen.findByTestId("captcha-slot")).toBeInTheDocument();
    const alert = await screen.findByText(/Please complete the check above/);
    expect(alert.closest("[data-kind]")).toHaveAttribute(
      "data-kind",
      "captcha",
    );
    await waitFor(() => expect(scriptTags()).toHaveLength(1));
  });

  it("asks for a fresh token after a refusal, because the first is spent", async () => {
    fetchMock.mockResolvedValue(
      json(422, {
        error: {
          code: "captcha_failed",
          message: "That check did not pass, or it timed out.",
        },
      }),
    );
    const fake = turnstile();
    window.turnstile = fake.api;
    const { user } = await mount({ captchaRequired: true });
    await fillIn(user);
    await waitFor(() => expect(fake.api.render).toHaveBeenCalled());
    fake.solve("spent-token");
    await send(user);

    await screen.findByText(/did not pass/);
    expect(fake.api.reset).toHaveBeenCalledWith("widget-1");
    /* And it will not resend the spent one: the form wants a new check. */
    await send(user);
    expect(
      await screen.findByText("Complete the check above before you send."),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("says plainly when the check cannot load, and offers to try again", async () => {
    await mount({ captchaRequired: true });
    const tag = await waitFor(() => {
      const found = scriptTags()[0] as HTMLScriptElement | undefined;
      if (!found) throw new Error("no script yet");
      return found;
    });
    tag.onerror?.(new Event("error"));

    const alert = await screen.findByRole("alert");
    expect(
      within(alert).getByText(/The check did not load/),
    ).toBeInTheDocument();
    expect(
      within(alert).getByRole("button", { name: "Try loading it again" }),
    ).toBeInTheDocument();
  });
});
