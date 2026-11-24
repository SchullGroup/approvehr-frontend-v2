/**
 * U10 (NC-3): turning two-factor on now asks for an emailed code, and the API
 * answers a wrong code with 401, as the step-up check already did. The client
 * read every 401 on a signed-in request as an expired session: it refreshed,
 * sent the same code again (spending a second attempt), got 401 again, and
 * signed the person out for a typo.
 *
 * A request marked `codeCheck` reads a 401 as the answer about the code. It
 * still refreshes, so an expired session is put right, but it never resends,
 * and it signs out only when the refresh itself fails.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  SessionExpiredError,
  request,
  tokens,
} from "@/lib/api/client";

const fetchMock = vi.fn();

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const WRONG = {
  error: {
    code: "unauthorized",
    message: "That code is wrong or has expired. Ask for a new one.",
  },
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  tokens.set("access-1", "refresh-1");
});
afterEach(() => {
  vi.unstubAllGlobals();
  tokens.clear();
});

const calls = (path: string) =>
  fetchMock.mock.calls.filter(([url]) => String(url).includes(path)).length;

describe("a 401 that answers a code check", () => {
  it("is the code's answer: no resend, still signed in", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("/auth/refresh")
        ? json(200, {
            data: { accessToken: "access-2", refreshToken: "refresh-2" },
          })
        : json(401, WRONG),
    );
    const sent = request("/auth/two-factor/enrol", {
      method: "POST",
      body: { challengeId: "c1", code: "000000" },
      codeCheck: true,
    });
    await expect(sent).rejects.toBeInstanceOf(ApiError);
    await expect(sent).rejects.not.toBeInstanceOf(SessionExpiredError);
    await sent.catch((error: ApiError) =>
      expect(error.message).toBe(
        "That code is wrong or has expired. Ask for a new one.",
      ),
    );
    expect(calls("/auth/two-factor/enrol")).toBe(1);
    expect(tokens.has()).toBe(true);
  });

  it("signs out only when the session itself cannot be refreshed", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("/auth/refresh") ? json(401, WRONG) : json(401, WRONG),
    );
    await expect(
      request("/auth/two-factor/enrol", {
        method: "POST",
        body: { challengeId: "c1", code: "000000" },
        codeCheck: true,
      }),
    ).rejects.toBeInstanceOf(SessionExpiredError);
    expect(tokens.has()).toBe(false);
  });

  it("leaves every other request's 401 handling as it was", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("/auth/refresh")
        ? json(200, {
            data: { accessToken: "access-2", refreshToken: "refresh-2" },
          })
        : json(401, WRONG),
    );
    await expect(request("/employees")).rejects.toBeInstanceOf(
      SessionExpiredError,
    );
    expect(calls("/employees")).toBe(2);
  });
});
