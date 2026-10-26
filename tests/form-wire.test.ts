import { describe, expect, it } from "vitest";
import type {
  ApiApplicationDetail,
  ApiCareersSettings,
  ApiForm,
  ApiFormQuestion,
} from "@/lib/api/careers";
import {
  definitionFromApi,
  extrasFromDetail,
  isServerId,
  problemsFromApi,
  putBodyFromDefinition,
  sameDefinition,
  sourceLabel,
  summaryFromRow,
} from "@/lib/hiring/form-wire";
import { demoApplicationExtras, demoBook } from "@/lib/store/careers";
import { blankQuestion, defaultDefinition } from "@/lib/marketing/apply-form";

/**
 * Between the API's form and the one the builder edits, in both directions, and
 * between an application's answers and what a recruiter reads. Pure functions, so
 * plain input and output.
 */

const UUID = "0198c0de-0000-7000-8000-000000000001";

const apiQuestion = (over: Partial<ApiFormQuestion> = {}): ApiFormQuestion => ({
  id: UUID,
  order: 0,
  kind: "SHORT_TEXT",
  label: "Job title",
  helpText: null,
  required: false,
  maxWords: null,
  minValue: null,
  maxValue: null,
  choices: null,
  knockout: null,
  origin: null,
  answerCount: 0,
  ...over,
});

const apiForm = (questions: ApiFormQuestion[] = []): ApiForm => ({
  postingId: "p1",
  formVersion: 3,
  applications: 12,
  settings: { phoneMode: "REQUIRED", cvMode: "OPTIONAL", coverNoteMode: "OFF" },
  questions,
  limits: {
    maxQuestions: 20,
    maxFileQuestions: 3,
    maxChoices: 30,
    labelChars: 300,
    helpTextChars: 500,
    choiceLabelChars: 120,
    longTextMaxWords: 1000,
  },
  kinds: [],
});

const consent = (over: Partial<ApiCareersSettings["consent"]> = {}) =>
  ({
    required: true,
    text: "We keep your application.",
    customText: null,
    url: "https://acme.example/privacy",
    version: "default-1",
    isDefault: true,
    needsReview: true,
    reviewNote: null,
    standardText: "",
    ...over,
  }) as ApiCareersSettings["consent"];

describe("the API's form, as the builder holds it", () => {
  it("carries the three switches, the questions in order, and how many people answered each", () => {
    const definition = definitionFromApi(
      apiForm([
        apiQuestion({ label: "First", answerCount: 4 }),
        apiQuestion({ id: "other", label: "Second" }),
      ]),
    );
    expect(definition.standard).toEqual({
      phone: "REQUIRED",
      cv: "OPTIONAL",
      coverNote: "OFF",
    });
    expect(definition.questions.map((x) => [x.label, x.answered])).toEqual([
      ["First", 4],
      ["Second", 0],
    ]);
  });

  it("reads a knockout's flagWhen as the answer that raises the flag", () => {
    const [no, yes, none] = definitionFromApi(
      apiForm([
        apiQuestion({ kind: "YES_NO", knockout: { flagWhen: false } }),
        apiQuestion({ id: "b", kind: "YES_NO", knockout: { flagWhen: true } }),
        apiQuestion({ id: "c", kind: "YES_NO", knockout: null }),
      ]),
    ).questions;
    expect([no?.knockout, no?.knockoutWhen]).toEqual([true, "NO"]);
    expect([yes?.knockout, yes?.knockoutWhen]).toEqual([true, "YES"]);
    expect(none?.knockout).toBe(false);
  });

  it("carries the company's privacy notice in only when it is required", () => {
    expect(definitionFromApi(apiForm(), consent()).consent).toEqual({
      enabled: true,
      text: "We keep your application.",
      url: "https://acme.example/privacy",
      ref: "default-1",
    });
    expect(
      definitionFromApi(apiForm(), consent({ required: false })).consent
        .enabled,
    ).toBe(false);
    expect(definitionFromApi(apiForm(), null).consent.enabled).toBe(false);
  });
});

describe("the builder's form, as the API takes it", () => {
  it("sends the whole list in order and the switches", () => {
    const body = putBodyFromDefinition({
      ...defaultDefinition(),
      standard: { phone: "OFF", cv: "REQUIRED", coverNote: "OPTIONAL" },
      questions: [
        { ...blankQuestion("SHORT_TEXT", UUID), label: "  Job title " },
        {
          ...blankQuestion("LONG_TEXT", "q_new"),
          label: "Why us?",
          wordLimit: 80,
          helper: " Be brief ",
        },
      ],
    });
    expect(body.settings).toEqual({
      phoneMode: "OFF",
      cvMode: "REQUIRED",
      coverNoteMode: "OPTIONAL",
    });
    expect(body.questions).toHaveLength(2);
    expect(body.questions?.[0]).toMatchObject({
      id: UUID,
      label: "Job title",
      helpText: null,
    });
    expect(body.questions?.[1]).toMatchObject({
      label: "Why us?",
      maxWords: 80,
      helpText: "Be brief",
    });
  });

  it("leaves the id off a question the API has not seen, and keeps one it has", () => {
    expect(isServerId(UUID)).toBe(true);
    expect(isServerId("q_ab12cd34")).toBe(false);
    const body = putBodyFromDefinition({
      ...defaultDefinition(),
      questions: [
        { ...blankQuestion("SHORT_TEXT", "q_ab12cd34"), label: "New" },
        { ...blankQuestion("SHORT_TEXT", UUID), label: "Old" },
      ],
    });
    expect(body.questions?.[0]).not.toHaveProperty("id");
    expect(body.questions?.[1]).toHaveProperty("id", UUID);
  });

  it("sends only the settings that belong to each kind", () => {
    const body = putBodyFromDefinition({
      ...defaultDefinition(),
      questions: [
        { ...blankQuestion("NUMBER", "a"), label: "Years", min: 0, max: 40 },
        {
          ...blankQuestion("SINGLE_CHOICE", "b"),
          label: "Tool",
          options: [
            { id: "o1", label: " Excel " },
            { id: "o2", label: "SQL" },
          ],
        },
        {
          ...blankQuestion("YES_NO", "c"),
          label: "Right to work?",
          knockout: true,
          knockoutWhen: "NO",
        },
        {
          ...blankQuestion("YES_NO", "d"),
          label: "Relocate?",
          knockout: true,
          knockoutWhen: "YES",
        },
        { ...blankQuestion("YES_NO", "e"), label: "Driver?", knockout: false },
        { ...blankQuestion("URL", "f"), label: "Portfolio" },
      ],
    });
    const [number, choice, ko, koYes, plain, url] = body.questions ?? [];
    expect(number).toMatchObject({ minValue: 0, maxValue: 40 });
    expect(number).not.toHaveProperty("maxWords");
    expect(choice?.choices).toEqual([
      { id: "o1", label: "Excel" },
      { id: "o2", label: "SQL" },
    ]);
    expect(ko?.knockout).toEqual({ flagWhen: false });
    expect(koYes?.knockout).toEqual({ flagWhen: true });
    expect(plain?.knockout).toBeNull();
    expect(url).not.toHaveProperty("choices");
    expect(url).not.toHaveProperty("knockout");
  });
});

describe("a refusal, sorted to the question it was about", () => {
  const definition = {
    ...defaultDefinition(),
    questions: [
      { ...blankQuestion("SHORT_TEXT", "a"), label: "One" },
      { ...blankQuestion("SHORT_TEXT", "b"), label: "Two" },
    ],
  };

  it("finds the n-th question from questions.n.name, and keeps the first message", () => {
    const sorted = problemsFromApi(
      [
        { field: "questions.1.label", message: "Write the question." },
        {
          field: "questions.1.choices",
          message: "Give at least two options to choose from.",
        },
        {
          field: "questions.0.maxWords",
          message: "A word limit has to be at least 1.",
        },
      ],
      definition,
    );
    expect(sorted.questions).toEqual({
      b: "Write the question.",
      a: "A word limit has to be at least 1.",
    });
    expect(sorted.form).toBeNull();
  });

  it("puts anything about the list as a whole under the form", () => {
    expect(
      problemsFromApi(
        [
          {
            field: "questions",
            message: "A form can have at most 20 questions.",
          },
        ],
        definition,
      ),
    ).toEqual({ questions: {}, form: "A form can have at most 20 questions." });
    expect(problemsFromApi(undefined, definition)).toEqual({
      questions: {},
      form: null,
    });
  });
});

describe("whether two forms say the same thing", () => {
  it("ignores how many people answered, which is not an edit", () => {
    const a = {
      ...defaultDefinition(),
      questions: [
        { ...blankQuestion("SHORT_TEXT", "a"), label: "One", answered: 2 },
      ],
    };
    const b = {
      ...defaultDefinition(),
      questions: [
        { ...blankQuestion("SHORT_TEXT", "a"), label: "One", answered: 5 },
      ],
    };
    expect(sameDefinition(a, b)).toBe(true);
    expect(
      sameDefinition(a, {
        ...b,
        questions: [{ ...b.questions[0]!, label: "One!" }],
      }),
    ).toBe(false);
    expect(
      sameDefinition(a, { ...a, standard: { ...a.standard, phone: "OFF" } }),
    ).toBe(false);
  });
});

/* ---------------------------------------------------------------- answers */

const detail = (
  over: Partial<ApiApplicationDetail> = {},
): ApiApplicationDetail =>
  ({
    id: "app-1",
    postingId: "p1",
    postingTitle: "Payroll Analyst",
    firstName: "Ada",
    lastName: "Okafor",
    name: "Ada Okafor",
    email: "ada@example.com",
    phone: null,
    coverNote: null,
    source: "linkedin",
    status: "RECEIVED",
    screenedAt: null,
    declineReason: null,
    candidateId: null,
    cv: null,
    appliedAt: "2026-10-15T12:00:00.000Z",
    reference: "APP-7K2M9Q3X",
    knockoutCount: 0,
    duplicate: null,
    otherApplications: [],
    answers: [],
    consent: null,
    likelyDuplicates: [],
    ...over,
  }) as ApiApplicationDetail;

describe("what a recruiter reads of an application", () => {
  it("reads each answer as one line, in order, with the question as they saw it", () => {
    const extras = extrasFromDetail(
      detail({
        answers: [
          {
            id: "a1",
            questionId: "q1",
            position: 0,
            kind: "YES_NO",
            question: "Right to work in Nigeria?",
            value: false,
            display: "No",
            flagged: true,
            flagReason: 'Answered No to "Right to work in Nigeria?"',
            file: null,
          },
          {
            id: "a2",
            questionId: "q2",
            position: 1,
            kind: "LONG_TEXT",
            question: "Why us?",
            value: "I like payroll because it has to be right",
            display: "I like payroll because it has to be right",
            flagged: false,
            flagReason: null,
            file: null,
          },
          {
            id: "a3",
            questionId: "q3",
            position: 2,
            kind: "MULTI_CHOICE",
            question: "Tools",
            value: [{ id: "1", label: "Excel" }],
            display: "Excel; SQL",
            flagged: false,
            flagReason: null,
            file: null,
          },
          {
            id: "a4",
            questionId: "q4",
            position: 3,
            kind: "URL",
            question: "Portfolio",
            value: "https://example.com/me",
            display: "https://example.com/me",
            flagged: false,
            flagReason: null,
            file: null,
          },
          {
            id: "a5",
            questionId: "q5",
            position: 4,
            kind: "FILE",
            question: "Certificate",
            value: null,
            display: "Attached file (application/pdf, 54 KB)",
            flagged: false,
            flagReason: null,
            file: {
              contentType: "application/pdf",
              sizeBytes: 55_296,
              scanStatus: "NOT_SCANNED",
              openPath: "/careers/applications/app-1/answers/a5/file",
            },
          },
        ],
      }),
    );
    expect(extras.answers.map((row) => [row.label, row.text])).toEqual([
      ["Right to work in Nigeria?", "No"],
      ["Why us?", "I like payroll because it has to be right"],
      ["Tools", "Excel; SQL"],
      ["Portfolio", "https://example.com/me"],
      ["Certificate", null],
    ]);
    expect(extras.answers[1]?.words).toBe(9);
    expect(extras.answers[3]?.link).toBe("https://example.com/me");
    expect(extras.answers[4]?.file).toEqual({
      description: "PDF, 54 KB",
      sizeBytes: 55_296,
      scanStatus: "NOT_SCANNED",
    });
    expect(extras.flagCount).toBe(1);
    expect(extras.answers[0]).toMatchObject({
      flagged: true,
      flagReason: 'Answered No to "Right to work in Nigeria?"',
    });
  });

  it("does not draw a link for a web-address answer that is not one", () => {
    const extras = extrasFromDetail(
      detail({
        answers: [
          {
            id: "a",
            questionId: "q",
            position: 0,
            kind: "URL",
            question: "Link",
            value: "javascript:alert(1)",
            display: "javascript:alert(1)",
            flagged: false,
            flagReason: null,
            file: null,
          },
        ],
      }),
    );
    expect(extras.answers[0]?.link).toBeNull();
  });

  it("carries the reference, a readable source and the consent record word for word", () => {
    const extras = extrasFromDetail(
      detail({
        consent: {
          noticeRef: "custom-2",
          noticeText: "We keep it for a year.",
          noticeUrl: null,
          acceptedAt: "2026-10-15T12:00:00.000Z",
          postingId: "p1",
          postingTitle: "Payroll Analyst",
        },
      }),
    );
    expect(extras.reference).toBe("APP-7K2M9Q3X");
    expect(extras.source).toBe("LinkedIn");
    expect(extras.consent).toEqual({
      acceptedOn: "2026-10-15",
      noticeText: "We keep it for a year.",
      noticeRef: "custom-2",
    });
  });

  it("says nothing of consent when none was given", () => {
    expect(extrasFromDetail(detail()).consent).toBeNull();
  });

  it("marks a duplicate from the stored pointer, and names them from the live list", () => {
    const extras = extrasFromDetail(
      detail({
        duplicate: { ofId: "earlier", reason: "SAME_PHONE" },
        likelyDuplicates: [
          {
            id: "earlier",
            reference: "APP-1",
            name: "Ada O.",
            postingId: "p0",
            postingTitle: "Other",
            status: "RECEIVED",
            appliedAt: "2026-10-01T09:00:00.000Z",
            reason: "SAME_PHONE",
          },
        ],
      }),
    );
    expect(extras.duplicate).toEqual({
      reason: "SAME_PHONE",
      ofId: "earlier",
      ofName: "Ada O.",
    });
  });

  it("finds a duplicate the earlier application did not know it had, from the live list alone", () => {
    const extras = extrasFromDetail(
      detail({
        duplicate: null,
        likelyDuplicates: [
          {
            id: "later",
            reference: null,
            name: "Ada O.",
            postingId: "p9",
            postingTitle: "Other",
            status: "RECEIVED",
            appliedAt: "2026-10-20T09:00:00.000Z",
            reason: "SAME_EMAIL",
          },
        ],
      }),
    );
    expect(extras.duplicate).toMatchObject({
      reason: "SAME_EMAIL",
      ofId: "later",
    });
  });

  it("is empty for an API that predates forms", () => {
    const old = detail();
    delete (old as Partial<ApiApplicationDetail>).answers;
    delete (old as Partial<ApiApplicationDetail>).consent;
    delete (old as Partial<ApiApplicationDetail>).reference;
    const extras = extrasFromDetail(old);
    expect(extras.answers).toEqual([]);
    expect(extras.reference).toBeNull();
    expect(extras.flagCount).toBe(0);
  });

  it("reads a list row's summary without fetching the application", () => {
    expect(
      summaryFromRow({
        reference: "APP-1",
        knockoutCount: 2,
        duplicate: { ofId: "x", reason: "SAME_EMAIL" },
      }),
    ).toEqual({
      reference: "APP-1",
      flagCount: 2,
      duplicate: { ofId: "x", reason: "SAME_EMAIL" },
    });
    expect(summaryFromRow({})).toEqual({
      reference: null,
      flagCount: 0,
      duplicate: null,
    });
    expect(
      summaryFromRow({ duplicate: { ofId: "x", reason: "SOMETHING_NEW" } })
        .duplicate,
    ).toBeNull();
  });

  it("gives the channels people recognise their proper names, and passes the rest through", () => {
    expect(sourceLabel("linkedin")).toBe("LinkedIn");
    expect(sourceLabel("careers-page")).toBe("Careers page");
    expect(sourceLabel("whatsapp")).toBe("WhatsApp");
    expect(sourceLabel("jobberman")).toBe("jobberman");
    expect(sourceLabel(null)).toBeNull();
  });
});

describe("the demo's answers agree with the demo's queue", () => {
  const { applications } = demoBook();

  it("gives every queued applicant answers, a consent record and the reference their row shows", () => {
    expect(applications.length).toBeGreaterThan(0);
    for (const row of applications) {
      const extras = demoApplicationExtras(row.id);
      expect(extras).not.toBeNull();
      expect(extras?.reference).toBe(row.reference);
      expect(extras?.consent?.noticeText).toContain("consider you");
      expect(extras?.answers.length).toBeGreaterThan(0);
      expect(extras?.flagCount).toBe(row.knockoutCount);
      expect(Boolean(extras?.duplicate)).toBe(Boolean(row.duplicate));
    }
  });

  it("has somebody who needs a look, and somebody who is a possible duplicate", () => {
    expect(applications.some((row) => (row.knockoutCount ?? 0) > 0)).toBe(true);
    const duplicate = applications.find((row) => row.duplicate);
    expect(duplicate).toBeDefined();
    const extras = demoApplicationExtras(duplicate?.id ?? "");
    expect(extras?.duplicate?.ofName).toBeTruthy();
    expect(extras?.duplicate?.ofId).not.toBe(duplicate?.id);
  });

  it("flags the answer that raised it, with the reason, and never rejects", () => {
    const flagged = applications.find((row) => (row.knockoutCount ?? 0) > 0);
    const extras = demoApplicationExtras(flagged?.id ?? "");
    const row = extras?.answers.find((answer) => answer.flagged);
    expect(row?.flagReason).toMatch(/Answered No/);
    expect(flagged?.status).toBe("RECEIVED");
  });

  it("says nothing for an id that is not in the queue", () => {
    expect(demoApplicationExtras("no-such-application")).toBeNull();
  });
});
