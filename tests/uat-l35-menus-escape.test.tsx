import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { useRef, useState } from "react";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useCloseOnEscape } from "@/hooks/use-close-on-escape";

/**
 * UAT 23 Nov, L35 (NC-34): a row menu stayed open on Escape, and its invisible
 * overlay kept blocking clicks until somebody clicked elsewhere. The shared
 * `RowActions` already closed on Escape; the menus written by hand beside it
 * did not.
 */

function Menu({ onModalEscape }: { onModalEscape?: () => void }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useCloseOnEscape(open, () => setOpen(false), trigger);
  return (
    <div
      onKeyDown={(event) => {
        if (event.key === "Escape") onModalEscape?.();
      }}
    >
      <button ref={trigger} type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open && (
        <div role="menu">
          <button type="button" role="menuitem">
            Item
          </button>
        </div>
      )}
    </div>
  );
}

const escape = () =>
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });

describe("a menu written by hand", () => {
  it("closes on Escape and gives focus back to its button", () => {
    render(<Menu />);
    act(() => screen.getByRole("button", { name: "Open" }).click());
    screen.getByRole("menuitem").focus();
    escape();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Open" }),
    );
  });

  it("takes only that Escape, so a dialog behind it stays open", () => {
    let modalHeard = 0;
    render(<Menu onModalEscape={() => (modalHeard += 1)} />);
    act(() => screen.getByRole("button", { name: "Open" }).click());
    escape();
    expect(modalHeard).toBe(0);
    escape();
    expect(modalHeard).toBe(1);
  });
});

describe("every menu in the app", () => {
  it("closes on Escape: it is RowActions, or it handles the key itself", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith(".tsx")) files.push(path);
      }
    };
    walk(join(__dirname, "..", "src"));
    const silent = files.filter((path) => {
      const source = readFileSync(path, "utf8");
      if (!source.includes('role="menu"')) return false;
      return !(
        source.includes("useCloseOnEscape") || source.includes('"Escape"')
      );
    });
    expect(silent.map((path) => path.split("/src/")[1])).toEqual([]);
  });
});
