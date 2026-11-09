/**
 * Legal and trust pages.
 *
 * These four documents were 404ing from the footer, which broke the site's own
 * rule about never linking at a page that isn't there. Copy lives here rather
 * than inline in JSX for the same reason module copy does: the privacy policy,
 * the DPA and the security page all describe the same practices, and a claim
 * must not be able to drift between two of them.
 *
 * The one hard rule, inherited from the rest of this project: **nothing is
 * claimed that isn't true.** There is no SOC 2 report, no ISO 27001 certificate
 * and no penetration test to point at, so the security page says exactly that
 * instead of implying otherwise. If one of those lands, add it here and nowhere
 * else — and if a claim here is ever found to be unsupported (checked against
 * what actually runs, not against what would be reassuring), fix the claim
 * rather than hope nobody checks.
 *
 * These carried a "working draft, not yet reviewed by Nigerian counsel" notice
 * from launch until 2026-09-08, when they were confirmed final and that notice
 * was removed. If a new draft round ever starts, reinstate a status disclosure
 * rather than leaving a page silently unclear about what governs.
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
  supportEmail: "support@approvehr.io",
  privacyEmail: "privacy@approvehr.io",
  legalEmail: "legal@approvehr.io",
  securityEmail: "security@approvehr.io",
} as const;

/* -------------------------------------------------------------------------- */
/* Privacy                                                                    */
/* -------------------------------------------------------------------------- */

const PRIVACY: LegalDoc = {
  id: "privacy",
  label: "Privacy policy",
  title: "Privacy policy",
  description:
    "What ApproveHR collects on the web and in the mobile app, why we hold it, who can see it, how long we keep it and the rights you have over it under the Nigeria Data Protection Act 2023.",
  standfirst:
    "We hold payroll and employment records, which is about the most sensitive data a company keeps. This page says plainly what we do with it. Where the law gives you a right, we have written down how to use it rather than telling you to contact us and hoping you do not.",
  updated: "8 November 2026",
  statusNote:
    "What changed on 8 November 2026: this page now covers the ApproveHR mobile app, your location when you clock in, the optional Wellness features (water and steps, break reminders, challenges and kudos), the weekly delivery report, the app-open mark and notifications. For each it says what is stored and who can and cannot see it.",
  sections: [
    {
      id: "who-we-are",
      heading: "Who is responsible for your data",
      body: [
        `${COMPANY.product} is operated by ${COMPANY.legalName}, registered in ${COMPANY.country} and based in ${COMPANY.city}. We are the data controller for the account and billing information of the company that subscribes, and for the visitors of this website.`,
        "For the employee records inside the product we are a data processor, not a controller. Your employer decides what goes in and how long it stays; we act on their instructions. If you are an employee asking about your own record, your employer's HR team is the right first stop, but write to us anyway if they cannot help, and we will tell you what we hold.",
        "The optional Wellness features described below are the exception. What you log there is yours to keep or delete, and your employer cannot read it.",
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
          term: "Clock-in location",
          detail:
            "If you share your location when you clock in, from the app or a browser: your latitude and longitude, how precise your device says that reading is, and your distance from the workplace. Saved with that day's attendance record. Never collected in the background. Details under Your location when you clock in.",
        },
        {
          term: "Wellness records",
          detail:
            "Only if you turn the optional Wellness features on, one purpose at a time: the water and steps you log, or send from your phone's health app, your break reminder settings, the challenges you join and the team you join them with, and a record of what you agreed to and when. Held for you, not for your employer, who cannot read it.",
        },
        {
          term: "Kudos",
          detail:
            "The thanks you send or receive: who it is from and to, the message, whether it is shared with the company or private, and the date.",
        },
        {
          term: "App-open mark",
          detail:
            "Only if your company has switched on app-use measurement: one record per person per day saying your account opened ApproveHR that day, on the web or in the app. Details under Whether you opened the app.",
        },
        {
          term: "Notification address",
          detail:
            "Only if you allow notifications: the push token the app is given for your phone, or the push address your browser gives us, whether the phone is an iPhone or an Android, and when it was registered and last used.",
        },
        {
          term: "Website data",
          detail:
            "If you fill in the demo form: your name, work email, company, headcount and whatever you type in the message box. Used to prepare the call.",
        },
      ],
    },
    {
      id: "mobile-app",
      heading: "The mobile app",
      body: [
        "ApproveHR has an app for iPhone and Android. It is for the employees of companies that use ApproveHR, and it is another way into the same account you have on the web, not a separate product with records of its own. Your employer creates your account. You cannot sign up for one, or delete one, from the app.",
        "Everything the app sends goes to our servers. The only other company it deals with is the notification service described under Notifications, and only if you allow notifications. There is no advertising, analytics or crash-reporting software in the app, it does not read your phone's advertising identifier, and it does not follow you into other apps or websites.",
        "It asks your phone for three permissions, each when you reach the feature that needs it. You can refuse any of them, or switch one off later in your phone's settings, and the rest of the app still works. The one thing a refusal can change is clocking in at a workplace your company has fenced, where your company's rules decide whether a clock-in without a location is accepted.",
      ],
      list: [
        "Your location, only while the app is open and only when you tap Clock in.",
        "Your daily step count from Apple Health or Android's Health Connect, read only, and only if you turn on step sync.",
        "Notifications, which the app asks for from a button, not when it starts.",
      ],
    },
    {
      id: "on-your-phone",
      heading: "What the app keeps on your phone",
      rows: [
        {
          term: "Sign-in",
          detail:
            "A long-lived sign-in token, kept in the phone's secure storage. On an iPhone it can be read only while the phone is unlocked, is left out of backups and never moves to another phone. The short-lived token that does the work is held in memory and never written down.",
        },
        {
          term: "Step sync note",
          detail:
            "If you use step sync: whether it is on for this phone, the last day it worked, and whether you have asked it to stop. No step figures.",
        },
        {
          term: "Notification token",
          detail:
            "If you allowed notifications: the token the app was given for your phone, kept so the app can take the phone off our list when you sign out.",
        },
        {
          term: "Break reminders",
          detail:
            "If you saved break reminders and the app is the one delivering them: your phone's own notification system holds the next few days of them. Each is a fixed line or the name you gave a break.",
        },
        {
          term: "Everything else",
          detail:
            "The app does not save your pay, steps, water, kudos or anyone's name on the phone. A screen holds what it shows in memory while you use it. Like any app, your phone may keep a picture of the last screen for its app switcher.",
        },
        {
          term: "Signing out",
          detail:
            "Wipes all of the above, whether or not the phone can reach our servers at that moment. If it can, the app first tells our servers to stop sending notifications to this phone.",
        },
      ],
    },
    {
      id: "location",
      heading: "Your location when you clock in",
      body: [
        "When you clock in, the app and the web can check that you are at your workplace. The app shows a plain explanation first, then asks your phone for your location only while the app is open, and reads it once, at the moment you tap Clock in. It never reads your location in the background and never follows you. A browser works the same way: it asks when you press the button, and asks for nothing when the page loads.",
        "What is sent is your latitude and longitude and how precise your device says that reading is. Our server compares it with the workplace your company set up and accepts or refuses the clock-in. If it accepts, the position, the stated precision and your distance from the workplace are saved with that day's attendance record. A clock-in that is refused saves nothing.",
        "No screen or report in the product shows the saved position to your employer, a manager or HR. It is kept as part of the record of that clock-in, so that what let it through can be looked at later, and it stays with the attendance record it belongs to. There is no separate, shorter period for it.",
        "If you refuse to share your location, the app sends the clock-in without one, and your company's rules decide whether that is accepted.",
      ],
    },
    {
      id: "wellness",
      heading: "Wellness: water and steps",
      body: [
        "Wellness is a set of optional features that your company can switch on: logging water and steps, break reminders, challenges and kudos. Until your company switches it on, none of it exists for you. Once it is on, nothing about your water or steps is stored until you agree to it, and you agree to each purpose on a screen of its own, with nothing ticked in advance.",
        "There are two purposes. Tracking lets us store the water and steps you choose to log, so that you can see your own history. Step sync, which can be turned on only from the phone app, also lets the app send your daily step total from Apple Health or Health Connect, and needs tracking first. The words you agree to come from our server and each version is numbered, so we can show what you agreed to and when. We keep that record, and you are the only one who can read it.",
        "For step sync the app reads your daily step total and nothing else. It is read only: the app cannot write to your health app, it does not read water or anything else, and it does not read in the background. It sends recent days' totals (up to 31 days back) when you tap Sync now, when you open the app (at most every 15 minutes) and once when you turn it on, and only for days where your phone has a figure that differs from the one we hold. A day with no figure is never sent as zero. A total from your phone counts for that day instead of steps you typed for the same day.",
        "Through the product, your entries, your daily totals, your consents and your reminder settings can be read by you alone: not by your manager, not by HR, not by an administrator, and not by our staff, whose admin console hides these records. The only place a total of yours is shown by name is the board of an individual challenge you choose to join (see Challenges). Nothing you log is used for advertising or marketing, and no report builder or assistant in the product can read it. These records are protected by access controls in the product, not by a separate encryption key, so anyone with direct access to the database could read them. Access to production is limited as the security page describes.",
        "You can stop either purpose at any time, from the app's Account tab or from the web. Each time you are asked whether to keep what was logged (it stays, and only you can see it) or delete it, and neither answer is chosen for you. Stopping tracking also takes you out of every challenge and stops step sync. Stopping step sync alone does not take you out of a challenge, and totals already sent keep counting there unless you delete them or leave. You can delete single entries, or everything you logged, whenever you like, even if your company has since switched Wellness off.",
        "In the app, stopping step sync switches it off on the phone first and tells our server second. If the phone cannot reach us, it tells us the next time it opens, and our server refuses step totals once you have withdrawn. To stop Apple Health or Health Connect sharing steps with the app at all, change that in your phone's own settings as well.",
      ],
    },
    {
      id: "reminders",
      heading: "Break reminders",
      body: [
        "Break reminders do not need either consent. You can save your own (how often, and named breaks with a start time and a length) or use the ones your company sets. Your own settings are stored on our server and nobody else can see them, including whether you turned reminders off.",
        "A reminder reaches you in one of two ways, never both. Either our server sends it as a notification, where you have allowed notifications, once per slot, only while you are at work (clocked in, where your company records attendance, otherwise inside your working hours on a working day that is not a holiday or approved leave) and only if you or your company saved reminders. Or the app on your phone schedules the next few days of reminders itself from your saved settings, and nothing about them is sent to us.",
        "A reminder is a fixed line, or the name you gave a break, never a figure. Our server keeps a bare note that a reminder was sent at a given minute, with no content and no record of whether you opened it, and deletes it after two days. Nobody at your company can see whether you received or opened a reminder.",
      ],
    },
    {
      id: "challenges",
      heading: "Challenges",
      body: [
        "A challenge is a set of dates in which the people who join add up water or steps. Your company's administrators create them. Joining is your choice, needs tracking to be on, and happens on a screen that shows the exact words you agree to, including who will see what and which privacy floor applies. Only entries from the day you join count. You can leave at any time and you drop off every board at once. Stopping tracking takes you out of every challenge.",
        "In an individual challenge, everybody who has joined sees a board with the names and totals of everybody who has joined, and that includes your manager or HR if they choose to join too. In a team challenge you choose one team when you join, even if you belong to only one. Participants see the teams, with how many people took part and each team's total and average, and no other person's figure: you see your own. A team below the floor is not listed, except that you are shown your own team, marked as held back, with the reason. A team where too few people have logged anything is also held back, with no figure.",
        "The total on a board runs from the day you joined, and it counts your entries whichever way they arrived, typed or sent from your phone.",
        "The privacy floor is the smallest number of people a figure may be made from. It is at least 3, your company can set it higher (up to 50), and each person is told the floor when they join. Results for a challenge use the highest floor anyone in it joined under, so lowering the setting later cannot expose somebody who agreed to a larger group.",
        "The floor is a safeguard for small groups, not a guarantee. In a very small team, a change in the team's result can let a teammate guess a figure, and the join screen for a team challenge says so.",
      ],
    },
    {
      id: "kudos",
      heading: "Kudos",
      body: [
        "Kudos is a short message of thanks, up to 500 characters, to a colleague who still works at your company. Each time, you choose whether it is shared with the company or private. A shared kudos goes on the company feed, where everybody signed in at your company can read the message, who it is from and to, and the date. A private kudos can be read only by the person who sent it and the person who received it: not by an administrator, not by HR, and not by our staff, whose admin console hides it.",
        "The person who sent a kudos can delete it, shared or private. An administrator can take down a shared one. Deleting one removes it for both people and removes the notification that carried it. A kudos you receive appears in your notifications under the sender's name, and a private one never shows its message there.",
        "To find a colleague to thank, the app sends what you type to our server, which searches your company's directory. The app does not read your phone's contacts. There is no points system and no leaderboard, and kudos does not depend on the wellness consents.",
      ],
    },
    {
      id: "delivery-report",
      heading: "The weekly delivery report",
      body: [
        "Each week, ApproveHR can show how many tasks people logged against their objectives and how those tasks were graded (done, partly done, not done or rejected), with a delivery rate. It is built from the tasks people already log. It is work data, not wellness data, so it does not ask for the wellness consents. It is shown only where your company has Wellness switched on.",
        "Everyone sees their own week. A line manager also sees the names of their direct reports with the same figures, and the head of a department sees the people in it. Anyone who can edit employee records, which in practice means HR, sees everybody in the company, with a count of how many people logged nothing that week. People are listed by name, not ranked.",
        "A manager or HR could already read the same tasks one at a time. The report is a summary of that access and adds no new access.",
      ],
    },
    {
      id: "app-open",
      heading: "Whether you opened the app",
      body: [
        "If your company has switched on app-use measurement, which is off until it does, ApproveHR records once per person per day that your account opened ApproveHR that day, on the web or in the app. The record holds your account, the company's calendar day and the time the record was created. It holds no device, no screen, nothing you did and no count of opens. The app reports each time it comes back to the front and the web reports once a day, and a second open on the same day changes nothing.",
        "It exists so that your company can see how many of its people use ApproveHR each week. The only thing an administrator can read is a company-wide total: the share of people who opened it in a week, the share who opened it on three or more days, and the typical number of days. It appears only when at least 3 people are counted, it carries no names and no cut by team or department, and no screen lists a person's days. Apple's App Store rules would call a count like this analytics, so we call it that too.",
      ],
    },
    {
      id: "employer-view",
      heading: "What your employer can and cannot see",
      body: [
        "In short: nothing you log about your body, and no figure made from fewer people than the floor. In detail:",
      ],
      rows: [
        {
          term: "Your water and steps",
          detail:
            "Nobody at your company can see your entries or daily totals, your consents or your reminder settings. That includes your manager, HR and every administrator.",
        },
        {
          term: "Whether you joined a challenge",
          detail:
            "The other people in an individual challenge see your name on its board. Administrators see only how many people took part, and only once at least the floor have joined. A manager or HR who joins an individual challenge is a participant like any other and sees its board.",
        },
        {
          term: "Challenge results",
          detail:
            "Administrators see, once at least the floor have joined, how many took part, and a week after the challenge ends, its total and average, once at least the floor have logged something. For a team challenge they see one row per team at or above the floor and no overall count. They never see a person's figure.",
        },
        {
          term: "App use",
          detail:
            "Administrators see a company-wide total only, never a person's days. See Whether you opened the app.",
        },
        {
          term: "The weekly delivery report",
          detail:
            "Managers and HR see the people they lead, or everyone, as described under The weekly delivery report. It is work data, not wellness data.",
        },
        {
          term: "Kudos",
          detail:
            "A shared kudos is on the company feed for everyone at your company, and an administrator can take it down. A private kudos is visible to its two people and nobody else.",
        },
        {
          term: "Where you clocked in",
          detail: "No screen shows the saved position to your employer.",
        },
        {
          term: "What administrators can change",
          detail:
            "They can switch Wellness and app-use measurement on or off, set the floor, create and cancel challenges, set the company's reminder defaults and take down a shared kudos. Those changes are recorded in the audit trail. Who joined or tracked anything is never recorded there. By administrators we mean people who hold the permission to manage company settings, which the HR manager role and the owner have by default.",
        },
      ],
    },
    {
      id: "notifications",
      heading: "Notifications",
      body: [
        "When notifications are switched on for the app and you allow them on your phone, ApproveHR can send you the same notifications that appear in your notification list: approvals waiting, leave decisions, kudos, break reminders and so on. A phone notification is a headline and a link, and nothing else. It has no body text, because the services that carry it, Expo's push service and Apple or Google behind it, can read it. The headline can say what happened and sometimes to whom, for example that someone recognised you or that a leave request is waiting. No notification we send carries a water or step figure. Tapping one opens a screen in the app, and if the link points somewhere the app has no screen for, it opens Today.",
        "To send one, our server stores your phone's push token (a code that identifies the phone to the notification service, not you), whether it is an iPhone or an Android, and when it was registered and last used. It keeps at most ten phones per account. If a different person signs in on the same phone, the token moves to them, so the last person's notifications do not follow the phone. Signing out of the app takes the phone off our list first, and a token the notification service says no longer exists is marked and not used again.",
        "In a browser the same applies, with the push address your browser gives us in place of a phone token, and a browser notification can carry a short line of text as well as the headline. You can turn notifications off in your phone's or your browser's settings. The app's Account tab has a button that takes you to the phone's.",
      ],
    },
    {
      id: "why",
      heading: "Why we are allowed to hold it",
      body: [
        "Section 25 of the Nigeria Data Protection Act 2023 requires a lawful basis for every processing activity. Ours are:",
      ],
      list: [
        "Performance of a contract, running the service your company pays for, including calculating and paying salaries.",
        "Compliance with a legal obligation, retaining payroll records for the periods Nigerian tax and pension law require, and producing the returns those laws require.",
        "Legitimate interest, keeping the service secure, preventing fraud, and understanding which parts of the product are used so we know what to fix. We do not rely on legitimate interest for anything a reasonable person would object to.",
        "Consent, the demo form, any marketing email, and the optional Wellness features, which store nothing about your water or steps until you agree. Withdrawable at any time, with no effect on the rest of the service.",
      ],
    },
    {
      id: "sharing",
      heading: "Who else sees it",
      body: [
        "We do not sell personal data, and we do not share it for anyone else's advertising. It leaves our systems in five situations only:",
      ],
      list: [
        "Infrastructure providers who host and back up the service, under written contracts that bind them to the same obligations we carry.",
        "Notification services, if you allow notifications: Expo's push service, and Apple or Google behind it, receive your phone's push token and the headline and link of each notification. Nothing else, and never a body. See Notifications.",
        "Statutory bodies, where you have asked us to file on your behalf, the relevant state internal revenue service, your employees' pension fund administrators, and the Federal Mortgage Bank of Nigeria for NHF. Only what the filing requires.",
        "Payment providers, where you use the product to pay salaries and they need the account details to move the money.",
        "A lawful request from a court or regulator with authority over us. We will tell you it happened unless we are legally barred from doing so.",
      ],
    },
    {
      id: "transfers",
      heading: "Whether it leaves Nigeria",
      body: [
        "Part VIII of the NDPA restricts moving personal data out of Nigeria. Where a provider we depend on stores data outside the country, we rely on the conditions the Act allows and record which provider, which country and which condition in our processing register. That register is available to any customer who asks, and to the Nigeria Data Protection Commission.",
        "If keeping all of your data resident in Nigeria is a requirement for you, say so before you sign, it is a configuration question, not a negotiation, and we would rather answer it up front.",
        "The notification services named under Notifications are run by companies based outside Nigeria. What they receive is a push token and a notification headline with its link.",
      ],
    },
    {
      id: "retention",
      heading: "How long we keep it",
      body: [
        "Employment and payroll records are legal documents, so the product is built to archive rather than delete, a past payslip has to keep resolving years later, and an approval trail with a hole in it is worse than useless.",
        "Account data is kept while your subscription is live. On termination we return or delete your data within 30 days of your written instruction, except where Nigerian tax, pension or company law requires us to retain a copy for longer, in which case we keep only what the law requires and only for as long as it requires it. Demo-form submissions are deleted after 12 months if you do not become a customer.",
        "Wellness records are kept until you delete them, and go if your employer deletes your staff record. Withdrawing a consent asks whether to delete them straight away. If someone leaves and their record is archived rather than deleted, their wellness records stay until the record is deleted, though they drop off every board at once.",
        "A kudos stays until the person who sent it deletes it, or an administrator takes down a shared one, or the staff record is deleted. A clock-in's saved position stays with its attendance record, and each day's app-open mark stays until the account is deleted. Neither has a shorter period of its own. The bare note that a break reminder was sent is deleted after two days, and a phone's push token is removed when you sign out of the app on it, provided the phone can reach us at that moment.",
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
        "This website sets no advertising or tracking cookies, and no third-party analytics runs on it. Staying signed in works through your browser's own local storage, not a cookie. There is nothing here that needs your consent to run, which is why there is no banner in your way.",
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
    "The terms on which Nigerian companies subscribe to ApproveHR, fees, uptime, statutory responsibility, liability and how either side ends the agreement.",
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
        "If an invoice is more than 30 days overdue we may suspend access after written notice. We will not delete data during a suspension, and we will not withhold a payroll run that is already in progress, cutting off a company mid-cycle punishes its employees, not its finance team.",
      ],
    },
    {
      id: "your-obligations",
      heading: "What you are responsible for",
      list: [
        "The accuracy of what you put in. We calculate on the figures you give us; a wrong salary, tax identification number or pension PIN produces a wrong result, correctly calculated.",
        "Keeping credentials under control, and removing access for people who leave.",
        "Having the right to hold the employee data you upload, and telling your employees that you use us to process it.",
        "Your own statutory filings and payments. See the section below, this one matters.",
      ],
    },
    {
      id: "statutory",
      heading: "Statutory responsibility stays with you",
      body: [
        "The product computes PAYE, pension and NHF against the Personal Income Tax Act, the Pension Reform Act 2014 and the NHF Act, and generates the schedules your state internal revenue service, pension fund administrators and the FMBN expect. We maintain those calculations against changes in the law and will tell you when a change affects your numbers.",
        "But you remain the employer, and the statutory obligation to deduct, remit and file is yours. We are a tool you use to meet it, not a party that assumes it. If a figure looks wrong to you, do not remit it, tell us, and we will work it through with you and show our working.",
        "Nothing in the product is tax advice, and nothing on this website is either.",
      ],
    },
    {
      id: "availability",
      heading: "Availability",
      body: [
        "We target 99.5% monthly availability outside announced maintenance, and we announce maintenance at least 48 hours ahead, scheduled away from month-end where we possibly can, the days around payroll are the days you cannot afford us to be down.",
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
        "Security research is welcome, see the security page for how to report something rather than testing production and hoping.",
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
    "How ApproveHR protects payroll and employment data, and an honest list of the assurances we do not yet have.",
  standfirst:
    "Most security pages are a wall of badges. We do not have badges yet, so this page is a description of what we actually do and a list of what we have not done. You can compare it to a competitor's page and draw your own conclusions.",
  updated: "20 August 2026",
  statusNote:
    "The controls below describe how the service is operated. If you are evaluating us and need one of them evidenced rather than asserted, ask, we would rather show you than have you take a web page's word for it.",
  sections: [
    {
      id: "not-yet",
      heading: "What we do not have",
      body: ["Starting here, because every other security page buries it."],
      list: [
        "No SOC 2 Type II report. We have not been audited.",
        "No ISO 27001 certificate.",
        "No third-party penetration test report to share yet.",
        "No published bug bounty programme, though we will respond to anything you report, see below.",
        "No 24/7 staffed security operations centre. We are a small team in Lagos and we will not pretend to be a large one.",
        "No automated dependency vulnerability scanning yet. Dependencies are updated by hand, not flagged by a scanner.",
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
            "Code review on every change. The Nigerian statutory calculations additionally carry a verification suite of hand-worked expected values that must pass before a release ships, a plausible-looking payroll figure is a defect here, not a rounding difference.",
        },
        {
          term: "Drafting suggestions",
          detail:
            "The performance module can draft text a person then edits, an objective, a progress note, a development area. A third-party language model writes the draft, and it is sent only the short list of facts shown on screen beside the suggestion. Nothing it returns is written to a record: a suggestion becomes data when somebody edits it and submits it themselves, and not before. Where no assistant is connected the button is simply absent.",
        },
      ],
    },
    {
      id: "breach",
      heading: "If something goes wrong",
      body: [
        "The NDPA requires notification to the Nigeria Data Protection Commission within 72 hours of becoming aware of a personal data breach. We will meet that, and we will tell affected customers directly within the same window rather than waiting for the regulator to do it for us.",
        "You will get what we know, what we do not yet know, what we have done and what you need to do, even where that reflects badly on us. A notification that omits the cause is not a notification.",
      ],
    },
    {
      id: "report",
      heading: "Reporting a vulnerability",
      body: [
        `Write to ${COMPANY.securityEmail} with enough detail to reproduce it. We will acknowledge within 2 working days and keep you updated until it is closed.`,
        "We will not pursue legal action against anyone who reports a genuine issue in good faith, does not access or modify other people's data, and gives us a reasonable window before publishing. Please do not test against production tenants, ask us for an environment.",
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
        `For employee and payroll data in the product, you are the data controller and ${COMPANY.legalName} is the data processor. You decide what is collected, why, and for how long. We process only on your documented instruction, your configuration of the product and your written requests are that instruction.`,
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
            "Only where you choose to record it, for example medical evidence supporting sick leave, or disability information supporting an accommodation. We do not require any of it to run payroll.",
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
        "Return or delete your data on termination, on your instruction, within 30 days, except the minimum the law obliges us to retain.",
      ],
    },
    {
      id: "sub-processors",
      heading: "Sub-processors",
      body: [
        "Each of these is under a written contract carrying the same obligations we carry to you, and we remain liable to you for what they do. We will give you 30 days' notice before adding one. If you reasonably object on data protection grounds, you may end the affected part of the subscription without penalty, that is a real right, not a formality.",
      ],
      rows: [
        {
          term: "Amazon Web Services",
          detail:
            "Hosting, the database and backups. This is where your data lives: the application, the Postgres database and its 30 days of backups all run in AWS, in the United States (us-east-1). Everything in the product passes through it.",
        },
        {
          term: "Resend",
          detail:
            "Email delivery, and the first provider tried. Receives the recipient's name and address and the contents of the message, which for a notification includes the subject of it, such as whose review is outstanding. United States.",
        },
        {
          term: "Amazon SES",
          detail:
            "Email delivery, used when Resend is unavailable or refuses a message. Receives the same as Resend. United States (us-east-1).",
        },
        {
          term: "Google",
          detail:
            "Suggested objectives, progress notes and development areas, through the Gemini API, and only where your company has switched suggestions on. Receives the facts a suggestion is built from: goal text and measures, the headline somebody typed, or competency names with their scores and the appraiser's written note. It is not sent names, staff numbers, salaries or any identifier, and nothing it returns is saved without somebody editing and submitting it themselves.",
        },
        {
          term: "Anthropic",
          detail:
            "The same role as Google, and an alternative to it, one or the other answers, never both. Receives the same facts under the same limits.",
        },
        {
          term: "9jaPay",
          detail:
            "Payment execution, and only for a company that has connected it. Receives the payee's name, bank and account number and the amount, for the salaries in a batch you have approved. Nigeria.",
        },
        {
          term: "Monnify",
          detail:
            "Provisions the dedicated virtual account your company funds its payroll wallet from. Opening it requires a BVN, which passes through to Monnify to open the account and is not written to our own database, logged, or returned by us afterwards. Nigeria.",
        },
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
        "We have no third-party audit report to hand you instead, the security page says so directly.",
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
