import type { Application, Candidate, StageId } from "@/lib/types";

/*
 * A campus-drive-sized crowd for the demo's first role.
 *
 * Twelve people cannot show a column that pages, a "select everyone matching
 * these filters" that names a number worth confirming, or a talent pool that
 * spans jobs. This adds seventy more to the Senior Backend Engineer role, made
 * from a formula rather than a random call so the demo reads the same on every
 * laptop and in every test. Every name is a demo applicant, none is a real
 * person, and nothing here exists outside a build that has a demo.
 *
 * None of them came through the careers page. The demo's application queue is
 * built from the candidates who did, and seventy people who are already in the
 * pipeline must not also appear there as "waiting".
 */

const FIRST = [
  "Adaora",
  "Bisi",
  "Chuka",
  "Damilola",
  "Efe",
  "Funmi",
  "Gbenga",
  "Hauwa",
  "Ikenna",
  "Jumoke",
  "Kelechi",
  "Lola",
  "Maryam",
  "Nonso",
  "Obinna",
  "Peace",
  "Quadri",
  "Rasheed",
  "Sade",
  "Tobi",
  "Uche",
  "Victoria",
  "Wale",
  "Yetunde",
  "Zara",
];

const LAST = [
  "Abiodun",
  "Balogun",
  "Chukwu",
  "Dada",
  "Eze",
  "Fashola",
  "Garba",
  "Hassan",
  "Igwe",
  "Jibril",
  "Kalu",
  "Lawson",
  "Mbah",
  "Nnamdi",
  "Okeke",
  "Peters",
  "Quadri",
  "Raji",
  "Salami",
  "Thomas",
  "Umar",
  "Victor",
  "Williams",
  "Yakubu",
  "Zubair",
];

const COMPANIES = [
  "Paystack",
  "Flutterwave",
  "Interswitch",
  "Kuda",
  "Moniepoint",
  "Andela",
  "Cowrywise",
  "Piggyvest",
  "Access Bank",
  "Freelance",
];

const TITLES = [
  "Backend Engineer",
  "Software Engineer",
  "Platform Engineer",
  "Junior Engineer",
  "Senior Engineer",
];

const CITIES = [
  "Lagos, NG",
  "Abuja, NG",
  "Ibadan, NG",
  "Kano, NG",
  "Enugu, NG",
  "Port Harcourt, NG",
];

/** Never `careers_page`: see the note at the top. */
const SOURCES: Candidate["source"][] = [
  "linkedin",
  "referral",
  "agency",
  "sourced",
  "linkedin",
  "sourced",
];

/**
 * Where seventy people sit: most at the door, fewer at each step after it, a few
 * turned down. A real funnel is lopsided like this, and a lopsided board is the
 * one that needs paging.
 */
const SPREAD: { stage: StageId; outcome: Application["outcome"] }[] = [
  ...Array.from({ length: 40 }, () => ({
    stage: "sourced" as StageId,
    outcome: "in_progress" as const,
  })),
  ...Array.from({ length: 10 }, () => ({
    stage: "shortlisted" as StageId,
    outcome: "in_progress" as const,
  })),
  ...Array.from({ length: 6 }, () => ({
    stage: "prescreen" as StageId,
    outcome: "in_progress" as const,
  })),
  ...Array.from({ length: 3 }, () => ({
    stage: "interview" as StageId,
    outcome: "in_progress" as const,
  })),
  ...Array.from({ length: 8 }, () => ({
    stage: "sourced" as StageId,
    outcome: "rejected" as const,
  })),
  ...Array.from({ length: 3 }, () => ({
    stage: "shortlisted" as StageId,
    outcome: "withdrawn" as const,
  })),
];

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** A day between 2 July and 18 August, by index. */
function dayFor(index: number): string {
  const offset = (index * 7) % 48;
  const date = new Date(Date.UTC(2026, 6, 2 + offset));
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function laterThan(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d + days));
  const capped =
    date.getTime() > Date.UTC(2026, 7, 18) ? Date.UTC(2026, 7, 18) : date;
  const out = new Date(capped);
  return `${pad(out.getUTCFullYear(), 4)}-${pad(out.getUTCMonth() + 1)}-${pad(out.getUTCDate())}`;
}

const REJECTION_NOTES = [
  "Below the experience bar for this role",
  "Salary expectation is well above the band",
  "Could not start inside the notice window",
];

export function crowdFor(requisitionId: string): {
  candidates: Candidate[];
  applications: Application[];
} {
  if (!DEMO_ENABLED) return { candidates: [], applications: [] };

  const candidates: Candidate[] = [];
  const applications: Application[] = [];

  SPREAD.forEach((place, index) => {
    const n = index + 1;
    const first = FIRST[index % FIRST.length] as string;
    const last = LAST[(index * 7 + 3) % LAST.length] as string;
    const id = `c-x${pad(n)}`;
    const applied = dayFor(index);
    const entered =
      place.stage === "sourced" ? applied : laterThan(applied, 3 + (index % 9));

    candidates.push({
      id,
      firstName: first,
      lastName: last,
      email: `${first}.${last}${n}@mail.com`.toLowerCase(),
      phone: `+234 80${index % 10} ${pad(100 + index, 3)} ${pad(1000 + index * 3, 4)}`,
      location: CITIES[index % CITIES.length] as string,
      currentTitle: TITLES[index % TITLES.length] as string,
      currentCompany: COMPANIES[(index * 3) % COMPANIES.length] as string,
      yearsExperience: 1 + (index % 9),
      source: SOURCES[index % SOURCES.length] as Candidate["source"],
      expectedSalary: 900_000 + (index % 12) * 100_000,
      noticePeriodWeeks: 1 + (index % 6),
      cvFileName: `${first}-${last}-cv.pdf`.toLowerCase(),
    });

    applications.push({
      id: `app-x${pad(n)}`,
      requisitionId,
      candidateId: id,
      stage: place.stage,
      outcome: place.outcome,
      appliedAt: applied,
      stageEnteredAt: entered,
      rating: place.stage === "sourced" ? null : 2 + (index % 4),
      ...(place.outcome === "rejected"
        ? {
            rejectionReason: REJECTION_NOTES[
              index % REJECTION_NOTES.length
            ] as string,
          }
        : {}),
    });
  });

  return { candidates, applications };
}

/**
 * Sixty more people waiting in the application queue.
 *
 * The queue is where "select everyone matching these" earns its keep, and four
 * people are not enough to need it. These are applicants who have not been
 * screened in, so none of them is on any board. They are made from a formula for
 * the same reason as the pipeline's crowd: the demo reads the same every time.
 */
export type QueueApplicant = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  /** A day between 1 and 18 August. */
  appliedOn: string;
  source: string | null;
};

const QUEUE_SOURCES: (string | null)[] = [
  "Careers page",
  "LinkedIn",
  "WhatsApp",
  null,
  "Careers page",
  "Referral",
];

export function queueCrowd(): QueueApplicant[] {
  if (!DEMO_ENABLED) return [];
  return Array.from({ length: 60 }, (_, index) => {
    const first = FIRST[(index * 3 + 1) % FIRST.length] as string;
    const last = LAST[(index * 5 + 2) % LAST.length] as string;
    const day = 1 + ((index * 11) % 18);
    return {
      firstName: first,
      lastName: `${last}-${pad(index + 1)}`,
      email: `${first}.${last}.q${pad(index + 1)}@mail.com`.toLowerCase(),
      phone:
        index % 4 === 0
          ? null
          : `+234 81${index % 10} ${pad(200 + index, 3)} ${pad(2000 + index * 7, 4)}`,
      appliedOn: `2026-08-${pad(day)}`,
      source: QUEUE_SOURCES[index % QUEUE_SOURCES.length] ?? null,
    };
  });
}
