import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiNotification } from "@/lib/api/notifications";

/**
 * The birthday row in the notifications inbox.
 *
 * The API writes it with `actionHref: "/dashboard"`, and the greeting on the
 * dashboard is there for one day. A button to it would be a link to nowhere from
 * the second morning on, so the row is the message and nothing more: the title
 * and the body as they came, no button, and no badge. It is found by what it is
 * about (`entityType: "birthday"`), never by the rule that produced it, because a
 * company's own rule row replaces the event key in `ruleId`.
 */

const state = vi.hoisted(() => ({
  notifications: {
    items: [] as unknown[],
    now: new Date("2026-11-23T09:00:00Z"),
    unread: 1,
    live: true,
    loading: false,
    error: null as unknown,
    hasMore: false,
    reload: () => {},
    showMore: () => {},
    markRead: vi.fn(async () => {}),
    markAllRead: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
  usePathname: () => "/notifications",
}));
vi.mock("@/lib/store/session", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/store/session")>()),
  useSession: () => ({
    employeeId: "e1",
    isConnected: true,
    isLoading: false,
    mode: "api",
  }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/store/notifications", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/store/notifications")>()),
  useNotifications: () => state.notifications,
}));

const { NotificationsInbox } = await import("@/app/(app)/notifications/inbox");

const TITLE = "Happy birthday, Ada";
const BODY =
  "Everyone at Schulltech wishes you a happy birthday. We hope today goes well for you.";

const birthday = (over: Partial<ApiNotification> = {}): ApiNotification => ({
  id: "n-birthday",
  ruleId: "birthday.greeting",
  title: TITLE,
  body: BODY,
  actionHref: "/dashboard",
  entityType: "birthday",
  entityId: "opaque-id",
  severity: "INFO",
  read: false,
  readAt: null,
  createdAt: "2026-11-23T07:00:00.000Z",
  ...over,
});

const payslip = (): ApiNotification => ({
  id: "n-payslip",
  ruleId: "payslip.ready",
  title: "Your payslip is ready",
  body: "October 2026",
  actionHref: "/payroll/payslips",
  entityType: "payslip",
  entityId: "p1",
  severity: "INFO",
  read: false,
  readAt: null,
  createdAt: "2026-11-23T06:00:00.000Z",
});

const rowOf = (title: string) =>
  screen.getByText(title).closest("li") as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  state.notifications.items = [birthday(), payslip()];
});

describe("the birthday row", () => {
  it("is the title and the body exactly as the API wrote them", () => {
    render(<NotificationsInbox />);
    const row = rowOf(TITLE);
    expect(within(row).getByText(TITLE)).toBeInTheDocument();
    expect(within(row).getByText(BODY)).toBeInTheDocument();
  });

  it("has no button and no link, because the dashboard line is gone by tomorrow", () => {
    render(<NotificationsInbox />);
    const row = rowOf(TITLE);
    expect(within(row).queryByRole("link")).toBeNull();
    expect(row.querySelector("a")).toBeNull();
    expect(document.querySelector('a[href="/dashboard"]')).toBeNull();
  });

  it("carries no badge: it is information, not something that needs them", () => {
    render(<NotificationsInbox />);
    const row = rowOf(TITLE);
    expect(within(row).queryByText(/Needs you|Urgent|Check this/)).toBeNull();
  });

  it("is recognised by what it is about, not by the rule that wrote it", () => {
    /* A company that adds its own rule row replaces the event key, and a row with
       no rule at all has none. Neither makes a link to nowhere. */
    state.notifications.items = [
      birthday({ ruleId: "rule-9f2c" }),
      birthday({ id: "n-2", ruleId: null, title: "Happy birthday, Obi" }),
    ];
    render(<NotificationsInbox />);
    for (const title of [TITLE, "Happy birthday, Obi"]) {
      expect(within(rowOf(title)).queryByRole("link")).toBeNull();
    }
  });

  it("is still read and cleared like any other row", async () => {
    const user = userEvent.setup();
    render(<NotificationsInbox />);
    await user.click(
      screen.getByRole("button", { name: `Mark “${TITLE}” read` }),
    );
    expect(state.notifications.markRead).toHaveBeenCalledWith("n-birthday");
    await user.click(screen.getByRole("button", { name: `Remove “${TITLE}”` }));
    expect(state.notifications.remove).toHaveBeenCalledWith("n-birthday");
  });

  it("does not take the button away from the rows that have somewhere to go", () => {
    render(<NotificationsInbox />);
    const link = within(rowOf("Your payslip is ready")).getByRole("link", {
      name: "Open payslips",
    });
    expect(link).toHaveAttribute("href", "/payroll/payslips");
  });
});
