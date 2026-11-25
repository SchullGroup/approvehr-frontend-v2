import { describe, expect, it } from "vitest";
import type { AsItStood } from "@/lib/api/query-ties";
import {
  citationRendering,
  citationStanding,
  type Formatters,
} from "@/lib/queries/citation-rows";

/**
 * What a cited record said, as rows of words.
 *
 * The rules under test are the ones a citation is easy to get wrong: a field the copy did not hold
 * draws no row (never a nought, a none or a no), a clock-out the system filled in is not offered as
 * a recorded time, leave is dates and status and nothing that could be health information, and a
 * draft's copy says it is a preview.
 */

const format: Formatters = {
  day: (day) => `D(${day})`,
  at: (instant) => `T(${instant})`,
};

const labels = (copy: AsItStood) =>
  citationRendering(copy, format).rows.map((row) => row.label);

describe("a policy", () => {
  const base: Extract<AsItStood, { kind: "POLICY" }> = {
    kind: "POLICY",
    title: "Code of conduct",
    category: null,
    version: 3,
    publishedAt: null,
    requiresAcknowledgement: null,
    withdrawn: null,
    body: "Be on time.",
    bodyTruncated: null,
    personAcknowledged: null,
    acknowledgedAt: null,
    publishedAfterIncident: null,
  };

  it("draws a row only for what the copy held", () => {
    expect(labels(base)).toEqual(["Version"]);
  });

  it("says whether they accepted that version, and when, only when the server said", () => {
    expect(
      citationRendering(
        {
          ...base,
          personAcknowledged: true,
          acknowledgedAt: "2026-10-01T09:00:00Z",
        },
        format,
      ).rows,
    ).toContainEqual({
      label: "Their acceptance",
      value: "Accepted this version on T(2026-10-01T09:00:00Z)",
    });
    expect(
      citationRendering({ ...base, personAcknowledged: false }, format).rows,
    ).toContainEqual({
      label: "Their acceptance",
      value: "Had not accepted this version",
    });
  });

  it("warns that the version post-dates the incident, and never claims it when it does not know", () => {
    const after = citationRendering(
      { ...base, publishedAfterIncident: true },
      format,
    );
    expect(after.notes.join(" ")).toMatch(/published after the incident date/);
    const unknown = citationRendering(
      { ...base, publishedAfterIncident: null },
      format,
    );
    expect(unknown.notes.join(" ")).not.toMatch(
      /published after the incident date/,
    );
    const no = citationRendering(
      { ...base, publishedAfterIncident: false },
      format,
    );
    expect(no.notes.join(" ")).not.toMatch(/published after the incident date/);
  });

  it("always says the handbook keeps no earlier versions, and that a section was withdrawn", () => {
    const plain = citationRendering(base, format);
    expect(plain.notes.join(" ")).toMatch(/keeps no earlier versions/);
    expect(
      citationRendering({ ...base, withdrawn: true }, format).notes.join(" "),
    ).toMatch(/withdrawn from the handbook/);
  });

  it("says the wording was cut only when the server says it was, and never claims it from an absence", () => {
    const cut = citationRendering({ ...base, bodyTruncated: true }, format);
    expect(cut.notes.join(" ")).toMatch(
      /Only the start of the wording is shown here/,
    );
    expect(cut.notes.join(" ")).toMatch(
      /fingerprint kept with the letter covers all of it/,
    );
    for (const flag of [false, null]) {
      const whole = citationRendering({ ...base, bodyTruncated: flag }, format);
      expect(whole.notes.join(" ")).not.toMatch(
        /Only the start of the wording/,
      );
    }
  });

  it("carries the wording as text and nothing when the body is empty", () => {
    expect(citationRendering(base, format).wording).toBe("Be on time.");
    expect(
      citationRendering({ ...base, body: "  " }, format).wording,
    ).toBeNull();
    expect(
      citationRendering({ ...base, body: null }, format).wording,
    ).toBeNull();
  });
});

describe("an attendance day", () => {
  const base: Extract<AsItStood, { kind: "ATTENDANCE_DAY" }> = {
    kind: "ATTENDANCE_DAY",
    date: "2026-11-04",
    status: "LATE",
    clockIn: "09:40",
    clockOut: "17:00",
    lateByMinutes: 40,
    earlyByMinutes: 0,
    source: "SELF",
    clockOutFilledBySystem: false,
    correctedByAdministrator: false,
    workLocation: null,
  };

  it("says a clock-out the system filled in is not a recorded time", () => {
    const rows = citationRendering(
      { ...base, clockOutFilledBySystem: true },
      format,
    ).rows;
    expect(rows.find((row) => row.label === "Clocked out")?.value).toMatch(
      /filled in by the system, so not a recorded time/,
    );
    expect(
      citationRendering(base, format).rows.find(
        (row) => row.label === "Clocked out",
      )?.value,
    ).toBe("17:00");
  });

  it("draws late and early only when they are real, never as a nought", () => {
    expect(labels(base)).toContain("Late by");
    expect(labels(base)).not.toContain("Left early by");
    expect(labels({ ...base, lateByMinutes: 0 })).not.toContain("Late by");
    expect(labels({ ...base, lateByMinutes: null })).not.toContain("Late by");
  });

  it("draws no row for a null source, time or location", () => {
    const rows = labels({
      ...base,
      clockIn: null,
      clockOut: null,
      source: null,
      status: null,
      lateByMinutes: null,
    });
    expect(rows).toEqual(["Day"]);
  });

  it("says an administrator corrected an entry only when true", () => {
    expect(labels({ ...base, correctedByAdministrator: true })).toContain(
      "Corrected",
    );
    expect(labels(base)).not.toContain("Corrected");
  });
});

describe("a leave request", () => {
  it("is dates, days and status only, never the type or the reason", () => {
    const rendering = citationRendering(
      {
        kind: "LEAVE_REQUEST",
        startDate: "2026-11-02",
        endDate: "2026-11-06",
        days: 5,
        status: "APPROVED",
      },
      format,
    );
    expect(rendering.rows).toEqual([
      { label: "Dates", value: "D(2026-11-02) to D(2026-11-06)" },
      { label: "Days", value: "5" },
      { label: "Status", value: "Approved" },
    ]);
    expect(JSON.stringify(rendering)).not.toMatch(/type|reason|sick|annual/i);
  });

  it("draws a single day as a single day", () => {
    expect(
      citationRendering(
        {
          kind: "LEAVE_REQUEST",
          startDate: "2026-11-02",
          endDate: "2026-11-02",
          days: 1,
          status: null,
        },
        format,
      ).rows[0],
    ).toEqual({ label: "Dates", value: "D(2026-11-02)" });
  });
});

describe("equipment, a rota day and a document request", () => {
  it("say what a person confirmed only when the server sent the fact", () => {
    const base: Extract<AsItStood, { kind: "EQUIPMENT" }> = {
      kind: "EQUIPMENT",
      item: "Laptop",
      tag: "AST-0001",
      category: null,
      assignedOn: "2026-01-05",
      conditionOut: "GOOD",
      returnedOn: null,
      conditionBack: null,
      personConfirmedReceipt: null,
      confirmedAt: null,
    };
    expect(labels(base)).not.toContain("Their confirmation");
    expect(
      citationRendering({ ...base, personConfirmedReceipt: false }, format)
        .rows,
    ).toContainEqual({
      label: "Their confirmation",
      value: "Had not confirmed receipt",
    });
    expect(
      citationRendering(base, format).rows.find((row) => row.label === "Item")
        ?.value,
    ).toBe("Laptop (AST-0001)");
  });

  it("says a condition in words, not as the code the server keeps, and draws nothing for an absent one", () => {
    const rows = citationRendering(
      {
        kind: "EQUIPMENT",
        item: "Laptop",
        tag: "T",
        category: null,
        assignedOn: null,
        conditionOut: "LIKE_NEW",
        returnedOn: "2026-02-01",
        conditionBack: "GOOD",
        personConfirmedReceipt: null,
        confirmedAt: null,
      },
      format,
    ).rows;
    expect(rows).toContainEqual({
      label: "Condition when given",
      value: "Like new",
    });
    expect(rows).toContainEqual({
      label: "Condition when handed back",
      value: "Good",
    });
    expect(
      labels({
        kind: "EQUIPMENT",
        item: "Laptop",
        tag: null,
        category: null,
        assignedOn: null,
        conditionOut: null,
        returnedOn: null,
        conditionBack: "",
        personConfirmedReceipt: null,
        confirmedAt: null,
      }),
    ).toEqual(["Item"]);
  });

  it("draws a rota shift from its parts and a document request by its words", () => {
    expect(
      citationRendering(
        {
          kind: "ROTA_DAY",
          date: "2026-11-10",
          shiftName: "Night",
          startTime: "20:00",
          endTime: "06:00",
          status: "ABSENT",
        },
        format,
      ).rows,
    ).toContainEqual({ label: "Shift", value: "Night, 20:00 to 06:00" });
    expect(
      citationRendering(
        {
          kind: "DOCUMENT_REQUEST",
          name: "Certificate",
          category: "CERTIFICATE",
          dueOn: null,
          status: "OPEN",
          requestedAt: null,
        },
        format,
      ).rows.map((row) => row.value),
    ).toEqual(["Certificate", "Certificate", "Still open"]);
  });

  it("reads a category the build does not know as no row, without a cast", () => {
    expect(
      labels({
        kind: "DOCUMENT_REQUEST",
        name: "n",
        category: "WEIRD",
        dueOn: null,
        status: null,
        requestedAt: null,
      }),
    ).toEqual(["Document"]);
  });
});

describe("what a citation says it is", () => {
  it("is a preview in a draft, and a frozen copy once the letter is issued", () => {
    expect(citationStanding(false, null, format)).toMatch(/preview/);
    expect(citationStanding(false, null, format)).toMatch(
      /read again, and frozen/,
    );
    expect(citationStanding(true, "2026-11-18T09:00:00Z", format)).toBe(
      "As it stood when this letter was issued, T(2026-11-18T09:00:00Z). It does not change if the record does.",
    );
    expect(citationStanding(true, null, format)).not.toMatch(/T\(/);
  });
});
