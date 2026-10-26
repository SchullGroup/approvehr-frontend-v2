import type { ApiCareersSettings } from "@/lib/api/careers";
import {
  blankQuestion,
  defaultDefinition,
  type FormDefinition,
  type FormQuestion,
} from "@/lib/marketing/apply-form";
import {
  NO_EXTRAS,
  type AnswerRow,
  type ApplicationExtras,
} from "@/lib/hiring/answers-view";
import { countWords } from "@/lib/marketing/apply-form";

/**
 * The demo's careers data: a company that has told applicants who it is, a form
 * with one of each thing worth showing, and what four applicants answered.
 *
 * Kept apart from both stores because both need it and neither may import the
 * other. Nothing here is a claim about a real company: it is the seed a demo
 * workspace opens with, and every screen that shows it says it is demo data.
 */

/**
 * What nobody has told applicants yet. What every screen reads in a build that
 * has no demo, where it is never shown: a company there reads its own settings
 * from the API, and a screen with none sees an empty company rather than an
 * invented one.
 */
const NO_SETTINGS: ApiCareersSettings = {
  branding: {
    displayName: null,
    name: "",
    companyName: "",
    description: null,
    websiteUrl: null,
    accentColor: null,
    logoUrl: null,
  },
  contact: { replyToEmail: null },
  consent: {
    required: false,
    text: "",
    customText: null,
    url: null,
    version: "",
    isDefault: true,
    needsReview: false,
    reviewNote: null,
    standardText: "",
  },
  acknowledgement: { enabled: false, willSend: false, blockedBy: [] },
  search: { indexable: false },
  deployment: { fileUploads: false },
};

/**
 * What a demo company has told its applicants. Fixed. Behind `DEMO_ENABLED` so
 * that a production build holds an empty company and not this invented one.
 */
export const DEMO_SETTINGS: ApiCareersSettings = DEMO_ENABLED
  ? {
      branding: {
        displayName: null,
        name: "Schull Technologies",
        companyName: "Schull Technologies",
        description:
          "We build the payroll and HR software growing Nigerian companies run on.",
        websiteUrl: "https://approvehr.io",
        accentColor: "#2b3990",
        logoUrl: null,
      },
      contact: { replyToEmail: "careers@schull.io" },
      consent: {
        required: true,
        text:
          "Schull Technologies will use the information in this application to consider you for this job and to contact you about it.\n\n" +
          "It is stored in ApproveHR, the system Schull Technologies uses to manage its hiring, and it is seen by the people there who take part in hiring.\n\n" +
          "To ask what Schull Technologies holds about you, or to have it corrected or removed, contact careers@schull.io.",
        customText: null,
        url: null,
        version: "default-1",
        isDefault: true,
        needsReview: true,
        reviewNote:
          "This is ApproveHR's standard wording. It has not been reviewed for your company. Have your counsel or data-protection officer read it, and replace it with your own notice if it is not right.",
        standardText: "",
      },
      acknowledgement: { enabled: true, willSend: false, blockedBy: [] },
      search: { indexable: true },
      deployment: { fileUploads: true },
    }
  : NO_SETTINGS;

/** The questions every demo advert starts with: one of each thing worth showing. */
export function demoQuestions(): FormQuestion[] {
  if (!DEMO_ENABLED) return [];
  return [
    {
      ...blankQuestion("YES_NO", "demo-q-work"),
      label: "Do you have the right to work in Nigeria?",
      required: true,
      knockout: true,
      knockoutWhen: "NO",
    },
    {
      ...blankQuestion("NUMBER", "demo-q-years"),
      label: "How many years have you worked in this field?",
      required: true,
      min: 0,
      max: 50,
    },
    {
      ...blankQuestion("SINGLE_CHOICE", "demo-q-notice"),
      label: "How soon could you start?",
      required: false,
      options: [
        { id: "demo-o-now", label: "Straight away" },
        { id: "demo-o-month", label: "In a month" },
        { id: "demo-o-three", label: "In three months" },
      ],
    },
    {
      ...blankQuestion("LONG_TEXT", "demo-q-why"),
      label: "Why do you want this job?",
      helper: "A few sentences is plenty.",
      required: true,
      wordLimit: 120,
    },
    {
      ...blankQuestion("URL", "demo-q-link"),
      label: "A link to your work or your LinkedIn profile",
      required: false,
    },
  ];
}

/** The form a demo advert has until somebody edits it. */
export function seededDemoForm(): FormDefinition {
  return {
    ...defaultDefinition(),
    consent: {
      enabled: DEMO_SETTINGS.consent.required,
      text: DEMO_SETTINGS.consent.text,
      url: DEMO_SETTINGS.consent.url,
      ref: DEMO_SETTINGS.consent.version,
    },
    questions: demoQuestions(),
  };
}

/* ------------------------------------------------------------ demo answers */

type Spec = {
  work: "yes" | "no";
  years: string;
  notice: string | null;
  why: string;
  link: string | null;
};

const SPECS: Spec[] = !DEMO_ENABLED
  ? []
  : [
      {
        work: "yes",
        years: "6",
        notice: "In a month",
        why: "I have run payroll for four hundred people and I want to do it for a company that cares how it is done. I like that the maths is right before anything else.",
        link: "https://www.linkedin.com/in/chioma-demo",
      },
      {
        work: "no",
        years: "2",
        notice: "Straight away",
        why: "I am between contracts and this is close to home.",
        link: null,
      },
      {
        work: "yes",
        years: "11",
        notice: "In three months",
        why: "I have seen what a bad payroll month does to a team and I would like to prevent it.",
        link: "https://example.com/portfolio",
      },
      { work: "yes", years: "4", notice: null, why: "", link: null },
    ];

function rowsFor(spec: Spec): AnswerRow[] {
  const q = demoQuestions();
  const rows: AnswerRow[] = [];
  const [work, years, notice, why, link] = q as [
    FormQuestion,
    FormQuestion,
    FormQuestion,
    FormQuestion,
    FormQuestion,
  ];
  const flagged = spec.work === "no";
  rows.push({
    id: `${work.id}-a`,
    label: work.label,
    kind: work.kind,
    knockout: true,
    text: spec.work === "yes" ? "Yes" : "No",
    words: null,
    link: null,
    file: null,
    flagged,
    flagReason: flagged ? `Answered No to "${work.label}"` : null,
  });
  rows.push({
    id: `${years.id}-a`,
    label: years.label,
    kind: years.kind,
    knockout: false,
    text: spec.years,
    words: null,
    link: null,
    file: null,
    flagged: false,
    flagReason: null,
  });
  rows.push({
    id: `${notice.id}-a`,
    label: notice.label,
    kind: notice.kind,
    knockout: false,
    text: spec.notice,
    words: null,
    link: null,
    file: null,
    flagged: false,
    flagReason: null,
  });
  rows.push({
    id: `${why.id}-a`,
    label: why.label,
    kind: why.kind,
    knockout: false,
    text: spec.why === "" ? null : spec.why,
    words: spec.why === "" ? null : countWords(spec.why),
    link: null,
    file: null,
    flagged: false,
    flagReason: null,
  });
  rows.push({
    id: `${link.id}-a`,
    label: link.label,
    kind: link.kind,
    knockout: false,
    text: spec.link,
    words: null,
    link: spec.link,
    file: null,
    flagged: false,
    flagReason: null,
  });
  return rows;
}

/** The crowd's answers: wrong on the same ones the queue flags (every ninth). */
const WHYS = [
  "I enjoy the detail in payroll work and I would like to do it for a team that checks its figures.",
  "I have wanted to move into hiring and this role is the closest I have found to what I do now.",
  "My current contract ends this month and this job is close to home.",
  "",
];

function crowdSpec(k: number): Spec {
  return {
    work: k % 9 === 4 ? "no" : "yes",
    years: String(1 + (k % 9)),
    notice:
      ["Straight away", "In a month", "In three months", null][k % 4] ?? null,
    why: WHYS[k % WHYS.length] ?? "",
    link: k % 5 === 0 ? "https://example.com/portfolio" : null,
  };
}

/**
 * What each demo applicant answered, by their position in the queue.
 *
 * The first four are the hand-written ones. Everybody after them is the crowd, made
 * from a formula, and answered the same way for the same reason as the queue's
 * flags and duplicate markers: the row and the record must agree.
 */
export function demoExtrasAt(
  index: number,
  firstApplicationId: string,
): ApplicationExtras {
  const seeded = SPECS.length;
  const spec =
    SPECS[index] ?? (index >= seeded ? crowdSpec(index - seeded) : undefined);
  if (!spec) return NO_EXTRAS;
  const answers = rowsFor(spec);
  const k = index - seeded;
  return {
    reference: `APP-DEMO000${index + 1}`,
    source: ["LinkedIn", "WhatsApp", "Careers page", null][index] ?? null,
    answers,
    consent: {
      acceptedOn: `2026-08-${String(12 + (index % 7)).padStart(2, "0")}`,
      noticeText: DEMO_SETTINGS.consent.text,
      noticeRef: DEMO_SETTINGS.consent.version,
    },
    flagCount: answers.filter((row) => row.flagged).length,
    /* The third applicant gave the first one's phone number: a marker, not a merge.
       So does every fourteenth of the crowd, by email. */
    duplicate:
      index === 2
        ? {
            reason: "SAME_PHONE",
            ofId: firstApplicationId,
            ofName: null,
          }
        : index >= seeded && k % 14 === 9
          ? {
              reason: "SAME_EMAIL",
              ofId: firstApplicationId,
              ofName: null,
            }
          : null,
  };
}
