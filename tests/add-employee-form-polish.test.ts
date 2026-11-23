/**
 * L26 (HR-38, NC-33): on Add employee, placeholders read as real data
 * ("Software Engineer", "850,000", "12345678901"), Review left out who they
 * report to and their employment type, and email checks were inconsistent:
 * the browser's own tooltip for some, the app's message for others, and
 * "gmial.com" passed.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { validateEmployee } from "@/lib/store/employees";

const form = readFileSync(
  path.resolve(import.meta.dirname, "../src/app/(app)/people/new/form.tsx"),
  "utf8",
);

describe("email checks", () => {
  it("catch a misspelt common domain and suggest the right one", () => {
    const [error] = validateEmployee({ email: "ada@gmial.com" });
    expect(error?.field).toBe("email");
    expect(error?.message).toBe("Did you mean ada@gmail.com?");
    expect(validateEmployee({ email: "ada@yaho.com" })[0]?.message).toBe(
      "Did you mean ada@yahoo.com?",
    );
  });
  it("leave a real address alone", () => {
    expect(validateEmployee({ email: "ada@gmail.com" })).toEqual([]);
    expect(validateEmployee({ email: "ada@schull.io" })).toEqual([]);
  });
  it("are the app's own, not the browser's", () => {
    expect(form).toMatch(/<form\s+noValidate/);
  });
});

describe("placeholders", () => {
  it("say they are examples", () => {
    for (const looksReal of [
      'placeholder="Software Engineer"',
      'placeholder="850,000"',
      'placeholder="12345678901"',
      'placeholder="name@schulltech.com"',
    ]) {
      expect(form).not.toContain(looksReal);
    }
    expect(form).toContain('placeholder="e.g. Software Engineer"');
  });
});

describe("Review", () => {
  it("shows who they report to and the employment type", () => {
    expect(form).toMatch(/\[\s*"Reports to",/);
    expect(form).toMatch(/\[\s*"Employment type",/);
  });
});
