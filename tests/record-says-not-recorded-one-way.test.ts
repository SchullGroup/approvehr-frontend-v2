/**
 * L19 (HR-23): a person's record said an absence five ways ("No phone
 * number", "Not provided", "Not recorded", "No address recorded", "No NIN
 * recorded"), showed "Started 2026-11-23" beside dates like "21 Oct 2026",
 * and showed gender as stored ("male", "Male", "female"). One "Not recorded",
 * a readable date, and gender in words.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { genderWord } from "@/lib/types";

const read = (p: string) =>
  readFileSync(path.resolve(import.meta.dirname, "..", p), "utf8");

describe("a person's record", () => {
  const record = read("src/app/(app)/people/[id]/record.tsx");
  it("says Not recorded, one way", () => {
    for (const other of [
      '"No phone number"',
      '"No email address"',
      '"No address recorded"',
      '"No NIN recorded"',
    ]) {
      expect(record).not.toContain(other);
    }
    expect(read("src/components/people/editable-section.tsx")).toContain(
      '{f.emptyLabel ?? "Not recorded"}',
    );
  });
  it("shows the start date as a date", () => {
    expect(record).not.toContain("`Started ${employee.startDate}`");
  });
  it("shows gender in words whatever case it was stored in", () => {
    expect(genderWord("male")).toBe("Male");
    expect(genderWord("Male")).toBe("Male");
    expect(genderWord("FEMALE")).toBe("Female");
    expect(genderWord("other")).toBe("Other");
    expect(genderWord(null)).toBeNull();
  });
});
