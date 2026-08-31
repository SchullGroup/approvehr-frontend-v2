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
 * - **Headline: a benefit, in six words or fewer.** "Your people, in one place",
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
 *
 * ## The drafting suggestions, and why the copy is written the way it is
 *
 * Performance is the one module where the product generates text
 * (`modules/ai/` in the API; `lib/api/ai.ts` and
 * `components/performance/suggestions.tsx` here). It drafts three things a
 * person then edits, and nothing else. It does not score, rank, decide, predict
 * or analyse anybody.
 *
 * So the copy names the three, and then spends more words on the limits than on
 * the capability — because the limits are what is actually different about it,
 * and because "AI-powered" was flagged on this site once already, when there was
 * no AI anywhere in the codebase. Every line in `limits` below is a property of
 * the code, not an aspiration:
 *
 * - nothing saved → `modules/ai/service.ts` takes a `TenantDb` and issues no
 *   write with it; there is no accept-suggestion endpoint;
 * - says what it was based on → `Suggestion.groundedIn` is required, and
 *   `SuggestionPanel` renders the facts verbatim behind a reveal;
 * - no figure on a measure → the prompt forbids targets and `Measures` renders
 *   none;
 * - no gap, no suggestion → `suggestDevelopment` refuses somebody at or above
 *   target rather than inventing a weakness.
 *
 * Nothing about accuracy, hours saved or adoption. None of it is measured.
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
  /**
   * The module's name, and the only place it is written.
   *
   * It is also the heading the **signed-in app's sidebar** files its screens
   * under: `MODULE_ITEMS` in components/portal/nav.tsx imports `MODULES` and
   * reads this, keyed by `id`. So renaming a module here renames it in the
   * product too, which is the point — the sidebar used to say Hiring / People /
   * Pay / Grow, four headings against these six names, and a customer who
   * bought "Time & Leave" signed in to find no such thing.
   */
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
  /**
   * What a module deliberately will not do, stated on its own page.
   *
   * Optional, and currently carried by Performance alone — see the drafting
   * note in the header. It exists because a capability bullet is one sentence
   * and some claims are only honest with their limits attached in the same
   * breath. If you add one to another module, the same rule applies: every
   * point has to be a property of the code somebody could go and read.
   */
  limits?: { heading: string; lead: string; points: string[] };
};

export const MODULES: ModuleDef[] = [
  {
    id: "core-hr",
    label: "Core HR",
    headline: "Your people, in one place",
    blurb:
      "Every employee record, contract and document in one system. Staff update their own details, and changes route for approval before they land.",
    wash: "indigo",
    capabilities: [
      {
        title: "Employee records",
        detail:
          "Personal details, pay history, bank and pension identifiers, next of kin, and every document, attached to the person, not a folder.",
      },
      {
        title: "Employee self-service",
        detail:
          "Staff change their own address, bank account and next of kin. Sensitive fields go to HR for approval first.",
      },
      {
        title: "Org structure",
        detail:
          "Departments, reporting lines and multiple entities. The chart is generated from the records, so it cannot go stale.",
      },
      {
        title: "Letters and documents",
        detail:
          "Confirmation letters, contract amendments and references, generated from templates that fill themselves in.",
      },
    ],
  },
  {
    id: "payroll",
    label: "Payroll",
    headline: "Payroll that knows Nigerian law",
    blurb:
      "Process payroll with PAYE, pension and NHF calculated to current law. Every schedule your state IRS and PFAs ask for is generated automatically.",
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
          "Pension schedules per PFA, PAYE per state IRS, NHF returns. Generated automatically, never rebuilt in Excel.",
      },
      {
        title: "Approval before money moves",
        detail:
          "Every payroll is prepared, reviewed and approved by named people. The payment file only exists after approval.",
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
      "Post a role, track every application, and collect structured data. An accepted offer becomes an employee record without retyping anything.",
    wash: "amber",
    capabilities: [
      {
        title: "Requisitions with approval",
        detail:
          "A role opens with a band, a headcount and a hiring team, approved by the budget holder before it goes live.",
      },
      {
        title: "Pipelines you configure",
        detail:
          "Sourcing, shortlisting, screening, interview, selection. Turn off the stages a junior role does not need.",
      },
      {
        title: "Screening from your website",
        detail:
          "Knockout questions and structured scorecards happen on the same application, no separate spreadsheet.",
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
          "From a browser or a phone, with work locations so a site team clocks in where they actually are.",
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
          "Unpaid absence prorates against your working month, not a 22-day assumption borrowed from somewhere else.",
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
    /* The one AI mention outside the module page's own section. "Assisted", and
       attached to *drafting* rather than to reviews — this blurb is quoted in
       five places, so an over-reaching word here becomes an AI claim over the
       homepage grid and the platform rail as well. */
    blurb:
      "Set objectives that ladder up to company goals and run review cycles on a schedule. AI-assisted drafting where a blank page slows people down, and every rating carries the evidence behind it.",
    wash: "violet",
    capabilities: [
      {
        title: "Clear goal tracking and supervision",
        detail:
          "Company goals flow down to teams and individuals, so any objective traces back to what it serves.",
      },
      {
        title: "Review cycles",
        detail:
          "Self, manager and peer review on a schedule you set, with reminders that go out without you chasing.",
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
      {
        /* "AI-assisted drafting", not "AI-powered performance reviews".
           The second claims the AI does the reviewing, and it does not — it
           drafts one field a person then edits. The distinction is the whole of
           what makes this claim defensible when somebody asks what the AI
           actually does. */
        title: "AI-assisted drafting",
        detail:
          "Ask for a draft objective under a company goal, or development areas behind a competency scored below target. A language model writes it; you edit it before anything is saved.",
      },
    ],
    limits: {
      heading: "What the drafting will not do",
      lead: "Three fields offer a draft, an objective under a company goal, a progress note from a headline you typed, and development areas behind a competency scored below its target. A language model writes it. You decide whether any of it survives.",
      points: [
        "Nothing it writes is saved. Every suggestion lands in a field you edit and submit yourself.",
        "It says what it was based on, and the exact facts it was given are one click away.",
        "It puts no figure on a suggested measure. The target is yours to set.",
        "It never rates anybody and never writes about what a person is like. It has competency scores; the judgement stays the manager's.",
        "Where somebody is at or above target on everything, it says there is no gap rather than inventing one.",
      ],
    },
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
