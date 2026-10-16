import { describe, expect, it } from "vitest";
import {
  KINDS,
  MERGE_FIELDS,
  merge,
  paragraphsOf,
  previewOf,
  sampleValues,
  tokens,
  validateDraft,
} from "@/lib/hiring/comms/fields";

/**
 * The words a company may put in an email to a candidate.
 *
 * This is the offline copy of the API's rules, so these hold that the offline editor
 * refuses what the real one would, in the same sentences. The point of the list is
 * that nothing outside it can be reached: a template that mentions `{salary}` is
 * refused when it is saved, not discovered when somebody is emailed those letters.
 */

const ok = { subject: "Hello", body: "Hello {candidate_first_name}" };

describe("the fixed list", () => {
  it("is nine fields and nothing about pay, phone numbers or notes", () => {
    expect(MERGE_FIELDS.map((f) => f.name)).toEqual([
      "candidate_first_name",
      "job_title",
      "company_name",
      "stage_name",
      "reference",
      "interview_time",
      "interview_location",
      "recruiter_name",
      "reply_to",
    ]);
  });

  it("gives each kind only the fields that exist when it is sent", () => {
    const fields = (kind: string) =>
      KINDS.find((k) => k.kind === kind)?.fields ?? [];
    expect(fields("ACKNOWLEDGE")).not.toContain("interview_time");
    expect(fields("ACKNOWLEDGE")).not.toContain("recruiter_name");
    expect(fields("INVITE")).toContain("interview_time");
    expect(fields("INVITE")).toContain("interview_location");
    expect(fields("DECLINE")).not.toContain("interview_time");
    expect(fields("OFFER_SENT")).not.toContain("stage_name");
  });

  it("makes every built-in wording valid for its own kind", () => {
    for (const kind of KINDS) {
      expect(validateDraft(kind.kind, kind.builtIn), kind.label).toEqual([]);
    }
  });
});

describe("refusing a template when it is saved", () => {
  it("refuses a field that is not on the list, and names the ones that are", () => {
    const problems = validateDraft("DECLINE", {
      subject: "Your application",
      body: "Hello {candidate_first_name}, your salary is {salary}.",
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ field: "body" });
    expect(problems[0]?.message).toContain(
      "{salary} is not a field you can use",
    );
    expect(problems[0]?.message).toContain("{candidate_first_name}");
  });

  it("refuses a field that exists, but not when this kind is sent", () => {
    const problems = validateDraft("ACKNOWLEDGE", {
      subject: "We got it",
      body: "Your interview is {interview_time}.",
    });
    expect(problems[0]?.message).toContain(
      '{interview_time} cannot be used in a "Application received" email',
    );
    expect(problems[0]?.message).toContain('"Invitation to interview"');
  });

  it("refuses a brace that is not part of a field, which is what a half-typed field looks like", () => {
    for (const body of [
      "we will send your {offer",
      "}",
      "{}",
      "{two words}",
      "{{x}}",
    ]) {
      const found = validateDraft("STAGE_UPDATE", { subject: "Hi", body });
      expect(
        found.some((p) => p.field === "body"),
        body,
      ).toBe(true);
    }
  });

  it("puts every problem against its own field, all at once", () => {
    const problems = validateDraft("ACKNOWLEDGE", {
      subject: "Line one\nLine two {interview_time}",
      body: "   ",
    });
    expect(
      problems.filter((p) => p.field === "subject").length,
    ).toBeGreaterThan(1);
    expect(problems.some((p) => p.field === "body")).toBe(true);
  });

  it("wants a subject on one line and a message that says something", () => {
    expect(
      validateDraft("STAGE_UPDATE", { subject: "", body: "x" })[0],
    ).toEqual({
      field: "subject",
      message: "Write a subject.",
    });
    expect(
      validateDraft("STAGE_UPDATE", { subject: "x", body: "" })[0],
    ).toEqual({
      field: "body",
      message: "Write the message.",
    });
  });

  it("keeps a subject to 150 characters and a message to 5,000", () => {
    expect(
      validateDraft("STAGE_UPDATE", { subject: "x".repeat(151), body: "y" })[0]
        ?.message,
    ).toMatch(/at most 150 characters. This one is 151/);
    expect(
      validateDraft("STAGE_UPDATE", { subject: "x", body: "y".repeat(5001) })[0]
        ?.message,
    ).toMatch(/at most 5,000 characters/);
  });

  it("refuses control characters that are not text, but allows line breaks and tabs in a message", () => {
    expect(
      validateDraft("STAGE_UPDATE", { subject: "x", body: "a\tb\nc\r\nd" }),
    ).toEqual([]);
    expect(
      validateDraft("STAGE_UPDATE", { subject: "x", body: "a\u0007b" })[0]
        ?.message,
    ).toBe("That contains characters that are not text.");
  });

  it("accepts a good one", () => {
    expect(validateDraft("STAGE_UPDATE", ok)).toEqual([]);
  });
});

describe("merging", () => {
  const values = { candidate_first_name: "Ada", job_title: "Analyst" };

  it("fills a field in", () => {
    expect(merge("Hi {candidate_first_name}, {job_title}", values).text).toBe(
      "Hi Ada, Analyst",
    );
  });

  it("reads a value once and never again: a name that looks like a field stays a name", () => {
    const out = merge("Hi {candidate_first_name}", {
      candidate_first_name: "{job_title}",
      job_title: "Analyst",
    });
    expect(out.text).toBe("Hi {job_title}");
  });

  it("reports a field with no value, and leaves it as it was", () => {
    const out = merge("At {interview_time}", values);
    expect(out.missing).toEqual(["interview_time"]);
    expect(out.text).toBe("At {interview_time}");
  });

  it("cleans a value so it cannot start a second line or a second header", () => {
    const out = merge("Hi {candidate_first_name}", {
      candidate_first_name: "Ada\r\nBcc: someone@example.com",
    });
    expect(out.text).toBe("Hi Ada Bcc: someone@example.com");
    expect(out.text).not.toMatch(/[\r\n]/);
  });

  it("keeps a body's line breaks and a subject's one line", () => {
    expect(merge("a\nb", values, { multiline: true }).text).toBe("a\nb");
    expect(merge("a\nb", values).text).toBe("a b");
  });
});

describe("the preview", () => {
  it("says it is made-up details when it is, with the company's own name", () => {
    const out = previewOf(
      "STAGE_UPDATE",
      {
        subject: "{company_name}: update",
        body: "Hello {candidate_first_name}",
      },
      sampleValues("Acme", "people@acme.test"),
      true,
    );
    expect(out.valid).toBe(true);
    expect(out.sample).toBe(true);
    expect(out.subject).toBe("Acme: update");
    expect(out.text).toBe("Hello Ada");
    expect(out.html).toBeNull();
  });

  it("answers invalid, with the errors, rather than throwing halfway through a field", () => {
    const out = previewOf(
      "STAGE_UPDATE",
      { subject: "x", body: "Hello {job_ti" },
      sampleValues("Acme", null),
      true,
    );
    expect(out.valid).toBe(false);
    expect(out.errors.length).toBeGreaterThan(0);
    expect(out.text).toBeNull();
  });

  it("lists the fields a real person has no value for, which is exactly what would stop it going", () => {
    const out = previewOf(
      "INVITE",
      { subject: "x", body: "At {interview_time}" },
      { candidate_first_name: "Ada" },
      false,
    );
    expect(out.valid).toBe(true);
    expect(out.missing).toEqual(["interview_time"]);
  });
});

describe("reading a text", () => {
  it("finds the fields and the first stray brace", () => {
    const found = tokens("a {job_title} b {x");
    expect(found.tokens.map((t) => t.field)).toEqual(["job_title"]);
    expect(found.stray).toBe(16);
  });

  it("splits a body into paragraphs at blank lines", () => {
    expect(paragraphsOf("a\n\n\nb  \n\nc")).toEqual(["a", "b", "c"]);
  });
});
