import { describe, expect, it } from "vitest";
import {
  isValidKey,
  issueKey,
  keyProblem,
  normaliseKey,
  parseIssueKey,
  suggestKey,
} from "@/lib/projects/keys";
import {
  gapIsTooSmall,
  rankAtEnd,
  rankBetween,
  rankForInsert,
  rebalance,
} from "@/lib/projects/rank";
import { addDays, daysBetween, daysLeft } from "@/lib/projects/dates";

describe("project keys", () => {
  it("suggests initials from the name, the way the design does", () => {
    expect(suggestKey("Checkout Revamp")).toBe("CR");
    expect(suggestKey("Mobile app v3")).toBe("MAV");
    expect(suggestKey("Payments")).toBe("PAY");
    expect(suggestKey("Customer Onboarding Flow Redesign Phase Two")).toBe(
      "COFR",
    );
  });

  it("drops leading digits from the initials", () => {
    expect(suggestKey("24 hour support desk")).toBe("HSD");
  });

  it("suggests nothing usable for an empty name", () => {
    expect(suggestKey("")).toBe("");
    expect(isValidKey(suggestKey("   "))).toBe(false);
  });

  it("accepts a letter then one to five letters or digits, upper case", () => {
    for (const ok of ["CR", "PAY", "MOB3", "ABCDEF", "A1"]) {
      expect(isValidKey(ok), ok).toBe(true);
    }
    for (const bad of ["C", "pay", "3PAY", "ABCDEFG", "PA-Y", "PA Y", ""]) {
      expect(isValidKey(bad), bad).toBe(false);
    }
  });

  it("cleans typed input into the shape a key takes", () => {
    expect(normaliseKey("pa y-3!")).toBe("PAY3");
    expect(normaliseKey("abcdefghij")).toBe("ABCDEF");
  });

  it("says why a key will not do", () => {
    expect(keyProblem("C", [])).toMatch(/2 to 6/);
    expect(keyProblem("PAY", ["PAY", "CHK"])).toBe(
      "Another project already uses PAY.",
    );
    expect(keyProblem("MOB", ["PAY"])).toBeNull();
  });

  it("builds and reads issue keys", () => {
    expect(issueKey("PAY", 12)).toBe("PAY-12");
    expect(parseIssueKey("pay-12")).toEqual({ key: "PAY", number: 12 });
    expect(parseIssueKey("PAY-")).toBeNull();
    expect(parseIssueKey("not a key")).toBeNull();
  });
});

describe("rank", () => {
  it("takes the midpoint between two neighbours", () => {
    expect(rankBetween(1, 2)).toBe(1.5);
    expect(rankBetween(10, 20)).toBe(15);
  });

  it("goes one below the top and one above the bottom", () => {
    expect(rankBetween(null, 5)).toBe(4);
    expect(rankBetween(5, null)).toBe(6);
    expect(rankBetween(null, null)).toBe(1);
  });

  const col = [
    { id: "a", rank: 1 },
    { id: "b", rank: 2 },
    { id: "c", rank: 3 },
  ];

  it("inserts before a card by averaging it with the one above", () => {
    expect(rankForInsert(col, "b", "x")).toBe(1.5);
    expect(rankForInsert(col, "a", "x")).toBe(0);
    expect(rankForInsert(col, "c", "x")).toBe(2.5);
  });

  it("appends at the end when dropped on empty space", () => {
    expect(rankForInsert(col, null, "x")).toBe(4);
    expect(rankForInsert([], null, "x")).toBe(1);
  });

  it("ignores the card being moved when it is already in the column", () => {
    /* Moving a below c: neighbours are b and c's end. */
    expect(rankForInsert(col, null, "a")).toBe(4);
    /* Moving c in front of a: nothing above it any more. */
    expect(rankForInsert(col, "a", "c")).toBe(0);
    /* Moving a in front of b: a itself is skipped, so it lands before b alone. */
    expect(rankForInsert(col, "b", "a")).toBe(1);
  });

  it("falls back to the end when the target card is not there", () => {
    expect(rankForInsert(col, "gone", "x")).toBe(4);
  });

  it("finds the next rank at the bottom of everything", () => {
    expect(rankAtEnd([3, 9, 4])).toBe(10);
    expect(rankAtEnd([])).toBe(1);
  });

  it("notices when two neighbours have run out of room, and can spread them out", () => {
    expect(gapIsTooSmall(1, 2)).toBe(false);
    expect(gapIsTooSmall(1, 1 + Number.EPSILON)).toBe(true);
    const spread = rebalance([
      { id: "a", rank: 0.1 },
      { id: "b", rank: 0.1000001 },
    ]);
    expect(spread.map((s) => s.rank)).toEqual([1, 2]);
  });
});

describe("date-only arithmetic", () => {
  it("counts calendar days without a zone", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-10-15", "2026-10-29")).toBe(14);
    expect(daysBetween("2026-10-29", "2026-10-15")).toBe(-14);
    expect(daysBetween("nope", "2026-10-15")).toBeNull();
  });

  it("counts days left in a sprint, negative once it has run over", () => {
    expect(daysLeft("2026-10-20", "2026-10-15")).toBe(5);
    expect(daysLeft("2026-10-10", "2026-10-15")).toBe(-5);
    expect(daysLeft(null, "2026-10-15")).toBeNull();
  });
});
