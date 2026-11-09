import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { reportingUnavailable, wellnessApi } from "@/lib/api/wellness";

/**
 * Reporting a kudos, on the wire.
 *
 * The rule is that "reported" is claimed only for a 204. The API routes are not
 * deployed everywhere yet, so a 404 and a dead connection are the answers a
 * person will actually meet, and neither may read as success. These run the real
 * client over a stubbed `fetch`, so what is pinned is the request that goes out
 * and what a screen is handed back.
 */

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const noContent = () => new Response(null, { status: 204 });
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const lastCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return {
    url: new URL(url),
    method: init.method,
    body: init.body ? (JSON.parse(String(init.body)) as unknown) : undefined,
  };
};

describe("reporting a kudos", () => {
  it("posts to the kudos' own report route and is done on a 204", async () => {
    fetchMock.mockResolvedValue(noContent());

    await expect(
      wellnessApi.reportRecognition("k1", "Not kind"),
    ).resolves.toBeUndefined();

    const call = lastCall();
    expect(call.url.pathname).toMatch(/\/wellness\/recognitions\/k1\/report$/);
    expect(call.method).toBe("POST");
    expect(call.body).toEqual({ reason: "Not kind" });
  });

  it("sends an empty body, not an empty reason, when nothing was written", async () => {
    fetchMock.mockResolvedValue(noContent());

    await wellnessApi.reportRecognition("k1", "   ");
    expect(lastCall().body).toEqual({});

    await wellnessApi.reportRecognition("k1");
    expect(lastCall().body).toEqual({});
  });

  it("trims the reason it sends", async () => {
    fetchMock.mockResolvedValue(noContent());
    await wellnessApi.reportRecognition("k1", "  too much  ");
    expect(lastCall().body).toEqual({ reason: "too much" });
  });

  it("is not done on any other success: only a 204 counts", async () => {
    fetchMock.mockResolvedValue(json(200, { data: { reported: true } }));
    await expect(wellnessApi.reportRecognition("k1")).rejects.toMatchObject({
      code: "unexpected_answer",
    });
  });

  it("is not done on a 404, a 5xx or a dead connection, and each reads as unavailable", async () => {
    fetchMock.mockResolvedValue(
      json(404, { error: { code: "not_found", message: "No such route." } }),
    );
    const notThere = await wellnessApi
      .reportRecognition("k1")
      .catch((e: unknown) => e);
    expect(notThere).toBeInstanceOf(ApiError);
    expect(reportingUnavailable(notThere)).toBe(true);

    fetchMock.mockResolvedValue(
      new Response("<html>bad gateway</html>", { status: 502 }),
    );
    const gateway = await wellnessApi
      .reportRecognition("k1")
      .catch((e: unknown) => e);
    expect(reportingUnavailable(gateway)).toBe(true);

    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const offline = await wellnessApi
      .reportRecognition("k1")
      .catch((e: unknown) => e);
    expect(offline).toMatchObject({ status: 0, code: "network_error" });
    expect(reportingUnavailable(offline)).toBe(true);
  });

  it("keeps the API's own refusal for what is not about availability", async () => {
    fetchMock.mockResolvedValue(
      json(422, {
        error: {
          code: "unprocessable",
          message: "You have already reported this.",
        },
      }),
    );
    const refused = await wellnessApi
      .reportRecognition("k1")
      .catch((e: unknown) => e);
    expect(reportingUnavailable(refused)).toBe(false);
    expect((refused as ApiError).message).toBe(
      "You have already reported this.",
    );
  });
});

describe("the reports an administrator reads", () => {
  it("asks for open reports a page at a time, and hands the rows back as sent", async () => {
    const row = {
      id: "r1",
      createdAt: "2026-11-08T10:00:00.000Z",
      status: "OPEN",
      reason: null,
      recognition: {
        id: "k1",
        message: "Thanks",
        giver: { name: "Ada Obi" },
        recipient: { name: "Tunde Bello" },
        createdAt: "2026-11-07T10:00:00.000Z",
        removed: false,
      },
      reporter: { name: "Chidi Obi" },
    };
    fetchMock.mockResolvedValue(
      json(200, {
        data: [row],
        meta: {
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
          hasMore: false,
        },
      }),
    );

    const page = await wellnessApi.kudosReports({
      status: "OPEN",
      page: 1,
      pageSize: 20,
    });

    const call = lastCall();
    expect(call.url.pathname).toMatch(/\/wellness\/recognitions\/reports$/);
    expect(call.method ?? "GET").toBe("GET");
    expect(call.url.searchParams.get("status")).toBe("OPEN");
    expect(call.url.searchParams.get("page")).toBe("1");
    expect(call.url.searchParams.get("pageSize")).toBe("20");
    expect(page.data).toEqual([row]);
  });

  it("resolves a report with the action named, and is done on a 204 only", async () => {
    fetchMock.mockResolvedValue(noContent());
    await expect(
      wellnessApi.resolveKudosReport("r1", "REMOVE"),
    ).resolves.toBeUndefined();
    const call = lastCall();
    expect(call.url.pathname).toMatch(
      /\/wellness\/recognitions\/reports\/r1\/resolve$/,
    );
    expect(call.method).toBe("POST");
    expect(call.body).toEqual({ action: "REMOVE" });

    await wellnessApi.resolveKudosReport("r1", "DISMISS");
    expect(lastCall().body).toEqual({ action: "DISMISS" });

    fetchMock.mockResolvedValue(json(200, { data: { ok: true } }));
    await expect(
      wellnessApi.resolveKudosReport("r1", "DISMISS"),
    ).rejects.toMatchObject({ code: "unexpected_answer" });
  });
});
