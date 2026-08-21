/*
 * The demo seed for the hiring module. Still the demo source — see
 * `lib/store/hiring.ts` for what is live and what is not.
 *
 * Employee ids here are `p-NN`, matching `lib/mock/people.ts`. They were
 * `emp-NN` for most of this build, which no record in `people.ts` has, so every
 * `employeeById()` lookup in the hiring screens silently returned undefined and
 * the hiring manager, the recruiter, every interviewer and every scorecard
 * author rendered as "—" or "Unknown". Nothing typed it: `employeeById` returns
 * `Employee | undefined` and every call site handled the undefined properly.
 */
import type {
  Application,
  Candidate,
  Interview,
  PipelineCard,
  Requisition,
  Scorecard,
  StageId,
} from "@/lib/types";
import { STAGE_IDS } from "@/lib/types";

/* ------------------------------------------------------------ Requisitions */

export const REQUISITIONS: Requisition[] = [
  {
    id: "req-01",
    reference: "ENG-114",
    title: "Senior Backend Engineer",
    department: "Engineering",
    location: "Lagos, NG",
    employmentType: "full_time",
    workMode: "hybrid",
    openings: 2,
    status: "open",
    hiringManagerId: "p-01",
    recruiterId: "p-06",
    salaryMin: 1_200_000,
    salaryMax: 1_800_000,
    openedAt: "2026-07-02",
    targetStartDate: "2026-09-15",
    mustHaves: [
      "5+ years building production APIs",
      "Strong Node.js or Go",
      "Has owned a service end to end",
    ],
    niceToHaves: ["Fintech or payroll domain", "Terraform / AWS"],
    screeningQuestions: [
      { id: "q1", question: "Do you have the right to work in Nigeria?", knockout: true },
      { id: "q2", question: "What is your notice period?", knockout: false },
      { id: "q3", question: "Walk us through a service you designed and owned.", knockout: false },
    ],
    activeStages: [...STAGE_IDS],
  },
  {
    id: "req-02",
    reference: "FIN-032",
    title: "Payroll Analyst",
    department: "Finance",
    location: "Lagos, NG",
    employmentType: "full_time",
    workMode: "onsite",
    openings: 1,
    status: "open",
    hiringManagerId: "p-02",
    recruiterId: "p-06",
    salaryMin: 650_000,
    salaryMax: 900_000,
    openedAt: "2026-07-21",
    targetStartDate: "2026-09-01",
    mustHaves: [
      "3+ years running Nigerian payroll",
      "Deep PAYE and pension knowledge",
    ],
    niceToHaves: ["ICAN or ACCA part-qualified"],
    screeningQuestions: [
      { id: "q1", question: "Have you filed PAYE returns with a state IRS?", knockout: true },
      { id: "q2", question: "Largest payroll you have run, by headcount?", knockout: false },
    ],
    activeStages: [...STAGE_IDS],
  },
  {
    id: "req-03",
    reference: "PRD-009",
    title: "Product Designer",
    department: "Product",
    location: "Remote, NG",
    employmentType: "full_time",
    workMode: "remote",
    openings: 1,
    status: "open",
    hiringManagerId: "p-04",
    recruiterId: "p-06",
    salaryMin: 900_000,
    salaryMax: 1_300_000,
    openedAt: "2026-08-04",
    targetStartDate: "2026-10-01",
    mustHaves: ["Portfolio of shipped product work", "Comfortable in Figma"],
    niceToHaves: ["Design systems experience"],
    screeningQuestions: [
      { id: "q1", question: "Share a link to your portfolio.", knockout: true },
    ],
    activeStages: ["sourced", "shortlisted", "interview", "selection"],
  },
  {
    id: "req-04",
    reference: "OPS-051",
    title: "Operations Associate",
    department: "Operations",
    location: "Abuja, NG",
    employmentType: "contract",
    workMode: "onsite",
    openings: 3,
    status: "pending_approval",
    hiringManagerId: "p-02",
    recruiterId: "p-06",
    salaryMin: 400_000,
    salaryMax: 550_000,
    openedAt: "2026-08-16",
    targetStartDate: "2026-09-22",
    mustHaves: ["2+ years in an ops role"],
    niceToHaves: [],
    screeningQuestions: [],
    activeStages: ["sourced", "shortlisted", "interview", "selection"],
  },
];

export const requisitionById = (id: string) =>
  REQUISITIONS.find((r) => r.id === id);

/* --------------------------------------------------------------- Candidates */

export const CANDIDATES: Candidate[] = [
  { id: "c-01", firstName: "Ifeanyi", lastName: "Obi", email: "ifeanyi.obi@mail.com", phone: "+234 803 111 0011", location: "Lagos, NG", currentTitle: "Backend Engineer", currentCompany: "Paystack", yearsExperience: 6, source: "linkedin", expectedSalary: 1_600_000, noticePeriodWeeks: 4, cvFileName: "ifeanyi-obi-cv.pdf", linkedinUrl: "#" },
  { id: "c-02", firstName: "Zainab", lastName: "Yusuf", email: "zainab.yusuf@mail.com", phone: "+234 806 222 0022", location: "Abuja, NG", currentTitle: "Senior Engineer", currentCompany: "Flutterwave", yearsExperience: 7, source: "referral", referredBy: "Chidi Nwosu", expectedSalary: 1_750_000, noticePeriodWeeks: 8, cvFileName: "zainab-yusuf-cv.pdf" },
  { id: "c-03", firstName: "Emeka", lastName: "Anyanwu", email: "emeka.anyanwu@mail.com", phone: "+234 701 333 0033", location: "Lagos, NG", currentTitle: "Software Engineer", currentCompany: "Interswitch", yearsExperience: 4, source: "careers_page", expectedSalary: 1_300_000, noticePeriodWeeks: 4, cvFileName: "emeka-anyanwu-cv.pdf" },
  { id: "c-04", firstName: "Halima", lastName: "Sani", email: "halima.sani@mail.com", phone: "+234 809 444 0044", location: "Kano, NG", currentTitle: "Backend Developer", currentCompany: "Kuda", yearsExperience: 5, source: "sourced", expectedSalary: 1_450_000, noticePeriodWeeks: 2, cvFileName: "halima-sani-cv.pdf" },
  { id: "c-05", firstName: "Oluwaseun", lastName: "Adeyemi", email: "seun.adeyemi@mail.com", phone: "+234 802 555 0055", location: "Ibadan, NG", currentTitle: "Platform Engineer", currentCompany: "Moniepoint", yearsExperience: 8, source: "agency", expectedSalary: 1_900_000, noticePeriodWeeks: 12, cvFileName: "oluwaseun-adeyemi-cv.pdf" },
  { id: "c-06", firstName: "Chiamaka", lastName: "Udo", email: "chiamaka.udo@mail.com", phone: "+234 805 666 0066", location: "Enugu, NG", currentTitle: "Junior Engineer", currentCompany: "Andela", yearsExperience: 2, source: "careers_page", expectedSalary: 900_000, noticePeriodWeeks: 2, cvFileName: "chiamaka-udo-cv.pdf" },
  { id: "c-07", firstName: "Babatunde", lastName: "Lawal", email: "babatunde.lawal@mail.com", phone: "+234 807 777 0077", location: "Lagos, NG", currentTitle: "Payroll Officer", currentCompany: "Dangote Group", yearsExperience: 5, source: "careers_page", expectedSalary: 780_000, noticePeriodWeeks: 4, cvFileName: "babatunde-lawal-cv.pdf" },
  { id: "c-08", firstName: "Grace", lastName: "Effiong", email: "grace.effiong@mail.com", phone: "+234 813 888 0088", location: "Port Harcourt, NG", currentTitle: "Payroll Analyst", currentCompany: "Shell NG", yearsExperience: 6, source: "referral", referredBy: "Tunde Bakare", expectedSalary: 850_000, noticePeriodWeeks: 6, cvFileName: "grace-effiong-cv.pdf" },
  { id: "c-09", firstName: "Musa", lastName: "Ibrahim", email: "musa.ibrahim@mail.com", phone: "+234 810 999 0099", location: "Abuja, NG", currentTitle: "Finance Associate", currentCompany: "Access Bank", yearsExperience: 3, source: "linkedin", expectedSalary: 700_000, noticePeriodWeeks: 4, cvFileName: "musa-ibrahim-cv.pdf" },
  { id: "c-10", firstName: "Temitope", lastName: "Ogundipe", email: "temi.ogundipe@mail.com", phone: "+234 814 121 0121", location: "Remote, NG", currentTitle: "Product Designer", currentCompany: "Cowrywise", yearsExperience: 5, source: "sourced", expectedSalary: 1_200_000, noticePeriodWeeks: 4, cvFileName: "temitope-ogundipe-cv.pdf" },
  { id: "c-11", firstName: "Aisha", lastName: "Mohammed", email: "aisha.mohammed@mail.com", phone: "+234 816 131 0131", location: "Lagos, NG", currentTitle: "Senior Designer", currentCompany: "Piggyvest", yearsExperience: 7, source: "referral", referredBy: "Ngozi Eze", expectedSalary: 1_350_000, noticePeriodWeeks: 8, cvFileName: "aisha-mohammed-cv.pdf" },
  { id: "c-12", firstName: "Daniel", lastName: "Okafor", email: "daniel.okafor@mail.com", phone: "+234 818 141 0141", location: "Lagos, NG", currentTitle: "UI Designer", currentCompany: "Freelance", yearsExperience: 3, source: "careers_page", expectedSalary: 850_000, noticePeriodWeeks: 1, cvFileName: "daniel-okafor-cv.pdf" },
];

export const candidateById = (id: string) =>
  CANDIDATES.find((c) => c.id === id);

/* ------------------------------------------------------------- Applications */

export const APPLICATIONS: Application[] = [
  { id: "app-01", requisitionId: "req-01", candidateId: "c-01", stage: "interview", outcome: "in_progress", appliedAt: "2026-07-08", stageEnteredAt: "2026-08-11", rating: 4 },
  { id: "app-02", requisitionId: "req-01", candidateId: "c-02", stage: "selection", outcome: "in_progress", appliedAt: "2026-07-05", stageEnteredAt: "2026-08-15", rating: 5, offer: { grossMonthly: 1_750_000, startDate: "2026-09-15", status: "pending_approval" } },
  { id: "app-03", requisitionId: "req-01", candidateId: "c-03", stage: "prescreen", outcome: "in_progress", appliedAt: "2026-07-19", stageEnteredAt: "2026-08-14", rating: 3, screeningAnswers: { q1: "Yes", q2: "4 weeks", q3: "Built the settlement service at Interswitch, owned it for two years." } },
  { id: "app-04", requisitionId: "req-01", candidateId: "c-04", stage: "shortlisted", outcome: "in_progress", appliedAt: "2026-08-01", stageEnteredAt: "2026-08-12", rating: 4 },
  { id: "app-05", requisitionId: "req-01", candidateId: "c-05", stage: "sourced", outcome: "in_progress", appliedAt: "2026-08-17", stageEnteredAt: "2026-08-17", rating: null },
  { id: "app-06", requisitionId: "req-01", candidateId: "c-06", stage: "sourced", outcome: "rejected", appliedAt: "2026-07-30", stageEnteredAt: "2026-08-02", rating: 2, rejectionReason: "Below the experience bar for this role" },
  { id: "app-07", requisitionId: "req-02", candidateId: "c-07", stage: "interview", outcome: "in_progress", appliedAt: "2026-07-25", stageEnteredAt: "2026-08-13", rating: 4 },
  { id: "app-08", requisitionId: "req-02", candidateId: "c-08", stage: "selection", outcome: "in_progress", appliedAt: "2026-07-23", stageEnteredAt: "2026-08-16", rating: 5, offer: { grossMonthly: 860_000, startDate: "2026-09-01", status: "sent" } },
  { id: "app-09", requisitionId: "req-02", candidateId: "c-09", stage: "prescreen", outcome: "in_progress", appliedAt: "2026-08-06", stageEnteredAt: "2026-08-16", rating: 3 },
  { id: "app-10", requisitionId: "req-03", candidateId: "c-10", stage: "shortlisted", outcome: "in_progress", appliedAt: "2026-08-07", stageEnteredAt: "2026-08-10", rating: 4 },
  { id: "app-11", requisitionId: "req-03", candidateId: "c-11", stage: "interview", outcome: "in_progress", appliedAt: "2026-08-05", stageEnteredAt: "2026-08-14", rating: 5 },
  { id: "app-12", requisitionId: "req-03", candidateId: "c-12", stage: "sourced", outcome: "in_progress", appliedAt: "2026-08-18", stageEnteredAt: "2026-08-18", rating: null },
];

/* -------------------------------------------------------------- Interviews */

export const INTERVIEWS: Interview[] = [
  { id: "int-01", applicationId: "app-01", kind: "recruiter_screen", scheduledFor: "2026-08-12T10:00:00+01:00", durationMins: 30, interviewerIds: ["p-06"], status: "completed" },
  { id: "int-02", applicationId: "app-01", kind: "technical", scheduledFor: "2026-08-20T14:00:00+01:00", durationMins: 90, interviewerIds: ["p-05", "p-01"], status: "scheduled" },
  { id: "int-03", applicationId: "app-02", kind: "technical", scheduledFor: "2026-08-13T11:00:00+01:00", durationMins: 90, interviewerIds: ["p-05"], status: "completed" },
  { id: "int-04", applicationId: "app-02", kind: "final", scheduledFor: "2026-08-15T15:00:00+01:00", durationMins: 45, interviewerIds: ["p-01"], status: "completed" },
  { id: "int-05", applicationId: "app-07", kind: "panel", scheduledFor: "2026-08-19T09:30:00+01:00", durationMins: 60, interviewerIds: ["p-02", "p-03"], status: "scheduled" },
  { id: "int-06", applicationId: "app-11", kind: "technical", scheduledFor: "2026-08-21T13:00:00+01:00", durationMins: 60, interviewerIds: ["p-04"], status: "scheduled" },
];

/* -------------------------------------------------------------- Scorecards */

export const SCORECARDS: Scorecard[] = [
  {
    id: "sc-01",
    applicationId: "app-01",
    interviewerId: "p-06",
    submittedAt: "2026-08-12T10:45:00+01:00",
    ratings: [
      { competency: "Communication", score: 4 },
      { competency: "Motivation", score: 5 },
      { competency: "Role fit", score: 4 },
    ],
    recommendation: "yes",
    notes: "Clear communicator. Genuinely interested in the payroll domain.",
  },
  {
    id: "sc-02",
    applicationId: "app-02",
    interviewerId: "p-05",
    submittedAt: "2026-08-13T12:30:00+01:00",
    ratings: [
      { competency: "System design", score: 5 },
      { competency: "Code quality", score: 5 },
      { competency: "Debugging", score: 4 },
    ],
    recommendation: "strong_yes",
    notes: "Strongest design discussion we have had this cycle.",
  },
  {
    id: "sc-03",
    applicationId: "app-02",
    interviewerId: "p-01",
    submittedAt: "2026-08-15T15:50:00+01:00",
    ratings: [
      { competency: "Leadership", score: 4 },
      { competency: "Ownership", score: 5 },
    ],
    recommendation: "strong_yes",
    notes: "Ready for a staff track within a year.",
  },
  {
    id: "sc-04",
    applicationId: "app-01",
    interviewerId: "p-05",
    submittedAt: null,
    ratings: [],
    recommendation: null,
    notes: "",
  },
];

/* ------------------------------------------------------------------ Joins  */

export function pipelineCards(requisitionId?: string): PipelineCard[] {
  return APPLICATIONS.filter(
    (a) => !requisitionId || a.requisitionId === requisitionId,
  ).map((a) => ({
    ...a,
    candidate: candidateById(a.candidateId)!,
    requisition: requisitionById(a.requisitionId)!,
    interviews: INTERVIEWS.filter((i) => i.applicationId === a.id),
    scorecards: SCORECARDS.filter((s) => s.applicationId === a.id),
  }));
}

export function cardById(applicationId: string): PipelineCard | undefined {
  return pipelineCards().find((c) => c.id === applicationId);
}

/** Live counts per stage, excluding anyone who has left the pipeline. */
export function stageCounts(requisitionId?: string): Record<StageId, number> {
  const counts = Object.fromEntries(
    STAGE_IDS.map((s) => [s, 0]),
  ) as Record<StageId, number>;
  for (const card of pipelineCards(requisitionId)) {
    if (card.outcome === "in_progress") counts[card.stage] += 1;
  }
  return counts;
}

/** Days since the application entered its current stage. */
export function daysInStage(card: Pick<PipelineCard, "stageEnteredAt">) {
  const then = new Date(card.stageEnteredAt).getTime();
  const now = new Date("2026-08-19").getTime();
  return Math.max(0, Math.round((now - then) / 86_400_000));
}
