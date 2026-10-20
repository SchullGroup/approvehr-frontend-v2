import { describe, expect, it } from "vitest";
import { DEFAULT_SCALE } from "@/lib/hiring/screening/criteria";
import {
  explain,
  fitOf,
  profileFor,
  suggestFrom,
  type CvProfile,
} from "@/lib/hiring/screening/demo-engine";
import { NO_CRITERIA, type Criteria } from "@/lib/hiring/screening/model";
import { kw } from "./screening-helpers";

/**
 * The demo's scorer, held to the same sum the real one does.
 *
 * What these hold: each part is worth its weight, what a CV does not say is left
 * out of both sides and so never marks anybody down, somebody with nothing to read
 * is never given a zero, the score never depends on who the person is, and the
 * arithmetic can be checked by hand.
 */

const cv = (text: string): CvProfile => ({ state: "TEXT", reason: null, text });
const criteria = (over: Partial<Criteria>): Criteria => ({
  ...NO_CRITERIA,
  ...over,
});
const score = (profile: CvProfile, c: Criteria) =>
  explain(profile, c, { version: 2, currentVersion: 2, scale: DEFAULT_SCALE });

describe("the sum", () => {
  it("is the weighted credit out of the weight that could be judged, to 100", () => {
    /* Must-have: Node.js matched, Postgres missing → value 0.5, weight 50 → 25.
       Experience: 6 years against 5 → value 1, weight 15 → 15.
       (25 + 15) / (50 + 15) = 61.5 → 62. */
    const result = score(
      cv("Built services in Node.js. 6 years of experience."),
      criteria({ mustHave: [kw("Node.js"), kw("PostgreSQL")], minYears: 5 }),
    );
    expect(result.status).toBe("SCORED");
    expect(result.score).toBe(62);
    expect(result.coverage).toBe(100);
    expect(result.groups.map((g) => [g.kind, g.weight, g.value])).toEqual([
      ["MUST_HAVE", 50, 0.5],
      ["YEARS", 15, 1],
    ]);
  });

  it("weights a skill within its list by its own count", () => {
    /* Payroll counts 3, Excel counts 1: matched Payroll only → 3/4. */
    const result = score(
      cv("Ran payroll for 400 staff."),
      criteria({ mustHave: [kw("Payroll", [], 3), kw("Excel", [], 1)] }),
    );
    expect(result.score).toBe(75);
  });

  it("gives half for a partial match and a share of the years", () => {
    const years = score(
      cv("3 years of experience."),
      criteria({ mustHave: [], minYears: 5 }),
    );
    expect(years.items[0]?.verdict).toBe("PARTIAL");
    expect(years.items[0]?.value).toBeCloseTo(0.6);
    expect(years.score).toBe(60);

    const level = score(
      cv("HND in computing."),
      criteria({ education: "BACHELORS" }),
    );
    expect(level.items[0]?.verdict).toBe("PARTIAL");
    expect(level.score).toBe(50);
  });

  it("leaves out what the CV does not say, rather than marking it down", () => {
    const result = score(
      cv("Ran payroll for 400 staff."),
      criteria({ mustHave: [kw("Payroll")], minYears: 5 }),
    );
    const years = result.items.find((item) => item.kind === "YEARS");
    expect(years?.verdict).toBe("UNKNOWN");
    expect(years?.value).toBeNull();
    expect(years?.note).toBe("The CV gives no number of years.");
    /* Only the judged part counts, so a full match is a full score. */
    expect(result.score).toBe(100);
    /* And the figure says so: 50 of the 65 asked for could be judged. */
    expect(result.coverage).toBe(77);
    expect(result.groups.find((g) => g.kind === "YEARS")?.judged).toBe(false);
  });

  it("counts somebody elsewhere who would move for half, and somebody there in full", () => {
    const base = criteria({ places: ["Lagos"], relocateQuestionId: "q" });
    expect(
      score(cv("Based in Lagos. Experienced."), base).items[0]?.verdict,
    ).toBe("MATCHED");
    expect(
      score(cv("Based in Abuja. Willing to relocate."), base).items[0]?.verdict,
    ).toBe("PARTIAL");
    expect(score(cv("Based in Abuja."), base).items[0]?.verdict).toBe(
      "MISSING",
    );
    expect(score(cv("Hello."), base).status).toBe("NO_TEXT");
  });

  it("matches other spellings, and says which was found", () => {
    const result = score(
      cv("Wrote services in NodeJS."),
      criteria({ mustHave: [kw("Node.js", ["NodeJS"])] }),
    );
    expect(result.items[0]?.verdict).toBe("MATCHED");
    expect(result.items[0]?.confidence).toBe("MEDIUM");
    expect(result.items[0]?.note).toContain("NodeJS");
    expect(result.items[0]?.evidence[0]?.marks).toContain("NodeJS");
  });

  it("does not take the verb 'go' for the language Go", () => {
    const result = score(
      cv("Ready to go to market quickly."),
      criteria({ mustHave: [kw("Go")] }),
    );
    expect(result.items[0]?.verdict).toBe("MISSING");
    const real = score(
      cv("Wrote workers in Go."),
      criteria({ mustHave: [kw("Go")] }),
    );
    expect(real.items[0]?.verdict).toBe("MATCHED");
  });

  it("keeps evidence to a short stretch, never the whole CV", () => {
    const long = `${"Filler sentence. ".repeat(60)}Ran payroll for 400 staff. ${"More filler. ".repeat(60)}`;
    const result = score(cv(long), criteria({ mustHave: [kw("payroll")] }));
    const evidence = result.items[0]?.evidence[0];
    expect(evidence?.text.length).toBeLessThan(110);
    expect(evidence?.text.toLowerCase()).toContain("payroll");
  });
});

describe("somebody with nothing to score", () => {
  const want = criteria({ mustHave: [kw("Payroll")] });

  it.each([
    ["NO_TEXT", "NO_TEXT"],
    ["WAITING", "WAITING_FOR_TEXT"],
    ["COULD_NOT_READ", "COULD_NOT_READ"],
  ] as const)(
    "is never given a zero when the file is %s",
    (special, status) => {
      const profile = profileFor(
        {
          id: "a",
          email: "a@x.test",
          name: "A",
          postingId: "p",
          role: "Payroll Analyst",
        },
        special,
      );
      const result = score(profile, want);
      expect(result.status).toBe(status);
      expect(result.score).toBeNull();
      expect(fitOf(result).score).toBeNull();
      expect(result.items).toEqual([]);
    },
  );

  it("says there are no criteria rather than scoring against nothing", () => {
    const result = explain(cv("Ran payroll."), null, {
      version: null,
      currentVersion: null,
    });
    expect(result.status).toBe("NO_CRITERIA");
    expect(result.score).toBeNull();
  });

  it("is not a score when nothing asked could be checked", () => {
    const result = score(cv("Hello."), criteria({ minYears: 5 }));
    expect(result.status).toBe("NO_TEXT");
    expect(result.extraction.reason).toMatch(/could be checked/);
  });
});

describe("versions", () => {
  it("says a score is stale when the job has moved on", () => {
    const old = explain(
      cv("Ran payroll."),
      criteria({ mustHave: [kw("Payroll")] }),
      {
        version: 1,
        currentVersion: 3,
      },
    );
    expect(old.stale).toBe(true);
    expect(fitOf(old).stale).toBe(true);
    expect(old.version).toBe(1);
    expect(old.currentVersion).toBe(3);
  });
});

describe("who the person is", () => {
  it("never reaches the scorer: two people with the same CV text score alike", () => {
    const a = profileFor(
      {
        id: "1",
        email: "ada@x.test",
        name: "Ada Okafor",
        postingId: "p",
        role: "Payroll Analyst",
      },
      null,
    );
    const b = profileFor(
      {
        id: "2",
        email: "ada@x.test",
        name: "Excel Payroll",
        postingId: "p",
        role: "Payroll Analyst",
      },
      null,
    );
    expect(a.text).toBe(b.text);
    expect(a.text).not.toMatch(/Ada|Okafor|Excel Payroll|x\.test/);
  });

  it("makes the same CV for the same email every time", () => {
    const person = {
      id: "1",
      email: "q@x.test",
      name: "Q",
      postingId: "p",
      role: "Senior Backend Engineer",
    };
    expect(profileFor(person, null)).toEqual(profileFor(person, null));
  });
});

describe("suggesting from an advert", () => {
  it("finds skills, years and a level, and sorts them by what the text says", () => {
    const suggestion = suggestFrom(
      [
        "We need 5+ years building production APIs.",
        "Strong Node.js and PostgreSQL. A degree is required.",
        "",
        "Nice to have:",
        "- Terraform and AWS",
      ].join("\n"),
    );
    expect(suggestion.mustHave.map((c) => c.label)).toEqual(
      expect.arrayContaining(["Node.js", "PostgreSQL"]),
    );
    expect(suggestion.niceToHave.map((c) => c.label)).toEqual(
      expect.arrayContaining(["Terraform", "AWS"]),
    );
    expect(suggestion.niceToHave.map((c) => c.label)).not.toContain("Node.js");
    expect(suggestion.minYears).toBe(5);
    expect(suggestion.education).toBe("BACHELORS");
    expect(suggestion.note).toMatch(/Check every one before you keep it/);
  });

  it("says nothing when the advert names nothing", () => {
    const suggestion = suggestFrom("Join our friendly team.");
    expect(suggestion.mustHave).toEqual([]);
    expect(suggestion.minYears).toBeNull();
    expect(suggestion.education).toBeNull();
  });
});
