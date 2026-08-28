"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronDown, ChevronLeft, Menu, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/brand/logo";
import { Avatar, Badge, MoneyPrivacyToggle } from "@/components/ui";
import { CommandPalette } from "./command-palette";
import { GuidedTour, openTour } from "./tour/guided-tour";
import { NAV, visibleNav, type BadgeSource, type NavGroup } from "./nav";
import { SessionRoleBadge } from "./role-badge";
import { hasAnyPermission, useIsManager, usePermissions } from "@/lib/permissions";
import { useFeatures } from "@/lib/store/features";
import { useUnreadCount } from "@/lib/store/notifications";
import { useApprovalStore } from "@/lib/store/approvals";
import { useLeaveStore } from "@/lib/store/leave";
import { useAttendanceStore } from "@/lib/store/attendance";
import { useEmployeeStore } from "@/lib/store/employees";
import { rosterFor } from "@/lib/workflows/attendance";
import { TODAY } from "@/lib/today";
import { buildApprovalQueue } from "@/lib/workflows/queue";
import { APPROVE_PERMISSIONS } from "@/app/(app)/approvals/inbox";
import { useSession } from "@/lib/store/session";
import { VerificationBanner } from "./verification-banner";

/**
 * The app shell. The sidebar is a light surface rather than a saturated slab:
 * navigation is chrome, and chrome should not compete with the data it frames.
 * The active route is marked with a soft accent tint plus aria-current, so the
 * position is available to assistive technology and not only to the eye.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = usePathname();
  const badges = useNavBadges();

  /* The `/` shortcut the search button's own `kbd` promises. Ignored while
     already typing somewhere — a `/` in a note or an amount must reach the
     field it was typed into, not hijack the page out from under it. */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (typing) return;
      event.preventDefault();
      setSearchOpen(true);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  /* The sidebar is filtered by who is looking and what the company turned on.
     Both hooks answer from a cache after first load, so this is not a request
     per render — see their headers. */
  const { permissions } = usePermissions();
  const features = useFeatures();
  const groups = useMemo(
    () => visibleNav(NAV, permissions, features),
    [permissions, features],
  );

  const nav = (
    <SidebarNav
      groups={groups}
      pathname={pathname}
      badges={badges}
      onNavigate={() => setOpen(false)}
    />
  );

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      {/* Top bar */}
      <header className="no-print sticky top-0 z-30 border-b border-line bg-surface">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-5">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="portal-nav"
            aria-label={open ? "Close navigation" : "Open navigation"}
            data-tour="nav-toggle"
            className="rounded-md p-2 text-ink hover:bg-canvas lg:hidden"
          >
            {open ? (
              <X aria-hidden="true" className="size-5" />
            ) : (
              <Menu aria-hidden="true" className="size-5" />
            )}
          </button>

          <Link
            href="/dashboard"
            aria-label="ApproveHR home"
            className="text-ink hover:opacity-80"
          >
            <Logo size={24} />
          </Link>

          <CompanySwitcher />

          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            data-tour="search"
            className={cn(
              "ml-auto hidden items-center gap-2 rounded-md border border-line bg-canvas",
              "px-3 py-1.5 text-body-sm text-muted transition-colors",
              "hover:border-control-line hover:text-body md:flex md:w-64",
            )}
          >
            <Search aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="flex-1 text-left">Search people, roles…</span>
            <kbd className="rounded-xs border border-line bg-surface px-1.5 py-0.5 text-meta text-faint">
              /
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-1.5 md:ml-0">
            {/* Hides every money figure on every screen, in one click. Here
                rather than on each table because the value of the control is
                that nothing is left showing: a per-table icon would mean a
                directory of two hundred salaries needed two hundred clicks, and
                the row somebody forgot is the one that matters. It hides; what
                decides who may *know* a salary is `VIEW_SALARIES` on the
                server, which does not send the number at all. */}
            <MoneyPrivacyToggle />

            {/* Was a button that did nothing, labelled "3 unread" whatever the
                truth was. Now a link to the inbox with the real count — the
                dot is absent when there is nothing to see, because a
                permanent alert is not an alert. */}
            <Link
              href="/notifications"
              aria-label={
                badges.unreadNotifications > 0
                  ? `Notifications, ${badges.unreadNotifications} unread`
                  : "Notifications"
              }
              className="relative rounded-md p-2 text-muted transition-colors hover:bg-canvas hover:text-ink"
            >
              <Bell aria-hidden="true" className="size-4" />
              {badges.unreadNotifications > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-danger ring-2 ring-surface"
                />
              )}
            </Link>

            <UserMenu />
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside
          data-tour="nav"
          className="no-print sidebar-surface hidden w-60 shrink-0 border-r border-line lg:block"
        >
          <div className="scrollbar-slim sticky top-14 max-h-[calc(100dvh-3.5rem)] overflow-y-auto px-3 py-4">
            {nav}
          </div>
        </aside>

        {/* Mobile drawer */}
        {open && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div
              className="absolute inset-0 bg-ink/40"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <div
              id="portal-nav"
              className="sidebar-surface absolute inset-y-0 left-0 w-72 overflow-y-auto px-3 py-4 shadow-xl"
            >
              {nav}
            </div>
          </div>
        )}

        <main id="main" className="min-w-0 flex-1">
          {/* Inside `main`, not a sibling of it, so it occupies the content
              column only — the sidebar (`aside`, above) is a separate flex
              child it never overlaps. `sticky top-14` pins it to the same
              offset the sidebar's own sticky nav uses (the header's height),
              so it stays on screen through a scroll rather than scrolling
              away with the page. */}
          <VerificationBanner />
          {children}
        </main>
      </div>

      {searchOpen && <CommandPalette onClose={() => setSearchOpen(false)} />}

      {/* Mounted here rather than on a page: it points at this shell's own
          chrome, which is the only thing present on every route. It renders
          nothing at all unless the signed-in account has never dismissed it,
          or somebody opens it from the account menu. */}
      <GuidedTour />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Counts the sidebar shows. Read from the same stores the screens read, so the
 * badge and the page can never disagree — which they did while the numbers were
 * literals in nav.tsx.
 *
 * That guarantee covered the data and missed the audience: `buildApprovalQueue`
 * is the company's whole pending queue, unscoped, and the badge showed its
 * length to everybody — a plain employee's own "My approvals" read 6 while the
 * page itself, correctly, told them approving is not part of their role. Same
 * `canApprove` question `approvals/inbox.tsx` already answers before it renders
 * anything, asked here before the count is even computed.
 */
function useNavBadges(): Record<BadgeSource, number> {
  const leave = useLeaveStore();
  const approvals = useApprovalStore();
  const attendance = useAttendanceStore();
  const { directory } = useEmployeeStore();
  const unread = useUnreadCount();
  const isManager = useIsManager();
  const { permissions } = usePermissions();
  const canApprove = isManager || hasAnyPermission(permissions, APPROVE_PERMISSIONS);

  return {
    unreadNotifications: unread,
    approvals: canApprove
      ? buildApprovalQueue({
          leaveRequests: leave.requests,
          decisions: approvals.decisions,
        }).length
      : 0,
    pendingLeave: leave.pending.length,
    notClockedIn: rosterFor({
      date: TODAY,
      employees: directory,
      entries: attendance.entries,
      leaveRequests: leave.requests,
      policy: attendance.policy,
    }).filter((r) => r.status === "absent").length,
  };
}

/**
 * The single nav item that matches the current path.
 *
 * A plain prefix test lights up every ancestor: on `/people/attendance` both
 * "Directory" (`/people`, a prefix) and "Attendance" (an exact match) were
 * highlighted, which makes the sidebar look broken and tells you nothing about
 * where you are.
 *
 * So the **longest** matching href wins, and only that one. `/people` still
 * highlights for `/people/p-01`, because a record page genuinely belongs to the
 * directory and has no nav item of its own — but the moment a more specific item
 * exists, it takes the highlight outright.
 */
function resolveActiveHref(
  groups: NavGroup[],
  pathname: string,
): string | null {
  let best: string | null = null;
  for (const group of groups) {
    for (const item of group.items) {
      const matches =
        pathname === item.href ||
        /* `/dashboard` is the app root and must not claim every path under it. */
        (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
      if (!matches) continue;
      if (best === null || item.href.length > best.length) best = item.href;
    }
  }
  return best;
}

function SidebarNav({
  groups,
  pathname,
  badges,
  onNavigate,
}: {
  groups: NavGroup[];
  pathname: string;
  badges: Record<BadgeSource, number>;
  onNavigate: () => void;
}) {
  const activeHref = resolveActiveHref(groups, pathname);

  return (
    <nav aria-label="Main" className="flex flex-col gap-6">
      {groups.map((group, gi) => (
        <div key={group.heading ?? `g${gi}`}>
          {group.heading && (
            <h2 className="mb-1.5 px-2.5 text-meta font-semibold uppercase tracking-[0.07em] text-faint">
              {group.heading}
            </h2>
          )}
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = item.href === activeHref;

              const count =
                item.badgeSource !== undefined
                  ? badges[item.badgeSource]
                  : item.badge;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    /* The guided tour points at items by route, so it can only
                       ever highlight one this company actually has — the list
                       here is already filtered by permission and feature. */
                    data-tour={`nav-item:${item.href}`}
                    onClick={onNavigate}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-body-sm font-medium",
                      "transition-colors duration-150",
                      active
                        ? "bg-accent-soft text-accent-text"
                        : "text-body hover:bg-surface hover:text-ink",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "shrink-0 [&>svg]:size-4",
                        active
                          ? "text-accent-text"
                          : "text-faint group-hover:text-muted",
                      )}
                    >
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {item.label}
                    </span>

                    {item.soon && (
                      <span className="shrink-0 text-meta font-normal text-faint">
                        Soon
                      </span>
                    )}
                    {count !== undefined && count > 0 && !item.soon && (
                      <span
                        className={cn(
                          "tabular shrink-0 rounded-full px-1.5 py-0.5 text-meta font-semibold",
                          active
                            ? "bg-accent text-white"
                            : "bg-sunken text-muted",
                        )}
                      >
                        {count}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Who you are signed in as, and the way back out.
 *
 * Shows the *session* user rather than the seed `CURRENT_USER`, so switching
 * accounts on the sign-in screen actually changes the product. Sign-out is a
 * real affordance rather than a decorative menu — without it the gate would be
 * a one-way door and switching roles would mean clearing site data.
 *
 * ## Why the role is here and not only on `/profile`
 *
 * This is the one place a name is on screen on every route, which makes it the
 * one place the *kind* of user can be stated on every route. The product shows a
 * different app per role by design — the sidebar is filtered by permission and
 * by feature — and until this badge existed nothing told you which of those apps
 * you were looking at. See `lib/roles.ts`.
 *
 * The badge sits beside the name from `sm` up and inside the open menu always.
 * On a 320px top bar there is room for the avatar and the chevron and not much
 * else, and a role name that pushed the sign-out affordance off screen would be
 * a worse trade than one extra tap.
 */
function UserMenu() {
  const { displayName, employee, user, mode, signOut } = useSession();
  const [open, setOpen] = useState(false);

  /* No seed fallback. `UserMenu` only renders behind `AuthGate`, so a missing
     name means the session is mid-load rather than absent — and borrowing a
     mock employee's name is how a menu ends up telling somebody they are
     signed in as a person they have never met. */
  const name = displayName ?? "Your account";
  /* An API user has no job title — that lives on the employee record — so the
     subtitle falls back through employee, then to the mode itself, which is
     more useful than a blank line. */
  const subtitle =
    employee?.jobTitle ??
    (DEMO_ENABLED && mode === "offline" ? "Demo session" : "Signed in");
  const email = user?.email ?? employee?.email ?? null;
  const recordId = user?.employeeId ?? employee?.id ?? null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2.5 rounded-md border border-line px-2 py-1.5 text-left hover:bg-canvas"
      >
        <Avatar name={name} size="xs" tone="accent" />
        <span className="hidden min-w-0 sm:block">
          <span className="block truncate text-body-sm font-medium leading-tight text-ink">
            {name}
          </span>
          <span className="block truncate text-meta leading-tight text-muted">
            {subtitle}
          </span>
        </span>
        <SessionRoleBadge className="hidden shrink-0 sm:inline-flex" />
        <ChevronDown
          aria-hidden="true"
          className="size-3.5 shrink-0 text-faint"
        />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="menu"
            className="animate-scale-in absolute right-0 z-50 mt-1.5 w-64 rounded-lg border border-line bg-surface p-1.5 shadow-lg"
          >
            <div className="border-b border-line px-2.5 py-2">
              <p className="truncate text-body-sm font-medium text-ink">
                {name}
              </p>
              <p className="truncate text-meta text-muted">
                {email ?? "No email on record"}
              </p>
              {/* Unconditional here, which is what makes the small-screen trade
                  above acceptable: the answer is always one tap away. */}
              <SessionRoleBadge className="mt-1.5" />
              {/* A demo that looks connected is the one thing worse than a
                  demo, so this stays for that case. The connected case says
                  nothing a real customer needs told — "yes, the product
                  works" is not information — and in a production build
                  `mode` is always "api", so this line is absent from every
                  live company's account, not merely quiet on it. */}
              {DEMO_ENABLED && mode !== "api" && (
                <p className="mt-1.5 text-meta text-faint">
                  Demo session — data is local to this browser
                </p>
              )}
            </div>
            {recordId && (
              <Link
                href={`/people/${recordId}`}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block rounded-md px-2.5 py-2 text-body-sm text-body hover:bg-canvas hover:text-ink"
              >
                My record
              </Link>
            )}
            {/*
             * The two that came out of the sidebar.
             *
             * They were the most prominent items in the nav and among the least
             * opened, so they moved here — but moving them out without putting
             * them anywhere would have orphaned both routes, which is the
             * failure this codebase keeps rediscovering (Leavers, departments,
             * the importer, all built and all unreachable). The bell in the
             * header already covers /notifications; these two had nothing.
             */}
            <Link
              href="/profile"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block rounded-md px-2.5 py-2 text-body-sm text-body hover:bg-canvas hover:text-ink"
            >
              My profile
            </Link>
            <Link
              href="/documents"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block rounded-md px-2.5 py-2 text-body-sm text-body hover:bg-canvas hover:text-ink"
            >
              My documents
            </Link>
            <Link
              href="/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block rounded-md px-2.5 py-2 text-body-sm text-body hover:bg-canvas hover:text-ink"
            >
              Settings
            </Link>
            {/* Dismissing the tour is not a decision anybody should be stuck
                with, and this is the only way back to it. */}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                openTour();
              }}
              className="block w-full rounded-md px-2.5 py-2 text-left text-body-sm text-body hover:bg-canvas hover:text-ink"
            >
              Take the tour
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => void signOut()}
              className="block w-full rounded-md px-2.5 py-2 text-left text-body-sm text-body hover:bg-canvas hover:text-ink"
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Which company you are looking at.
 *
 * ## It used to be a hardcoded lie
 *
 * This rendered the literal string "Schull Technologies" and the letter "S" for
 * every account in every organisation, reading no data at all. Two companies
 * open side by side therefore both said "Schull Technologies", which is exactly
 * how somebody ends up creating appraisal forms in one company and wondering
 * why an employee in another cannot see them. The label is the *only* thing on
 * screen that distinguishes two tenants, so a wrong one is worse than none.
 *
 * ## And it is not a switcher
 *
 * `User.organizationId` is a single column — an account belongs to exactly one
 * organisation and there is no membership join table, so there is nothing to
 * switch *to*. The chevron promised a menu that could never exist and the
 * button did nothing when pressed: a dead control, which this codebase's own
 * rule says should be absent rather than inert. It is a label now.
 *
 * Renders nothing when the name is not known — after a fresh sign-in, before
 * the first `/auth/me`. Absent, not a guess.
 */
function CompanySwitcher() {
  const { user } = useSession();
  const organization = user?.organization;
  if (!organization) return null;

  /* The trading name is what people call the company; the legal name is what
     the certificate says. Prefer the first and fall back to the second, the
     same order `payslip-document.tsx` uses for the employer block. */
  const name = organization.tradingName ?? organization.legalName;
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <span
      className={cn(
        "hidden items-center gap-2 rounded-md border border-line px-2.5 py-1.5",
        "text-body-sm font-medium text-ink sm:flex",
      )}
      title={
        organization.tradingName && organization.tradingName !== organization.legalName
          ? organization.legalName
          : undefined
      }
    >
      <span className="flex size-5 items-center justify-center rounded-xs bg-accent text-meta font-bold text-white">
        {initial}
      </span>
      <span className="max-w-[14rem] truncate">{name}</span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */

export function PageHeader({
  title,
  breadcrumb,
  action,
  meta,
  tabs,
}: {
  title: string;
  breadcrumb?: { href: string; label: string }[];
  action?: React.ReactNode;
  /** Small status chips shown beside the title. */
  meta?: React.ReactNode;
  tabs?: React.ReactNode;
}) {
  const pathname = usePathname();

  /*
   * The parent to go "back" to, which is not always the last crumb.
   *
   * Two shapes exist in this codebase, both legitimate breadcrumb conventions:
   * a trail that ends at the parent (`[Directory, Departments]` on a page
   * `/people/departments/[id]` render error), and a trail that ends at the
   * page itself (`[Directory, "Ada Okonkwo"]` on `/people/[id]`, so the crumb
   * can show the record's name). The first render of this control used the
   * last crumb unconditionally and produced "Back to Ada Okonkwo" while
   * already on Ada Okonkwo's page — a link to where you are.
   *
   * Comparing the last crumb's href against the current path is what tells
   * the two apart without asking every call site to say which shape it used.
   */
  const backCrumb =
    breadcrumb && breadcrumb.length > 0
      ? breadcrumb[breadcrumb.length - 1]!.href === pathname &&
        breadcrumb.length > 1
        ? breadcrumb[breadcrumb.length - 2]!
        : breadcrumb[breadcrumb.length - 1]!
      : null;

  return (
    <div className="grid-fade border-b border-line">
      <div className="px-5 pt-6 sm:px-7">
        {breadcrumb && breadcrumb.length > 0 && (
          <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
            {/*
             * An explicit way back, pointing at the **parent** rather than at
             * browser history.
             *
             * The crumbs were already links, and that was not enough: they read
             * as a location rather than as a control, so people used the
             * browser's back button — which is not the same journey. Arriving
             * here from a notification, from search, or from a deep link means
             * back goes somewhere unrelated to the page you are on, and after a
             * redirect it can go nowhere at all.
             *
             * Deterministic — the same target every time, whatever route
             * somebody took to get here. `router.back()` would have been one
             * line and wrong for that reason.
             */}
            {backCrumb && (
              <Link
                href={backCrumb.href}
                className="inline-flex items-center gap-1 rounded-md text-meta font-medium text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <ChevronLeft aria-hidden="true" className="size-3.5" />
                Back to {backCrumb.label}
              </Link>
            )}

            <span aria-hidden="true" className="text-line-strong">
              |
            </span>

            <nav aria-label="Breadcrumb">
              <ol className="flex flex-wrap items-center gap-1.5 text-meta text-muted">
                {breadcrumb.map((crumb, i) => (
                  <li key={crumb.href} className="flex items-center gap-1.5">
                    {i > 0 && (
                      <span aria-hidden="true" className="text-line-strong">
                        /
                      </span>
                    )}
                    <Link href={crumb.href} className="hover:text-ink">
                      {crumb.label}
                    </Link>
                  </li>
                ))}
              </ol>
            </nav>
          </div>
        )}

        <div className="flex flex-wrap items-start justify-between gap-4 pb-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-h3 text-ink">{title}</h1>
              {meta}
            </div>
          </div>
          {action && (
            <div className="flex shrink-0 items-center gap-2">{action}</div>
          )}
        </div>

        {tabs}
      </div>
    </div>
  );
}

export function PageBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("px-5 py-6 sm:px-7", className)}>{children}</div>;
}

/** Sticky helper for empty "not built yet" routes so the nav stays honest. */
export function ComingSoon({ label }: { label: string }) {
  return (
    <PageBody>
      <div className="brand-wash flex flex-col items-center rounded-xl border border-line px-6 py-20 text-center">
        <Badge tone="warning" dot>
          Not built yet
        </Badge>
        <h2 className="mt-4 text-h4 text-ink">{label}</h2>
        <p className="mt-2 max-w-sm text-body-sm text-body">
          This module is on the roadmap and isn&apos;t switched on yet.
        </p>
      </div>
    </PageBody>
  );
}
