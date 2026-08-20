/**
 * Legal and trust pages.
 *
 * These four documents were 404ing from the footer, which broke the site's own
 * rule about never linking at a page that isn't there. Copy lives here rather
 * than inline in JSX for the same reason module copy does: the privacy policy,
 * the DPA and the security page all describe the same practices, and a claim
 * must not be able to drift between two of them.
 *
 * Two hard rules, inherited from the rest of this project:
 *
 * 1. **Nothing is claimed that isn't true.** There is no SOC 2 report, no ISO
 *    27001 certificate and no penetration test to point at, so the security
 *    page says exactly that instead of implying otherwise. If one of those
 *    lands, add it here and nowhere else.
 * 2. **These are drafts, and say so.** They describe practices honestly, but
 *    they have not been through Nigerian counsel. `LEGAL_STATUS` renders that
 *    on every page — delete that one constant when the executed versions land,
 *    and all four pages stop saying it at once.
 */

export type LegalDocId = "privacy" | "terms" | "security" | "dpa";

export type LegalSection = {
  /** Anchor id, also used by the on-page contents list. */
  id: string;
  heading: string;
  /** Paragraphs. Rendered in order. */
  body?: string[];
  /** Optional bullets, rendered after the paragraphs. */
  list?: string[];
  /** Optional definition rows, for "what we collect / why" style tables. */
  rows?: { term: string; detail: string }[];
};

export type LegalDoc = {
  id: LegalDocId;
  /** Footer/nav label. */
  label: string;
  title: string;
  /** Page metadata description. */
  description: string;
  /** One paragraph under the h1, in the brand's plain register. */
  standfirst: string;
  updated: string;
  /** Extra line in the status box, where this document needs one. */
  statusNote?: string;
  sections: LegalSection[];
};

/** The registered entity behind the product. Quoted identically everywhere. */
export const COMPANY = {
  legalName: "Schull Technologies Limited",
  product: "ApproveHR",
  city: "Lagos",
  country: "Nigeria",
  privacyEmail: "privacy@approvehr.io",
  legalEmail: "legal@approvehr.io",
  securityEmail: "security@approvehr.io",
} as const;

/**
 * Shown on every legal page. One constant so the disclosure can never appear on
 * three pages and be forgotten on the fourth — and so removing it is a one-line
 * change once counsel has signed the executed versions.
 */
export const LEGAL_STATUS =
  "This is our working draft, published early so you can read it before we ask " +
  "you to agree to anything. It has not yet been reviewed by Nigerian counsel, " +
  "and the executed version attached to an order form is the one that governs. " +
  "Tell us if something here would not work for you — it is easier to change now.";

/* -------------------------------------------------------------------------- */
/* Privacy                                                                    */
/* -------------------------------------------------------------------------- */

const PRIVACY: LegalDoc = {
  id: "privacy",
  label: "Privacy policy",
  title: "Privacy policy",
  description:
    "What ApproveHR collects, why we hold it, how long we keep it and the rights you have over it under the Nigeria Data Protection Act 2023.",
  standfirst:
    "We hold payroll and employment records, which is about the most sensitive data a company keeps. This page says plainly what we do with it. Where the law gives you a right, we have written down how to use it rather than telling you to contact us and hoping you do not.",
  updated: "20 August 2026",
  sections: [
    {
      id: "who-we-are",
      heading: "Who is responsible for your data",
      body: [
        `${COMPANY.product} is operated by ${COMPANY.legalName}, registered in ${COMPANY.country} and based in ${COMPANY.city}. We are the data controller for the account and billing information of the company that subscribes, and for the visitors of this website.`,
        "For the employee records inside the product we are a data processor, not a controller. Your employer decides what goes in and how long it stays; we act on their instructions. If you are an employee asking about your own record, your employer's HR team is the right first stop — but write to us anyway if they cannot help, and we will tell you what we hold.",
      ],
    },
    {
      id: "what-we-collect",
      heading: "What we collect",
      rows: [
        {
          term: "Account data",
          detail:
            "Name, work email, role and company name for each person you invite into the product. Needed to sign someone in and to record who approved what.",
        },
        {
          term: "Employee records",
          detail:
            "Whatever your company puts in: names, contact details, job and pay history, bank details for payment, pension PINs, tax identification numbers, NHF numbers, leave balances, documents you upload. Held on your instruction, not ours.",
        },
        {
          term: "Payroll output",
          detail:
            "Calculated gross, PAYE, pension, NHF and net figures, payslips, and the statutory schedules generated for your state IRS, PFAs and the FMBN.",
        },
        {
          term: "Usage data",
          detail:
            "Which pages were opened, when, and from which browser and IP address. Used to keep the service working and to investigate suspicious sign-ins. Not sold, not used to build a profile of you.",
        },
        {
          term: "Website data",
          detail:
            "If you fill in the demo form: your name, work email, company, headcount and whatever you type in the message box. Used to prepare the call.",
        },
      ],
    },
    {
      id: "why",
      heading: "Why we are allowed to hold it",
      body: [
        "Section 25 of the Nigeria Data Protection Act 2023 requires a lawful basis for every processing activity. Ours are:",
      ],
      list: [
        "Performance of a contract — running the service your company pays for, including calculating and paying salaries.",
        "Compliance with a legal obligation — retaining payroll records for the periods Nigerian tax and pension law require, and producing the returns those laws require.",
        "Legitimate interest — keeping the service secure, preventing fraud, and understanding which parts of the product are used so we know what to fix. We do not rely on legitimate interest for anything a reasonable person would object to.",
        "Consent — the demo form and any marketing email. Withdrawable at any time, with no effect on the service itself.",
      ],
    },
    {
      id: "sharing",
      heading: "Who else sees it",
      body: [
        "We do not sell personal data, and we do not share it for anyone else's advertising. It leaves our systems in four situations only:",
      ],
      list: [
        "Infrastructure providers who host and back up the service, under written contracts that bind them to the same obligations we carry.",
        "Statutory bodies, where you have asked us to file on your behalf — the relevant state internal revenue service, your employees' pension fund administrators, and the Federal Mortgage Bank of Nigeria for NHF. Only what the filing requires.",
        "Payment providers, where you use the product to pay salaries and they need the account details to move the money.",
        "A lawful request from a court or regulator with authority over us. We will tell you it happened unless we are legally barred from doing so.",
      ],
    },
    {
      id: "transfers",
      heading: "Whether it leaves Nigeria",
      body: [
        "Part VIII of the NDPA restricts moving personal data out of Nigeria. Where a provider we depend on stores data outside the country, we rely on the conditions the Act allows and record which provider, which country and which condition in our processing register. That register is available to any customer who asks, and to the Nigeria Data Protection Commission.",
        "If keeping all of your data resident in Nigeria is a requirement for you, say so before you sign — it is a configuration question, not a negotiation, and we would rather answer it up front.",
      ],
    },
    {
      id: "retention",
      heading: "How long we keep it",
      body: [
        "Employment and payroll records are legal documents, so the product is built to archive rather than delete — a past payslip has to keep resolving years later, and an approval trail with a hole in it is worse than useless.",
        "Account data is kept while your subscription is live. On termination we return or delete your data within 30 days of your written instruction, except where Nigerian tax, pension or company law requires us to retain a copy for longer, in which case we keep only what the law requires and only for as long as it requires it. Demo-form submissions are deleted after 12 months if you do not become a customer.",
      ],
    },
    {
      id: "your-rights",
      heading: "Your rights, and how to actually use them",
      body: [
        "Under the NDPA you may ask for a copy of your data, have it corrected, have it erased, restrict or object to how it is used, take it elsewhere in a portable form, or withdraw a consent you gave.",
        `Write to ${COMPANY.privacyEmail} with enough detail to find your record. We will acknowledge within 5 working days and respond within 30 days. We do not charge for this. If we refuse, we will tell you why and what your options are.`,
        "You can also complain directly to the Nigeria Data Protection Commission. Talking to us first is faster, but it is not a precondition, and we will not treat you differently for going to the regulator.",
      ],
    },
    {
      id: "cookies",
      heading: "Cookies",
      body: [
        "This website sets no advertising or tracking cookies, and no third-party analytics runs on it. The product sets one cookie to keep you signed in. That is the whole list — which is why there is no consent banner in your way.",
      ],
    },
    {
      id: "changes",
      heading: "Changes to this policy",
      body: [
        "We will post the new version here with a new date, and email account administrators at least 30 days before anything that materially reduces your rights takes effect. We will not make a change retroactive.",
      ],
    },
  ],
};

/* -------------------------------------------------------------------------- */
/* Terms                                                                      */
/* -------------------------------------------------------------------------- */

const TERMS: LegalDoc = {
  id: "terms",
  label: "Terms of service",
  title: "Terms of service",
  description:
    "The terms on which Nigerian companies subscribe to ApproveHR — fees, uptime, statutory responsibility, liability and how either side ends the agreement.",
  standfirst:
    "Written to be read once, in order, without a lawyer beside you. Where a term is genuinely in our favour, it says so rather than hiding in a subclause.",
  updated: "20 August 2026",
  sections: [
    {
      id: "agreement",
      heading: "What this covers",
      body: [
        `These terms govern your company's use of ${COMPANY.product}. "You" means the company named on the order form; "we" means ${COMPANY.legalName}. Where an order form and these terms disagree, the order form wins.`,
        "An individual employee using the product under their employer's account is bound by these terms through their employer, and does not separately owe us fees.",
      ],
    },
    {
      id: "subscription",
      heading: "Subscription, fees and VAT",
      body: [
        "Pricing is per active employee per month, in Naira, at the tier on your order form. An employee counts as active in a month if they are on a payroll run in that month; an archived record does not count.",
        "Invoices are issued in advance of the period and payable within 14 days. Nigerian VAT at the prevailing rate is added where applicable. We will give 60 days' written notice before any price increase, and it will not take effect inside a term you have already paid for.",
        "If an invoice is more than 30 days overdue we may suspend access after written notice. We will not delete data during a suspension, and we will not withhold a payroll run that is already in progress — cutting off a company mid-cycle punishes its employees, not its finance team.",
      ],
    },
    {
      id: "your-obligations",
      heading: "What you are responsible for",
      list: [
        "The accuracy of what you put in. We calculate on the figures you give us; a wrong salary, tax identification number or pension PIN produces a wrong result, correctly calculated.",
        "Keeping credentials under control, and removing access for people who leave.",
        "Having the right to hold the employee data you upload, and telling your employees that you use us to process it.",
        "Your own statutory filings and payments. See the section below — this one matters.",
      ],
    },
    {
      id: "statutory",
      heading: "Statutory responsibility stays with you",
      body: [
        "The product computes PAYE, pension and NHF against the Personal Income Tax Act, the Pension Reform Act 2014 and the NHF Act, and generates the schedules your state internal revenue service, pension fund administrators and the FMBN expect. We maintain those calculations against changes in the law and will tell you when a change affects your numbers.",
        "But you remain the employer, and the statutory obligation to deduct, remit and file is yours. We are a tool you use to meet it, not a party that assumes it. If a figure looks wrong to you, do not remit it — tell us, and we will work it through with you and show our working.",
        "Nothing in the product is tax advice, and nothing on this website is either.",
      ],
    },
    {
      id: "availability",
      heading: "Availability",
      body: [
        "We target 99.5% monthly availability outside announced maintenance, and we announce maintenance at least 48 hours ahead, scheduled away from month-end where we possibly can — the days around payroll are the days you cannot afford us to be down.",
        "Where an order form includes a service credit for missed availability, that credit is your remedy for downtime. We are not offering a credit we have no measurement to support: if availability reporting matters to you commercially, ask for it in the order form and we will agree how it is measured before you sign.",
      ],
    },
    {
      id: "your-data",
      heading: "Your data stays yours",
      body: [
        "You own everything you put in. We claim no licence over it beyond what running the service requires, and we do not use your employee data to train models.",
        "You can export your data at any time while the subscription is live, in a format you can actually use elsewhere. We will not hold an export hostage over a commercial dispute.",
        "How we handle it as processor is set out in the data processing agreement and in the privacy policy, both linked in the footer of every page.",
      ],
    },
    {
      id: "acceptable-use",
      heading: "Acceptable use",
      list: [
        "Do not use the product to process data you have no right to hold.",
        "Do not attempt to access another company's tenant, probe our infrastructure without written permission, or resell access without agreement.",
        "Do not upload malware, or use the product to send unlawful communications.",
        "Security research is welcome — see the security page for how to report something rather than testing production and hoping.",
      ],
    },
    {
      id: "liability",
      heading: "Liability, stated plainly",
      body: [
        "Each side is liable to the other for direct loss, capped at the fees paid in the 12 months before the claim. Neither side is liable for indirect or consequential loss, or for loss of profit or goodwill.",
        "Two things are outside that cap, in both directions: liability that cannot lawfully be limited, including death or personal injury caused by negligence, and liability for fraud.",
        "The cap is genuinely in our favour and we are not pretending otherwise. It is the same shape every SaaS contract of this size carries, and it is why the statutory-responsibility section above is worth reading twice.",
      ],
    },
    {
      id: "term",
      heading: "Ending the agreement",
      body: [
        "Either side may end the subscription at the close of the current term with 30 days' written notice. Either side may end it immediately for a material breach the other has not fixed within 30 days of being told about it.",
        "On termination we will give you an export and then return or delete your data within 30 days of your instruction, subject to the retention the law requires of us. We do not charge an exit fee, and we do not charge for the export.",
      ],
    },
    {
      id: "law",
      heading: "Governing law",
      body: [
        `These terms are governed by the laws of the Federal Republic of ${COMPANY.country}. We will try in good faith to resolve a dispute between ourselves first. Failing that, the courts of ${COMPANY.city} State have jurisdiction, unless the order form provides for arbitration instead.`,
      ],
    },
  ],
};

/* -------------------------------------------------------------------------- */
/* Security                                                                   */
/* -------------------------------------------------------------------------- */

const SECURITY: LegalDoc = {
  id: "security",
  label: "Security",
  title: "Security",
  description:
    "How ApproveHR protects payroll and employment data — and an honest list of the assurances we do not yet have.",
  standfirst:
    "Most security pages are a wall of badges. We do not have badges yet, so this page is a description of what we actually do and a list of what we have not done. You can compare it to a competitor's page and draw your own conclusions.",
  updated: "20 August 2026",
  statusNote:
    "The controls below describe how the service is operated. If you are evaluating us and need one of them evidenced rather than asserted, ask — we would rather show you than have you take a web page's word for it.",
  sections: [
    {
      id: "not-yet",
      heading: "What we do not have",
      body: [
        "Starting here, because every other security page buries it.",
      ],
      list: [
        "No SOC 2 Type II report. We have not been audited.",
        "No ISO 27001 certificate.",
        "No third-party penetration test report to share yet.",
        "No published bug bounty programme — though we will respond to anything you report, see below.",
        "No 24/7 staffed security operations centre. We are a small team in Lagos and we will not pretend to be a large one.",
      ],
    },
    {
      id: "why-say-it",
      heading: "Why we say so",
      body: [
        "If we implied an audit we have not had, you would find out during your own procurement review, and everything else we told you would be worth less. A company choosing where to put its payroll data deserves to know what it is actually buying.",
        "Where an assurance matters to you and we do not have it, tell us during the evaluation. Some of these are on our roadmap and a customer asking moves them up it.",
      ],
    },
    {
      id: "what-we-do",
      heading: "What we do do",
      rows: [
        {
          term: "Encryption",
          detail:
            "TLS 1.2 or better in transit. Encryption at rest for the database and for backups, including document uploads.",
        },
        {
          term: "Tenant separation",
          detail:
            "Every query is scoped to one company. A user has no route to another tenant's records, and this is enforced in the data layer rather than only in the interface.",
        },
        {
          term: "Access control inside the product",
          detail:
            "Role-based permissions, so a line manager sees their team and not the whole payroll. Every approval and every change to a record is written to an audit trail with who, what and when.",
        },
        {
          term: "Access control inside our team",
          detail:
            "Production access is limited to the engineers who need it, requires multi-factor authentication, and is logged. We do not browse customer data, and support access to a tenant is requested and recorded.",
        },
        {
          term: "Backups",
          detail:
            "Automated daily, retained 30 days, restore-tested. An untested backup is a hope, not a control.",
        },
        {
          term: "Change management",
          detail:
            "Code review on every change. The Nigerian statutory calculations additionally carry a verification suite of hand-worked expected values that must pass before a release ships — a plausible-looking payroll figure is a defect here, not a rounding difference.",
        },
        {
          term: "Dependencies",
          detail:
            "Automated vulnerability scanning on our dependencies, with security patches prioritised over feature work.",
        },
      ],
    },
    {
      id: "breach",
      heading: "If something goes wrong",
      body: [
        "The NDPA requires notification to the Nigeria Data Protection Commission within 72 hours of becoming aware of a personal data breach. We will meet that, and we will tell affected customers directly within the same window rather than waiting for the regulator to do it for us.",
        "You will get what we know, what we do not yet know, what we have done and what you need to do — even where that reflects badly on us. A notification that omits the cause is not a notification.",
      ],
    },
    {
      id: "report",
      heading: "Reporting a vulnerability",
      body: [
        `Write to ${COMPANY.securityEmail} with enough detail to reproduce it. We will acknowledge within 2 working days and keep you updated until it is closed.`,
        "We will not pursue legal action against anyone who reports a genuine issue in good faith, does not access or modify other people's data, and gives us a reasonable window before publishing. Please do not test against production tenants — ask us for an environment.",
      ],
    },
  ],
};

/* -------------------------------------------------------------------------- */
/* DPA                                                                        */
/* -------------------------------------------------------------------------- */

const DPA: LegalDoc = {
  id: "dpa",
  label: "Data processing",
  title: "Data processing agreement",
  description:
    "The processor terms under which ApproveHR handles employee data on your instruction, written against the Nigeria Data Protection Act 2023.",
  standfirst:
    "Your employees' records are yours; we hold them on your instruction. This is the agreement that says so in the terms the NDPA requires, and it forms part of your subscription without you having to ask for it.",
  updated: "20 August 2026",
  sections: [
    {
      id: "roles",
      heading: "Who is controller and who is processor",
      body: [
        `For employee and payroll data in the product, you are the data controller and ${COMPANY.legalName} is the data processor. You decide what is collected, why, and for how long. We process only on your documented instruction — your configuration of the product and your written requests are that instruction.`,
        "If we ever believe an instruction of yours would breach the NDPA, we will tell you rather than quietly carrying it out.",
      ],
    },
    {
      id: "scope",
      heading: "Scope of the processing",
      rows: [
        {
          term: "Subject matter",
          detail:
            "Provision of HR, payroll, hiring and approval software, and the statutory calculations and filings it generates.",
        },
        {
          term: "Duration",
          detail:
            "For as long as your subscription runs, plus the return-or-delete window on termination.",
        },
        {
          term: "Categories of data subject",
          detail:
            "Your employees, contractors, job applicants, and the people your staff nominate as next of kin or emergency contacts.",
        },
        {
          term: "Categories of personal data",
          detail:
            "Identity and contact details, employment and pay data, bank details, tax identification numbers, pension PINs, NHF numbers, leave and attendance records, performance records, uploaded documents, and applicant CVs.",
        },
        {
          term: "Sensitive personal data",
          detail:
            "Only where you choose to record it — for example medical evidence supporting sick leave, or disability information supporting an accommodation. We do not require any of it to run payroll.",
        },
      ],
    },
    {
      id: "our-obligations",
      heading: "What we commit to",
      list: [
        "Process only on your instruction, and for no purpose of our own.",
        "Keep the technical and organisational measures described on the security page, and not materially weaken them during your subscription.",
        "Bind everyone with access to a duty of confidentiality that survives them leaving.",
        "Help you respond to a data subject's request within the NDPA's timescales, and pass any request that reaches us directly on to you rather than answering it ourselves.",
        "Notify you of a personal data breach without undue delay and in any event within 72 hours of becoming aware of it.",
        "Assist with a data protection impact assessment where the processing warrants one.",
        "Return or delete your data on termination, on your instruction, within 30 days — except the minimum the law obliges us to retain.",
      ],
    },
    {
      id: "sub-processors",
      heading: "Sub-processors",
      body: [
        "We use sub-processors for hosting, backup, email delivery and payment execution. Each is under a written contract carrying the same obligations we carry to you, and we remain liable to you for what they do.",
        "The current list, with what each one does and where it stores data, is available on request and will be published here once it is stable. We will give you 30 days' notice before adding one. If you reasonably object on data protection grounds, you may end the affected part of the subscription without penalty — that is a real right, not a formality.",
      ],
    },
    {
      id: "transfers",
      heading: "International transfers",
      body: [
        "Where a sub-processor stores data outside Nigeria, we rely on the conditions in Part VIII of the NDPA and record the basis for each transfer. Nigeria-only residency is available on request; ask before signing so we can confirm what it costs and what it rules out.",
      ],
    },
    {
      id: "audit",
      heading: "Audit",
      body: [
        "You may audit our compliance with this agreement once in any 12-month period, on 30 days' notice, at your cost, without disrupting other customers. In practice most questions are answered faster by a documentation review, and we will answer a security questionnaire without charging you for it.",
        "We have no third-party audit report to hand you instead — the security page says so directly.",
      ],
    },
    {
      id: "contact",
      heading: "Contact",
      body: [
        `Data protection questions: ${COMPANY.privacyEmail}. Contractual questions: ${COMPANY.legalEmail}. A signed counterpart of this agreement is available on request if your procurement process needs one on file.`,
      ],
    },
  ],
};

/* -------------------------------------------------------------------------- */

export const LEGAL_DOCS: Record<LegalDocId, LegalDoc> = {
  privacy: PRIVACY,
  terms: TERMS,
  security: SECURITY,
  dpa: DPA,
};

/** Footer "Legal" column, derived so a new document appears there automatically. */
export const LEGAL_LINKS: [string, string][] = (
  Object.keys(LEGAL_DOCS) as LegalDocId[]
).map((id) => [`/${id}`, LEGAL_DOCS[id].label]);
