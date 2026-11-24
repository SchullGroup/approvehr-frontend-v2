import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PageHeader } from "@/components/portal/shell";
import {
  Card,
  FilterBar,
  HeaderSlot,
  HeaderSlotProvider,
} from "@/components/ui";
import { resetNavHistoryForTests } from "@/lib/nav-history";

/**
 * The owner (24 Nov 2026): the filter icon sat on its own row under the page
 * header, at the far left, which looked odd (Signatures: "Send for signature"
 * top right and a lone icon below it at the left). When the bar is nothing but
 * the icon, it now sits in the header, just left of the action. Everywhere else
 * it stays with what it filters, and never alone at the left of an empty row.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/people/signatures",
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

beforeEach(() => resetNavHistoryForTests());

const chip = (onClear = vi.fn()) => [
  { label: "Show", value: "Waiting on me", onClear },
];

function Panel() {
  return (
    <label>
      What to show
      <select defaultValue="mine">
        <option value="mine">Waiting on me</option>
        <option value="all">Everything</option>
      </select>
    </label>
  );
}

/** A header like PageHeader's: the slot, then the action. */
function Header() {
  return (
    <div data-testid="header">
      <HeaderSlot />
      <button type="button">Send for signature</button>
    </div>
  );
}

const icon = () => screen.getByRole("button", { name: /^Filters/ });

describe("a bar that is only the filter icon", () => {
  it("moves into the page header, just left of the action", () => {
    render(
      <HeaderSlotProvider>
        <Header />
        <main data-testid="body">
          <FilterBar>
            <Panel />
          </FilterBar>
        </main>
      </HeaderSlotProvider>,
    );
    const header = screen.getByTestId("header");
    const buttons = within(header).getAllByRole("button");
    expect(
      buttons.map((b) => b.getAttribute("aria-label") ?? b.textContent),
    ).toEqual(["Filters", "Send for signature"]);
    expect(within(screen.getByTestId("body")).queryByRole("button")).toBeNull();
  });

  it("does it in the real PageHeader, which offers the place only when it has an action", () => {
    const { rerender } = render(
      <HeaderSlotProvider>
        <PageHeader
          title="Signatures"
          action={<button type="button">Send for signature</button>}
        />
        <main data-testid="body">
          <FilterBar>
            <Panel />
          </FilterBar>
        </main>
      </HeaderSlotProvider>,
    );
    const send = screen.getByRole("button", { name: "Send for signature" });
    expect(send.parentElement?.contains(icon())).toBe(true);
    expect(within(screen.getByTestId("body")).queryByRole("button")).toBeNull();

    rerender(
      <HeaderSlotProvider>
        <PageHeader title="Signatures" />
        <main data-testid="body">
          <FilterBar>
            <Panel />
          </FilterBar>
        </main>
      </HeaderSlotProvider>,
    );
    expect(within(screen.getByTestId("body")).getByRole("button")).toBe(icon());
  });

  it("keeps the applied filters in the body, beside the list they narrow", () => {
    const onClear = vi.fn();
    render(
      <HeaderSlotProvider>
        <Header />
        <main data-testid="body">
          <FilterBar applied={chip(onClear)}>
            <Panel />
          </FilterBar>
        </main>
      </HeaderSlotProvider>,
    );
    const body = screen.getByTestId("body");
    const remove = within(body).getByRole("button", {
      name: /Waiting on me/,
    });
    fireEvent.click(remove);
    expect(onClear).toHaveBeenCalled();
    expect(
      within(screen.getByTestId("header")).getByRole("button", {
        name: "Filters, 1 applied",
      }),
    ).toBeInTheDocument();
  });

  it("opens its panel under it in the header, with the same labels, and Escape closes it", () => {
    render(
      <HeaderSlotProvider>
        <Header />
        <FilterBar>
          <Panel />
        </FilterBar>
      </HeaderSlotProvider>,
    );
    expect(icon()).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(icon());
    expect(icon()).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByRole("group", { name: "Filters" });
    expect(icon().getAttribute("aria-controls")).toBe(panel.id);
    expect(screen.getByTestId("header").contains(panel)).toBe(true);
    // Lined up with the icon's right edge, so it stays on the screen.
    expect(panel.className).toContain("right-0");
    fireEvent.keyDown(screen.getByLabelText("What to show"), {
      key: "Escape",
    });
    expect(icon()).toHaveAttribute("aria-expanded", "false");
  });
});

describe("where it stays", () => {
  it("inside a card: it filters that card", () => {
    render(
      <HeaderSlotProvider>
        <Header />
        <Card data-testid="card">
          <FilterBar>
            <Panel />
          </FilterBar>
        </Card>
      </HeaderSlotProvider>,
    );
    expect(screen.getByTestId("card").contains(icon())).toBe(true);
  });

  it("inside a dialog: it filters the dialog", () => {
    render(
      <HeaderSlotProvider>
        <Header />
        <div role="dialog" data-testid="dialog">
          <FilterBar>
            <Panel />
          </FilterBar>
        </div>
      </HeaderSlotProvider>,
    );
    expect(screen.getByTestId("dialog").contains(icon())).toBe(true);
  });

  it("with two such bars on a page, neither moves; when one goes, the other does", () => {
    function Page() {
      const [both, setBoth] = useState(true);
      return (
        <HeaderSlotProvider>
          <Header />
          <button type="button" onClick={() => setBoth(false)}>
            Drop one
          </button>
          <main data-testid="body">
            <FilterBar>
              <Panel />
            </FilterBar>
            {both && (
              <FilterBar>
                <Panel />
              </FilterBar>
            )}
          </main>
        </HeaderSlotProvider>
      );
    }
    render(<Page />);
    expect(
      within(screen.getByTestId("body")).getAllByRole("button", {
        name: "Filters",
      }),
    ).toHaveLength(2);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Drop one" }));
    });
    expect(screen.getByTestId("header").contains(icon())).toBe(true);
  });

  it("with no header to go to", () => {
    render(
      <main data-testid="body">
        <FilterBar>
          <Panel />
        </FilterBar>
      </main>,
    );
    expect(screen.getByTestId("body").contains(icon())).toBe(true);
  });
});

describe("a bar with more in it", () => {
  it("with a search box: the icon stays beside the search box", () => {
    render(
      <HeaderSlotProvider>
        <Header />
        <main data-testid="body">
          <FilterBar search="" onSearchChange={vi.fn()} searchLabel="Search">
            <Panel />
          </FilterBar>
        </main>
      </HeaderSlotProvider>,
    );
    const search = screen.getByRole("textbox", { name: "Search" });
    expect(screen.getByTestId("body").contains(icon())).toBe(true);
    // The search box's own wrapper, then the icon's.
    expect(search.parentElement?.nextElementSibling?.contains(icon())).toBe(
      true,
    );
  });

  it("with a count and actions but no search: the icon joins them on the right, before the actions", () => {
    render(
      <HeaderSlotProvider>
        <Header />
        <main data-testid="body">
          <FilterBar
            count={12}
            noun={["person", "people"]}
            actions={<button type="button">Export</button>}
          >
            <Panel />
          </FilterBar>
        </main>
      </HeaderSlotProvider>,
    );
    const exportButton = screen.getByRole("button", { name: "Export" });
    const group = exportButton.parentElement!;
    expect(group.contains(icon())).toBe(true);
    expect(group.textContent).toContain("12 people");
    // Icon, then the action.
    const order = within(group).getAllByRole("button");
    expect(
      order.map((b) => b.getAttribute("aria-label") ?? b.textContent),
    ).toEqual(["Filters", "Export"]);
    fireEvent.click(icon());
    expect(screen.getByRole("group", { name: "Filters" }).className).toContain(
      "right-0",
    );
  });
});
