import { fireEvent, render, screen } from "@testing-library/react";
import { afterAll, describe, expect, it, vi } from "vitest";
import { SidebarNav } from "@/components/portal/sidebar";
import {
  buildSidebar,
  findDestinations,
} from "@/components/portal/sidebar-model";
import {
  NO_BADGES,
  PERSONAS,
  doorsBefore,
  groupsFor,
  type Persona,
} from "./sidebar-personas";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/profile",
}));

/**
 * The promise this rewrite has to keep: nobody gains or loses a door.
 *
 * The sidebar used to print every visible item at once. It now prints a short
 * top level and opens the rest a level at a time, and finds the rest by typing.
 * None of that is allowed to change *which* destinations a person has — the
 * gating (`visibleNav`) is the source of truth and is not touched.
 *
 * So for each of eight readers this computes
 *
 * - **before**: every `href|label` the long list showed, which is every item
 *   `visibleNav` leaves — the same function, unchanged;
 * - **after, by drilling**: opens the real component, reads the links at the top
 *   level, presses every chevron row in turn and reads what is behind it;
 * - **after, by Find**: types every door's own name and looks for it in the
 *   results,
 *
 * and asserts the three sets are the same, each door once. A door that went
 * missing, a door that appeared, and a door listed under two rows all fail here.
 *
 * Run with `SIDEBAR_REPORT=1` to print the row counts the report quotes.
 */

const labelOf = (link: Element) =>
  link.querySelector("[data-nav-label]")?.textContent ??
  link.getAttribute("aria-label") ??
  "";

const mount = (persona: Persona, pathname = "/profile") =>
  render(
    <SidebarNav
      groups={groupsFor(persona)}
      pathname={pathname}
      badges={NO_BADGES}
      onNavigate={() => undefined}
      onSearchPeople={() => undefined}
    />,
  );

function drill(container: HTMLElement): { doors: string[]; topRows: number } {
  const nav = () => container.querySelector('nav[aria-label="Main"]')!;
  const read = () =>
    Array.from(nav().querySelectorAll("a[href]")).map(
      (a) => `${a.getAttribute("href")}|${labelOf(a)}`,
    );
  const doors = read();
  const rowIds = Array.from(
    nav().querySelectorAll<HTMLElement>("button[data-nav-row]"),
  ).map((b) => b.dataset["navRow"]!);
  const topRows = nav().querySelectorAll(
    "a[href], button[data-nav-row]",
  ).length;
  for (const id of rowIds) {
    fireEvent.click(
      nav().querySelector(`button[data-nav-row="${id}"]`) as HTMLElement,
    );
    doors.push(...read());
    fireEvent.click(screen.getByRole("button", { name: /back to main menu/i }));
  }
  return { doors, topRows };
}

const report: string[] = [];

describe.each(PERSONAS)("parity: $name", (persona) => {
  const groups = groupsFor(persona);
  const before = doorsBefore(groups);

  it("reaches exactly the doors the long list showed, each once, by drilling", () => {
    const { container } = mount(persona);
    const { doors, topRows } = drill(container);
    /* Sorted lists, not sets: the same door twice is a failure too. Two locked
       modules each have an "Overview" that points at `/billing/pay`, so a
       locked company legitimately holds the same `href|label` more than once —
       equality of the two sorted lists is what says each is there exactly as
       often as before. */
    expect([...doors].sort()).toEqual([...before].sort());
    if (!persona.billing) expect(new Set(doors).size).toBe(doors.length);
    report.push(
      `${persona.name.padEnd(26)} before ${String(before.length).padStart(2)}  after ${String(topRows).padStart(2)}`,
    );
  });

  it("reaches every one of them through Find, with the group it lives in", () => {
    const tree = buildSidebar(groups);
    for (const group of groups) {
      for (const item of group.items) {
        const hits = findDestinations(tree, item.label);
        expect(
          hits.some(
            (hit) =>
              hit.item.label === item.label && hit.item.href === item.href,
          ),
          `${group.heading ?? "Home"} › ${item.label} not found by its own name`,
        ).toBe(true);
      }
    }
  });

  it("reaches every one of them through the Find box itself", () => {
    const { container } = mount(persona);
    const input = screen.getByRole("combobox", { name: "Find a page" });
    for (const entry of before) {
      const [href, label] = entry.split("|") as [string, string];
      fireEvent.change(input, { target: { value: label } });
      const options = Array.from(
        container.querySelectorAll('a[role="option"]'),
      );
      const found = options.some((option) => {
        const name = (option.getAttribute("aria-label") ?? "").replace(
          / \(not in your plan\)$/,
          "",
        );
        return (
          option.getAttribute("href") === href &&
          (name === label || name.endsWith(` › ${label}`))
        );
      });
      expect(found, `${entry} missing from Find results`).toBe(true);
    }
  });

  it("never offers a door the person does not have", () => {
    const { container } = mount(persona);
    const input = screen.getByRole("combobox", { name: "Find a page" });
    const allowed = new Set(before);
    for (const word of [
      "pay",
      "hire",
      "leave",
      "set",
      "report",
      "role",
      "a",
      "e",
    ]) {
      fireEvent.change(input, { target: { value: word } });
      for (const option of container.querySelectorAll('a[role="option"]')) {
        const name = (option.getAttribute("aria-label") ?? "")
          .replace(/ \(not in your plan\)$/, "")
          .split(" › ")
          .pop();
        expect(allowed.has(`${option.getAttribute("href")}|${name}`)).toBe(
          true,
        );
      }
    }
  });
});

afterAll(() => {
  if (process.env["SIDEBAR_REPORT"]) {
    console.info(
      ["persona                     long list -> top level", ...report].join(
        "\n",
      ),
    );
  }
});
