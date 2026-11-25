import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatDay, formatDayRange, formatMonth } from "@/lib/time";

/**
 * UAT 23 Nov, L16 (SELF-20, PAY-31, PERF-36, HR-23, NC-32): screens showed
 * "2026-12-10 → 2026-12-15", "Pays 2026-10-28", "Applied 2026-11-23" and chart
 * months "2025-12" beside "21 Oct 2026" elsewhere. A calendar day reads
 * "28 Nov 2026", a range "10 Dec – 15 Dec 2026", a month "Nov 2026".
 */

describe("a calendar day", () => {
  it("reads 28 Nov 2026", () => {
    expect(formatDay("2026-11-28")).toBe("28 Nov 2026");
    expect(formatDay("2026-01-05")).toBe("5 Jan 2026");
  });

  it("takes the API's midnight timestamp for a day as that day", () => {
    expect(formatDay("2026-11-28T00:00:00.000Z")).toBe("28 Nov 2026");
  });

  it("says nothing it cannot read as a date", () => {
    expect(formatDay(null)).toBe("—");
    expect(formatDay("")).toBe("—");
    expect(formatDay("soon")).toBe("soon");
  });
});

describe("a range of days", () => {
  it("names the year once when both ends share it", () => {
    expect(formatDayRange("2026-12-10", "2026-12-15")).toBe(
      "10 Dec – 15 Dec 2026",
    );
  });

  it("names both years when it crosses one", () => {
    expect(formatDayRange("2026-12-28", "2027-01-02")).toBe(
      "28 Dec 2026 – 2 Jan 2027",
    );
  });

  it("is one day when it starts and ends on it", () => {
    expect(formatDayRange("2026-12-10", "2026-12-10")).toBe("10 Dec 2026");
  });
});

describe("a month", () => {
  it("reads Nov 2026", () => {
    expect(formatMonth("2026-11")).toBe("Nov 2026");
    expect(formatMonth("2025-12-01")).toBe("Dec 2025");
    expect(formatMonth("nonsense")).toBe("nonsense");
  });
});

describe("the screens that showed ISO dates", () => {
  const root = join(__dirname, "..", "src");
  const read = (path: string) => readFileSync(join(root, path), "utf8");

  it("no longer render a raw day field or a sliced timestamp", () => {
    const raw = [
      ["app/(app)/people/leave/leave-screen.tsx", "{r.from} → {r.to}"],
      ["app/(app)/people/leave/leave-screen.tsx", "{clash.from} → {clash.to}"],
      ["app/(app)/approvals/inbox.tsx", "{row.decidedAt.slice(0, 10)}"],
      ["app/(app)/approvals/inbox.tsx", "{lead} {row.requestedAt}"],
      [
        "app/(app)/people/one-on-ones/one-on-ones-screen.tsx",
        "Due {series.nextDueOn}",
      ],
      [
        "app/(app)/people/one-on-ones/[id]/one-on-one-screen.tsx",
        "by {item.dueDate}",
      ],
      [
        "app/(app)/hiring/postings/applications/applications-screen.tsx",
        "Applied {application.appliedAt.slice(0, 10)}",
      ],
      [
        "app/(app)/hiring/requisitions/[id]/screening.tsx",
        "Applied {row.appliedOn}",
      ],
      [
        "app/(app)/hiring/postings/postings-screen.tsx",
        '{posting.closesOn ?? "Open"}',
      ],
      [
        "app/(app)/hiring/candidates/[id]/real-pipeline.tsx",
        "from {offer.startDate}",
      ],
      ["app/(app)/payroll/payroll-screen.tsx", "{run.payDate}</"],
      ["app/(app)/payroll/runs/new/wizard.tsx", "run.preparedAt.slice(0, 10)"],
      ["app/(app)/people/directory.tsx", "{e.startDate}</"],
      [
        "app/(app)/people/probation/probation-screen.tsx",
        "{row.probationEndsAt}</",
      ],
      ["app/(app)/people/probation/probation-screen.tsx", "{row.startDate}</"],
      ["app/(app)/surveys/surveys-screen.tsx", "invite.closesAt.slice(0, 10)"],
      [
        "components/payroll/run-panels.tsx",
        "exclusion.excludedAt.slice(0, 10)",
      ],
    ] as const;
    const still = raw.filter(([path, text]) => read(path).includes(text));
    expect(still).toEqual([]);
  });

  it("label chart months in words", () => {
    expect(read("app/(app)/reports/reports-screen.tsx")).not.toContain(
      "label: row.month,",
    );
  });

  it("say a leave request's dates in words in its messages", () => {
    const leave = read("lib/store/leave.ts");
    expect(leave).not.toContain("${request.from} to ${request.to}");
    expect(leave).not.toContain("${clash.from} to ${clash.to}");
    const screen = read("app/(app)/people/leave/leave-screen.tsx");
    expect(screen).not.toContain("${request.from} to ${request.to}");
    expect(screen).not.toContain("${withdrawing.from} to ${withdrawing.to}");
  });
});

describe("there is one day formatter", () => {
  it("is what the old copies now call", () => {
    for (const path of [
      "lib/store/conduct.ts",
      "lib/store/assets.ts",
      "lib/audit/language.ts",
    ]) {
      const source = readFileSync(join(__dirname, "..", "src", path), "utf8");
      expect({ path, uses: source.includes("formatDay(") }).toEqual({
        path,
        uses: true,
      });
    }
  });

  it("is not written again under src", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(path)) files.push(path);
      }
    };
    walk(join(__dirname, "..", "src"));
    const copies = files.filter((path) =>
      /export function formatDay\(\s*\w+: string \| null/.test(
        readFileSync(path, "utf8"),
      ),
    );
    /* The timeline's `formatDay(day, withYear)` in projects/roadmap.ts is a
       different, year-less format for a chart axis, and is not counted. */
    expect(copies.map((p) => p.split("/src/")[1])).toEqual(["lib/time.ts"]);
  });
});
