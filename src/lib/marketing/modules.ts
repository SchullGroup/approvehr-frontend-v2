/**
 * Module content for the marketing site. Copy lives here rather than inline in
 * JSX so the homepage grid, the platform overview, the nav, the footer and the
 * module pages all quote the product identically — a claim can never drift
 * between two places.
 *
 * ## House style
 *
 * Rewritten against how this category actually reads — PeopleForce, SeamlessHR,
 * PaidHR, NotchHR — after the first pass came back as vague and over-written.
 * The rules that produced that problem, and the ones that replaced them:
 *
 * - **Canonical module names.** Buyers search for "payroll software", "HR
 *   software", "recruitment software". Naming a module `Recruitment` rather than
 *   `Hiring & ATS` costs nothing and matches the words in their head.
 * - **Headline: a benefit, in six words or fewer.** "A smarter way to manage staff",
 *   not "One record per person, and it is always current".
 * - **Blurb: two short sentences, active verbs, no subordinate clauses.** The
 *   old blurbs were 35-word sentences with three commas; correct, and unread.
 * - **Capability detail: one sentence, under 20 words.**
 * - **Name the Nigerian obligation.** PAYE, pension, NHF, NSITF, ITF, PFA,
 *   state IRS. Every competitor does, because it is what the buyer is worried
 *   about. Vagueness here reads as not knowing.
 *
 * Still forbidden, and this has not changed: unverifiable claims. No "save 20
 * hours a week", no "trusted by 500 companies", no invented percentages. The
 * category is full of them and we do not get to use one until it is true and
 * we can show the working.
 */

export type ModuleId =
  | "core-hr"
  | "payroll"
  | "hiring"
  | "time"
  | "performance"
  | "desk";

export type Wash = "indigo" | "green" | "amber" | "blue" | "violet" | "rose";

export type ModuleDef = {
  id: ModuleId;
  label: string;
  /** One line, used on cards and in the platform rail. */
  headline: string;
  /** Two sentences maximum. Says what it does. */
  blurb: string;
  wash: Wash;
  /** Bullets for the module page. Each is a capability, not a benefit. */
  capabilities: { title: string; detail: string }[];
  /** The specific Nigerian obligation this module handles, where it has one. */
  statutory?: string;
};

export const MODULES: ModuleDef[] = [
  {
    id: "core-hr",
    label: "Core HR",
    headline: "A smarter way to manage staff",
    blurb:
      "Every employee record, contract and document in one system, with update access for staff. Changes get routed for approval before they happen.",
    wash: "indigo",
    capabilities: [
      {
        title: "Employee records",
        detail:
          "Personal details, pay history, bank and pension identifiers, next of kin, and every document, sorted and assigned staff by staff.",
      },
      {
        title: "Employee self-service",
        detail:
          "Staff change their own address, bank account and next of kin \u2014 subject to HR approval first.",
      },
      {
        title: "Org structure",
        detail:
          "Departments, reporting lines and multiple entities, built from staff records. An administrator sees every branch at once; a branch manager sees their own.",
      },
      {
        title: "Letters and documents",
        detail:
          "Confirmation letters, contract amendments and references, generated from editable templates.",
      },
    ],
  },
  {
    id: "payroll",
    label: "Payroll",
    headline: "Payroll that knows Nigerian law",
    blurb:
      "Run payroll with PAYE, pension and NHF calculated to current law. Every schedule your state IRS and PFAs ask for comes out of the run itself.",
    wash: "green",
    statutory: "PAYE · Pension · NHF · NSITF · ITF",
    capabilities: [
      {
        title: "Statutory deductions",
        detail:
          "PAYE against current bands, 8% employee and 10% employer pension, and NHF. Reliefs apply in the right order, automatically.",
      },
      {
        title: "Remittance schedules",
        detail:
          "Pension schedules per PFA, PAYE per state IRS, NHF returns. Generated from the run, never rebuilt in Excel.",
      },
      {
        title: "Approval before money moves",
        detail:
          "A run is prepared, reviewed and approved by named people. The payment file only exists after approval.",
      },
      {
        title: "Loans and salary advances",
        detail:
          "Staff loans with repayment schedules that deduct automatically, and earned wage access against salary already worked.",
      },
      {
        title: "Payslips",
        detail:
          "An itemised payslip for every employee, showing gross, each deduction and net. In the app and by email.",
      },
    ],
  },
  {
    id: "hiring",
    label: "Recruitment",
    headline: "From job ad to signed offer",
    blurb:
      "A full applicant tracking system. Post a role, track every application, and collect structured scorecards. An accepted offer becomes an employee record without retyping anything.",
    wash: "amber",
    capabilities: [
      {
        title: "Job applications from your website",
        detail:
          "Published roles get their own public page on your own address. Applications arrive in the pipeline already, with the advert and the source they came from recorded.",
      },
      {
        title: "Pipelines you configure",
        detail:
          "Sourcing, shortlisting, screening, interview, selection. Turn off the stages a junior role does not need.",
      },
      {
        title: "Screening done from your website",
        detail:
          "Ask what disqualifies early — right to work, notice period, salary expectation — and see it on the candidate card.",
      },
      {
        title: "Offers",
        detail:
          "Generate the offer from the approved band, route it for sign-off, and track it to acceptance.",
      },
    ],
  },
  {
    id: "time",
    label: "Time & Leave",
    headline: "Attendance that syncs with payroll",
    blurb:
      "Clock in from the web or a phone. Leave accrues on your own policy, and what attendance records is what payroll pays.",
    wash: "blue",
    statutory: "Nigerian public holidays maintained",
    capabilities: [
      {
        title: "Clock in and out",
        detail:
          "From a browser or a phone, inside registered work locations, so a site team clocks in where they actually are.",
      },
      {
        title: "Leave policies",
        detail:
          "Annual, sick, maternity, paternity and compassionate leave, on your own accrual, carry-over and expiry rules.",
      },
      {
        title: "Approval chains",
        detail:
          "Requests route to the line manager, then HR where policy requires it. Approvers see the team calendar first.",
      },
      {
        title: "Timesheets payroll can use",
        detail:
          "Unpaid absence prorates against your working month, not a 22-day assumption.",
      },
      {
        title: "Overtime, priced and paid",
        detail:
          "Hours past a shift are worked out from the clock, not claimed on a form. Separate weekday, weekend and public-holiday rates, approval before anything is paid, and it lands on the payslip as its own line.",
      },
      {
        title: "Public holidays",
        detail:
          "Nigerian public holidays maintained for you, including the ones announced at short notice.",
      },
    ],
  },
  {
    id: "performance",
    label: "Performance",
    headline: "Trackable objectives and reviews",
    blurb:
      "Set objectives that ladder up to company goals and run review cycles on a schedule. Every rating carries the evidence behind it.",
    wash: "violet",
    capabilities: [
      {
        title: "Clear goal tracking and supervision",
        detail:
          "Company goals flow down to teams and individuals, so any KPI traces back to what it serves.",
      },
      {
        title: "Review cycles",
        detail:
          "Self, manager and peer review on a schedule you set, with reminders that go out without you chasing.",
      },
      {
        title: "What an appraisal is made of",
        detail:
          "Four parts, ready to use on day one: core competencies, behavioural competencies, key result areas, and leadership for anyone who manages people. Rename or reweight any of them.",
      },
      {
        title: "Appraisal questions you set",
        detail:
          "Build the form per cycle. Each question asks self, manager, peer or direct report \u2014 or all four \u2014 and peer answers are anonymous in the data, not just on the screen.",
      },
      {
        title: "KPI measuring",
        detail:
          "Define the KPIs that matter per role and weight them. Scores stay comparable across a department.",
      },
      {
        title: "Calibration",
        detail:
          "See rating distribution across teams before publishing, so one lenient manager cannot skew a cycle.",
      },
    ],
  },
  {
    id: "desk",
    label: "Employee Support",
    headline: "Every HR question in one queue",
    blurb:
      "Staff raise a request instead of messaging four people. Tickets carry owners and response targets, and the answers become a knowledge base.",
    wash: "rose",
    capabilities: [
      {
        title: "Ticketing",
        detail:
          "Categorised requests with an owner, a due time and the whole thread in one place, attachments included.",
      },
      {
        title: "Response targets",
        detail:
          "Set what each category should be answered within, and see what is breaching before the employee chases.",
      },
      {
        title: "Knowledge base",
        detail:
          "Publish the answers people ask for repeatedly, so the queue shrinks as headcount grows.",
      },
    ],
  },
];

export const moduleById = (id: ModuleId) => MODULES.find((m) => m.id === id)!;

export const WASH_CLASS: Record<Wash, string> = {
  indigo: "bg-wash-indigo",
  green: "bg-wash-green",
  amber: "bg-wash-amber",
  blue: "bg-wash-blue",
  violet: "bg-wash-violet",
  rose: "bg-wash-rose",
};

export const CHIP_CLASS: Record<Wash, string> = {
  indigo: "bg-accent text-white",
  green: "bg-success-strong text-white",
  amber: "bg-warning text-slate",
  blue: "bg-info text-white",
  violet: "bg-[#7c5cd6] text-white",
  rose: "bg-danger text-white",
};
