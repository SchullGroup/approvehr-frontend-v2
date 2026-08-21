import type { Metadata } from "next";
import {
  Banknote,
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  Landmark,
  Plug,
  ShieldCheck,
  Timer,
  Webhook,
  Users,
} from "lucide-react";
import { LinkCard } from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { EMPLOYEES } from "@/lib/mock/people";

export const metadata: Metadata = {
  title: "Settings",
  description: "Company, payroll, people and access configuration.",
};

const GROUPS = [
  {
    heading: "Company",
    items: [
      {
        href: "/settings/payroll",
        title: "Payroll",
        description:
          "Working month, salary structure, pension and NHF rates, and the checks that stop payroll.",
        icon: <Banknote aria-hidden="true" />,
      },
      {
        href: "/settings/company",
        title: "Company profile",
        description:
          "Legal entities, RC numbers, registered addresses and tax states.",
        icon: <Building2 aria-hidden="true" />,
      },
      {
        href: "/settings/leave",
        title: "Leave policies",
        description:
          "Entitlements, accrual, carry-over and the public holiday calendar.",
        icon: <CalendarDays aria-hidden="true" />,
      },
      {
        href: "/settings/bank-accounts",
        title: "Bank accounts",
        description:
          "The accounts salaries are paid from. One is the default for a payment run.",
        icon: <Landmark aria-hidden="true" />,
      },
      {
        href: "/settings/overtime",
        title: "Overtime",
        description:
          "Whether overtime is paid, from how many minutes, and the weekday, weekend and public-holiday rates.",
        icon: <Timer aria-hidden="true" />,
      },
    ],
  },
  {
    heading: "Access",
    items: [
      {
        href: "/settings/roles",
        title: "Roles and permissions",
        description:
          "Who can see salaries, approve payroll, or export employee data.",
        icon: <ShieldCheck aria-hidden="true" />,
      },
      {
        href: "/people",
        title: "Users",
        description: `${EMPLOYEES.length} people have access to this workspace.`,
        icon: <Users aria-hidden="true" />,
      },
    ],
  },
  {
    heading: "Connections",
    items: [
      {
        href: "/settings/notifications",
        title: "Notifications",
        description:
          "What triggers an email, and who receives approval reminders.",
        icon: <Bell aria-hidden="true" />,
      },
      {
        href: "/settings/integrations",
        title: "Integrations",
        description:
          "Accounting, biometric devices and single sign-on.",
        icon: <Plug aria-hidden="true" />,
      },
      {
        href: "/settings/knowledge",
        title: "Knowledge base",
        description:
          "Write and publish help articles, and see the searches that found nothing.",
        icon: <BookOpen aria-hidden="true" />,
      },
      {
        href: "/settings/webhooks",
        title: "Webhooks",
        description:
          "We POST signed JSON to a URL you control. The one integration that needs nobody else's credential.",
        icon: <Webhook aria-hidden="true" />,
      },
    ],
  },
];

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Everything that changes how the product behaves for your company."
      />
      <PageBody className="flex flex-col gap-10">
        {GROUPS.map((group) => (
          <section key={group.heading}>
            <h2 className="mb-4 text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-muted">
              {group.heading}
            </h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {group.items.map((item) => (
                <LinkCard
                  key={item.title}
                  href={item.href}
                  title={item.title}
                  description={item.description}
                  icon={item.icon}
                />
              ))}
            </div>
          </section>
        ))}
      </PageBody>
    </>
  );
}
