import { describe, expect, it } from "vitest";
import type { ApplyPayload } from "@/lib/marketing/apply-client";
import {
  cleanSource,
  confirmationExpected,
  formFromDetail,
  logoSrc,
  toApplyBody,
  type PublicRoleDetail,
} from "@/lib/marketing/careers";

/**
 * The application as the API takes it, and the advert as the API describes it.
 * The two places the shape of the wire is written down, tested as plain data.
 */

const payload = (over: Partial<ApplyPayload> = {}): ApplyPayload => ({
  firstName: " Chioma ",
  lastName: "Aduba",
  email: " chioma@example.com ",
  phone: "",
  coverNote: "",
  cv: null,
  answers: {},
  consent: null,
  src: null,
  extra: { faxNumber: "" },
  ...over,
});

describe("the body of an application", () => {
  it("trims the person's own boxes and leaves out every one left empty", () => {
    expect(toApplyBody(payload())).toEqual({
      firstName: "Chioma",
      lastName: "Aduba",
      email: "chioma@example.com",
    });
  });

  it("sends the CV as the key an upload address issued, never a name or a link", () => {
    const body = toApplyBody(
      payload({
        cv: { key: "org/cvs/post/abc.pdf", name: "My CV.pdf", sizeBytes: 10 },
      }),
    );
    expect(body.cvKey).toBe("org/cvs/post/abc.pdf");
    expect(JSON.stringify(body)).not.toContain("My CV.pdf");
  });

  it("sends answers by question id: text, an option id, option ids, yes or no, a file's key", () => {
    const body = toApplyBody(
      payload({
        answers: {
          title: "  Payroll lead ",
          pick: "opt-2",
          many: ["opt-1", "opt-3"],
          work: "yes",
          cert: {
            key: "org/cvs/post/cert.pdf",
            name: "cert.pdf",
            sizeBytes: 5,
          },
        },
      }),
    );
    expect(body.answers).toEqual({
      title: "Payroll lead",
      pick: "opt-2",
      many: ["opt-1", "opt-3"],
      work: "yes",
      cert: "org/cvs/post/cert.pdf",
    });
  });

  it("leaves out an answer that is blank, null or an empty list, so nothing is sent for it", () => {
    const body = toApplyBody(
      payload({ answers: { a: "", b: "   ", c: null, d: [], e: "kept" } }),
    );
    expect(body.answers).toEqual({ e: "kept" });
    expect(toApplyBody(payload({ answers: { a: "" } }))).not.toHaveProperty(
      "answers",
    );
  });

  it("says the notice was accepted, and which one, only when the form asked", () => {
    expect(toApplyBody(payload())).not.toHaveProperty("consent");
    expect(
      toApplyBody(
        payload({ consent: { text: "We keep it.", ref: "custom-2" } }),
      ),
    ).toMatchObject({
      consent: true,
      consentVersion: "custom-2",
    });
    const noRef = toApplyBody(
      payload({ consent: { text: "We keep it.", ref: null } }),
    );
    expect(noRef).toMatchObject({ consent: true });
    expect(noRef).not.toHaveProperty("consentVersion");
  });

  it("never sends the notice's own text, only that it was accepted and which version", () => {
    expect(
      JSON.stringify(
        toApplyBody(payload({ consent: { text: "SECRET WORDS", ref: "x" } })),
      ),
    ).not.toContain("SECRET WORDS");
  });

  it("sends where they came from, cleaned, and the utm values when there are any", () => {
    const body = toApplyBody(
      payload({
        src: "linkedin",
        utm: {
          source: "newsletter",
          medium: "email",
          campaign: " autumn  2026 ",
        },
      }),
    );
    expect(body.src).toBe("linkedin");
    expect(body.utm).toEqual({
      source: "newsletter",
      medium: "email",
      campaign: "autumn 2026",
    });
    expect(toApplyBody(payload({ utm: {} }))).not.toHaveProperty("utm");
    expect(toApplyBody(payload({ utm: null }))).not.toHaveProperty("utm");
  });

  it("does not put the honeypot or the check's token in the body: those travel beside it", () => {
    const body = toApplyBody(
      payload({ extra: { faxNumber: "x", captchaToken: "t" } }),
    );
    expect(body).not.toHaveProperty("faxNumber");
    expect(body).not.toHaveProperty("captchaToken");
  });
});

describe("a source from an address bar", () => {
  it("drops control characters, collapses spaces and stops at 60 characters", () => {
    expect(cleanSource("  link\u0007 ed\u0000in  ")).toBe("link edin");
    expect(cleanSource("x".repeat(100))).toHaveLength(60);
    expect(cleanSource("")).toBeNull();
    expect(cleanSource("   ")).toBeNull();
    expect(cleanSource(null)).toBeNull();
    expect(cleanSource(undefined)).toBeNull();
  });
});

describe("whether to say an email is coming", () => {
  const result = (confirmationEmail: unknown) =>
    ({
      id: "1",
      company: "A",
      postingTitle: "P",
      note: "ok",
      cvNote: null,
      reference: null,
      confirmationEmail,
    }) as Parameters<typeof confirmationExpected>[0];

  it("is yes only when the API says so, as true", () => {
    expect(confirmationExpected(result(true))).toBe(true);
    for (const other of [false, null, undefined, "true", 1, "queued"])
      expect(confirmationExpected(result(other))).toBe(false);
  });
});

/* ------------------------------------------------------------------ the advert */

const detail = (over: Partial<PublicRoleDetail> = {}): PublicRoleDetail => ({
  slug: "payroll-analyst",
  title: "Payroll Analyst",
  summary: "s",
  location: null,
  employmentType: "FULL_TIME",
  salaryMinKobo: null,
  salaryMaxKobo: null,
  closesOn: null,
  acceptingApplications: true,
  postedOn: null,
  company: "Acme",
  description: "d",
  ...over,
});

describe("the form the advert describes", () => {
  it("is the original boxes for an API that predates the builder", () => {
    const { form, uploadsEnabled } = formFromDetail(detail());
    expect(form.standard).toEqual({
      phone: "OPTIONAL",
      coverNote: "OPTIONAL",
      cv: "OPTIONAL",
    });
    expect(form.questions).toEqual([]);
    expect(form.consent.enabled).toBe(false);
    expect(uploadsEnabled).toBe(false);
    expect(formFromDetail(detail({ acceptsCv: true })).uploadsEnabled).toBe(
      true,
    );
  });

  it("carries the switches, the questions with their choices and limits, and the notice", () => {
    const { form, uploadsEnabled } = formFromDetail(
      detail({
        applicationForm: {
          version: 2,
          fields: { phone: "REQUIRED", cv: "OFF", coverNote: "OPTIONAL" },
          upload: { enabled: true, maxBytes: 1, contentTypes: [] },
          questions: [
            {
              id: "q1",
              kind: "SINGLE_CHOICE",
              label: "Tool",
              helpText: "Pick one",
              required: true,
              maxWords: null,
              minValue: null,
              maxValue: null,
              choices: [
                { id: "c1", label: "Excel" },
                { id: "c2", label: "SQL" },
              ],
            },
            {
              id: "q2",
              kind: "LONG_TEXT",
              label: "Why",
              helpText: null,
              required: false,
              maxWords: 120,
              minValue: null,
              maxValue: null,
              choices: null,
            },
          ],
        },
        consent: {
          required: true,
          text: "We keep it.",
          url: "https://a.example/p",
          version: "custom-1",
        },
      }),
    );
    expect(uploadsEnabled).toBe(true);
    expect(form.standard).toEqual({
      phone: "REQUIRED",
      cv: "OFF",
      coverNote: "OPTIONAL",
    });
    expect(form.questions[0]).toMatchObject({
      id: "q1",
      kind: "SINGLE_CHOICE",
      helper: "Pick one",
      required: true,
      options: [
        { id: "c1", label: "Excel" },
        { id: "c2", label: "SQL" },
      ],
    });
    expect(form.questions[1]).toMatchObject({
      kind: "LONG_TEXT",
      helper: "",
      wordLimit: 120,
      options: [],
    });
    expect(form.consent).toEqual({
      enabled: true,
      text: "We keep it.",
      url: "https://a.example/p",
      ref: "custom-1",
    });
  });

  it("never invents a knockout: the public page is not told which answer flags", () => {
    const { form } = formFromDetail(
      detail({
        applicationForm: {
          version: 1,
          fields: { phone: "OPTIONAL", cv: "OPTIONAL", coverNote: "OPTIONAL" },
          upload: { enabled: false, maxBytes: 0, contentTypes: [] },
          questions: [
            {
              id: "q",
              kind: "YES_NO",
              label: "Right to work?",
              helpText: null,
              required: true,
              maxWords: null,
              minValue: null,
              maxValue: null,
              choices: null,
            },
          ],
        },
      }),
    );
    expect(form.questions[0]?.knockout).toBe(false);
  });

  it("asks for no notice when the company has not required one", () => {
    const { form } = formFromDetail(
      detail({
        consent: {
          required: false,
          text: "x",
          url: null,
          version: "default-1",
        },
      }),
    );
    expect(form.consent.enabled).toBe(false);
  });
});

describe("the company's logo", () => {
  it("is the API's own address, made absolute, and nothing from anywhere else", () => {
    const branding = (logoUrl: string | null) => ({
      name: "A",
      logoUrl,
      description: null,
      websiteUrl: null,
      accentColor: null,
    });
    expect(logoSrc(branding(null))).toBeNull();
    expect(logoSrc(undefined)).toBeNull();
    /* No API is configured in this test's environment, so nothing can be drawn. */
    expect(
      logoSrc(branding("/api/v1/careers/public/acme/logo?v=1")),
    ).toBeNull();
  });
});
