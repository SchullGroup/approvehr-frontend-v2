import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { ApiApplication } from "@/lib/api/careers";
import {
  QUEUE_BULK_MAX,
  confirmedRows,
  queueCsvRows,
  runQueue,
} from "@/lib/hiring/pipeline/queue-bulk";

/**
 * Doing one thing to many people in the application queue.
 *
 * The queue's applicants are not in the pipeline yet and the server has no bulk
 * action for them, so this works through them a few at a time. What it must keep
 * is the accounting: every person asked is either done or listed with a reason, and
 * "everyone matching" is checked against the number somebody confirmed.
 */

const row = (n: number, over: Partial<ApiApplication> = {}): ApiApplication =>
  ({
    id: `a${String(n)}`,
    postingId: "p1",
    postingTitle: "Payroll Analyst",
    firstName: "Ada",
    lastName: `Okafor${String(n)}`,
    name: `Ada Okafor${String(n)}`,
    email: `ada${String(n)}@example.com`,
    phone: null,
    coverNote: null,
    source: "LinkedIn",
    status: "RECEIVED",
    screenedAt: null,
    declineReason: null,
    candidateId: null,
    cv: null,
    appliedAt: "2026-08-10T09:00:00.000Z",
    reference: `APP-0000000${String(n)}`,
    ...over,
  }) as ApiApplication;

describe("working through the queue", () => {
  it("does everybody and says how many", async () => {
    const act = vi.fn().mockResolvedValue(undefined);
    const outcome = await runQueue({
      rows: [row(1), row(2), row(3)],
      act,
      onProgress: () => undefined,
    });
    expect(act).toHaveBeenCalledTimes(3);
    expect(outcome).toMatchObject({
      requested: 3,
      done: 3,
      skipped: 0,
      emailed: null,
    });
    expect(outcome.refused).toEqual([]);
  });

  it("lists each person it could not do, by name, with the API's sentence", async () => {
    const outcome = await runQueue({
      rows: [row(1), row(2), row(3)],
      act: async (r) => {
        if (r.id === "a2")
          throw new ApiError(
            409,
            "conflict",
            "This application has already been screened in.",
          );
      },
      onProgress: () => undefined,
    });
    expect(outcome.done).toBe(2);
    expect(outcome.refused).toEqual([
      {
        id: "a2",
        name: "Ada Okafor2",
        reason: "This application has already been screened in.",
      },
    ]);
  });

  it("never lets a raw error through: something that is not the API's is said plainly", async () => {
    const outcome = await runQueue({
      rows: [row(1)],
      act: async () => {
        throw new Error("ECONNRESET at socket.js:44");
      },
      onProgress: () => undefined,
    });
    expect(outcome.refused[0]?.reason).toBe("Something went wrong. Try again.");
  });

  it("reports as it goes and finishes at the total", async () => {
    const seen: number[] = [];
    await runQueue({
      rows: [row(1), row(2), row(3), row(4), row(5)],
      act: async () => undefined,
      onProgress: (p) => seen.push(p.done),
    });
    expect(seen[0]).toBe(0);
    expect(seen.at(-1)).toBe(5);
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
  });

  it("asks the server of only a few at once", async () => {
    let running = 0;
    let most = 0;
    await runQueue({
      rows: Array.from({ length: 12 }, (_, i) => row(i)),
      act: async () => {
        running += 1;
        most = Math.max(most, running);
        await new Promise((r) => setTimeout(r, 2));
        running -= 1;
      },
      onProgress: () => undefined,
    });
    expect(most).toBeLessThanOrEqual(3);
  });

  it("takes a hundred at a time, and says so", () => {
    expect(QUEUE_BULK_MAX).toBe(100);
  });
});

describe("everyone matching", () => {
  it("is acted on only if it is still the number somebody confirmed", () => {
    expect(confirmedRows([row(1), row(2)], 2)).toHaveLength(2);
  });

  it("stops, with a sentence, when the list changed", () => {
    expect(() => confirmedRows([row(1), row(2), row(3)], 2)).toThrow(
      "The list changed while you were choosing: it was 2 people and is now 3. Nothing was done.",
    );
    try {
      confirmedRows([], 5);
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(409);
    }
  });
});

describe("the spreadsheet", () => {
  it("has a column for what a recruiter wants and one row per person", () => {
    const sheet = queueCsvRows([row(1), row(2)]);
    expect(sheet.headers).toEqual([
      "Reference",
      "Applied",
      "Name",
      "Email",
      "Phone",
      "Advert",
      "Status",
      "Source",
    ]);
    expect(sheet.rows).toHaveLength(2);
    expect(sheet.rows[0]).toMatchObject({
      Name: "Ada Okafor1",
      Applied: "2026-08-10",
      Advert: "Payroll Analyst",
    });
  });

  it("writes a name that starts like a formula as text", () => {
    const sheet = queueCsvRows([
      row(1, { name: '=HYPERLINK("x")', email: "+evil@example.com" }),
    ]);
    expect(sheet.rows[0]?.Name).toBe('\'=HYPERLINK("x")');
    expect(sheet.rows[0]?.Email).toBe("'+evil@example.com");
  });
});
