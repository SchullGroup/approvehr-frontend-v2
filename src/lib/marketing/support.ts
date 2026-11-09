import { COMPANY } from "./legal";

/**
 * The support page.
 *
 * It exists because the App Store listing needs a Support URL that opens on a
 * real page with a real way to get in touch. Copy lives here, not inline in the
 * JSX, for the reason the legal pages' copy does: the page repeats facts the
 * privacy policy states (who creates an account, what the app asks the phone
 * for, where a privacy request goes), and a claim must not be able to drift
 * between the two.
 *
 * The rule is the legal pages' rule: **nothing is claimed that is not true.**
 * So there is no response time, no opening hours, no phone number, no chat and
 * no promise about how a message is handled, because none of those has been
 * agreed or built. If one is, add it here, and nowhere else.
 */

/** A link inside a sentence. `mailto:` and site paths both work as `href`. */
export type SupportLink = { href: string; text: string };

/** A paragraph: plain text, or text with links in it. */
export type SupportPara = string | (string | SupportLink)[];

export type SupportSection = {
  /** Anchor id. */
  id: string;
  heading: string;
  /** Paragraphs, rendered in order. */
  body: SupportPara[];
  /** Optional bullets, rendered after the paragraphs. */
  list?: string[];
  /** Optional closing paragraph, rendered after the bullets. */
  after?: SupportPara;
};

export const SUPPORT = {
  title: "Support",
  description: `How to get help with ApproveHR: who to ask first, what to put in a message to ${COMPANY.supportEmail}, and where mobile app and privacy questions go.`,
  heading: "How to get help with ApproveHR",
  standfirst:
    "Write to us at the address below. For a question about your own account, leave, payslip or approvals, your company's HR team is usually the quickest first step, because your company set up your account and holds the records in it.",
  contact: {
    label: "Email support",
    note: "For a problem you cannot solve, or something in ApproveHR that looks wrong.",
  },
  sections: [
    {
      id: "your-company-first",
      heading: "Start with your own company",
      body: [
        "ApproveHR is set up by your employer. Accounts are created by the company, not by the person who uses them, and the records inside an account (your leave balance, your payslip, who approves what) are your company's to manage.",
        "So for a question about your account, signing in, a leave request, a payslip or an approval, ask your company's HR team or ApproveHR administrator first. If they cannot help, or it looks like a fault in ApproveHR itself, write to us and say so.",
      ],
    },
    {
      id: "what-to-include",
      heading: "What to put in your message",
      body: ["The more of this you send, the less we have to ask you for."],
      list: [
        "Your company's name.",
        "The work email address you sign in with.",
        "What you were doing, what you expected to happen, and what happened instead. If the screen showed a message, copy it word for word.",
        "If it is about the mobile app: your iPhone model, the iOS version and the version of the app.",
      ],
      after:
        "Please do not put your password, a one-time code, a full bank account number or payslip figures in a message. If you send a screenshot, crop out pay figures and anyone else's personal details first.",
    },
    {
      id: "mobile-app",
      heading: "The ApproveHR app for iPhone",
      body: [
        "The app is another way into the same account you have on the web. Your employer creates your account, and you cannot sign up for one from the app.",
      ],
      list: [
        "Cannot sign in: check with your company's HR team or administrator that there is an account for the work email address you are using. If there is one and the app still will not let you in, write to us with the details above.",
        "Clocking in and location: the app asks your iPhone for your location only while it is open, when you tap Clock in. You can change your answer in your iPhone's Settings. Whether a clock-in without a location is accepted is decided by your company's rules, so ask your HR team about a clock-in that was refused.",
        "Notifications: the app asks for permission from a button, and you can switch notifications off in your iPhone's Settings. The Account tab in the app has a button that takes you there.",
        "Wellness: the Wellness features are optional. If something in them is not working, write to us.",
      ],
      after: [
        "What the app collects, why, and who can see it is set out in the ",
        { href: "/privacy#mobile-app", text: "privacy policy" },
        ", under The mobile app.",
      ],
    },
    {
      id: "privacy-requests",
      heading: "Privacy requests",
      body: [
        [
          "To ask for a copy of your data, to have it corrected or erased, or to withdraw a consent, write to ",
          {
            href: `mailto:${COMPANY.privacyEmail}`,
            text: COMPANY.privacyEmail,
          },
          " instead. The ",
          { href: "/privacy#your-rights", text: "privacy policy" },
          " explains your rights and how to use them.",
        ],
      ],
    },
  ] satisfies SupportSection[],
};

/** Where the "elsewhere on this site" links go. */
export const SUPPORT_LINKS: { href: string; label: string; note: string }[] = [
  {
    href: "/privacy",
    label: "Privacy policy",
    note: "What ApproveHR collects on the web and in the app, and your rights over it.",
  },
  {
    href: "/demo",
    label: "Book a demo",
    note: "Thinking about ApproveHR for your own company? Start here.",
  },
];
