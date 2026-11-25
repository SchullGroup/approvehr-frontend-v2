import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";

/**
 * A candidate link says which kind of id it carries, and the page asks that
 * kind only (UAT 23 Nov, L11 / CRAWL-7): every candidate page opened from the
 * board made two lookups that always 404, a careers application and a
 * recruitment candidate by the same id, before the one that answered.
 */
const careersGet = vi.fn();
const candidateGet = vi.fn();
const pipelineGet = vi.fn();
const listApplications = vi.fn();

vi.mock("@/lib/api/careers", async (original) => {
  const real = await original<typeof import("@/lib/api/careers")>();
  return {
    ...real,
    careersApi: {
      ...real.careersApi,
      getApplication: (...a: unknown[]) => careersGet(...a),
      listApplications: (...a: unknown[]) => listApplications(...a),
    },
  };
});
vi.mock("@/lib/api/recruitment", async (original) => {
  const real = await original<typeof import("@/lib/api/recruitment")>();
  return {
    ...real,
    recruitmentApi: {
      ...real.recruitmentApi,
      getCandidate: (...a: unknown[]) => candidateGet(...a),
      getApplication: (...a: unknown[]) => pipelineGet(...a),
    },
  };
});

const { resolveCareersApplication } = await import("@/lib/store/hiring");
const { candidateHref, kindFrom } = await import("@/lib/hiring/candidate-href");

const missing = () => new ApiError(404, "not_found", "Not found.");

beforeEach(() => {
  for (const fn of [careersGet, candidateGet, pipelineGet, listApplications])
    fn.mockReset();
  careersGet.mockImplementation(async (id: string) =>
    id === "job-1"
      ? { id: "job-1", candidateId: "cand-1" }
      : Promise.reject(missing()),
  );
  candidateGet.mockRejectedValue(missing());
  pipelineGet.mockResolvedValue({
    id: "pa-1",
    candidate: { id: "cand-1", email: "uche@example.test" },
  });
  listApplications.mockResolvedValue({
    data: [{ id: "job-1", candidateId: "cand-1", email: "uche@example.test" }],
  });
});

describe("a board link to a pipeline application", () => {
  it("makes no lookup that cannot answer", async () => {
    const found = await resolveCareersApplication(
      "pa-1",
      undefined,
      "application",
    );
    expect(found?.detail).toMatchObject({ id: "job-1" });
    expect(careersGet).not.toHaveBeenCalledWith("pa-1", undefined);
    expect(candidateGet).not.toHaveBeenCalled();
  });
});

describe("a link with no kind", () => {
  it("still tries each kind, so an old link works", async () => {
    const found = await resolveCareersApplication("pa-1");
    expect(found?.detail).toMatchObject({ id: "job-1" });
    expect(candidateGet).toHaveBeenCalledWith("pa-1", undefined);
  });
});

describe("the hint", () => {
  it("is written and read back, and an unknown one is no hint", () => {
    expect(candidateHref("pa-1", "application")).toBe(
      "/hiring/candidates/pa-1?kind=application",
    );
    expect(kindFrom("applicant")).toBe("applicant");
    expect(kindFrom("board")).toBeNull();
    expect(kindFrom(null)).toBeNull();
  });
});
