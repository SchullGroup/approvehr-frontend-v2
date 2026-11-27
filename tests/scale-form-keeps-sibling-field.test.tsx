import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import {
  RATING_LABELS,
  type ApiRatingLevel,
  type ApiRatingScale,
} from "@/lib/api/performance";

/**
 * "What a mark is called" in Settings, Appraisal scoring.
 *
 * Five rows, a number and a word each, and a pencil on each that opens that
 * rating's word and what it means. The word and the meaning are two fields, and
 * the edit used to blank the other one on every keystroke, so typing a level's
 * word erased its meaning and typing the meaning erased the word. Nothing in the
 * types or the build can see that: the state is valid after each edit, just not
 * the one the person made.
 *
 * Saving writes the whole set, because the rule is about the set: no two ratings
 * may share a word. The box that breaks it is marked and Save stays off, with no
 * sentence and no callout.
 */

const levels: ApiRatingLevel[] = [
  { level: 1, label: "Below", meaning: "Missed most of what was agreed." },
  { level: 2, label: "Partly", meaning: "Met some of what was agreed." },
  { level: 3, label: "Meets", meaning: "Delivered what was agreed." },
  { level: 4, label: "Exceeds", meaning: "Delivered more than agreed." },
  { level: 5, label: "Outstanding", meaning: "Set the standard." },
];
let scale: ApiRatingScale = { source: "saved", max: 5, levels };
let allowed = true;

const save = vi.fn().mockResolvedValue(scale);

vi.mock("@/lib/permissions", () => ({ useCan: () => allowed }));
vi.mock("@/lib/demo", () => ({ sourceNote: () => null }));
vi.mock("@/components/portal/load-failure", () => ({
  LoadFailure: () => null,
}));
vi.mock("@/lib/store/performance", () => ({
  useRatingScale: () => ({
    scale,
    loading: false,
    error: null,
    source: "api",
    editable: true,
    refusal: "",
    save,
    reload: vi.fn(),
  }),
}));

import { RatingScaleForm } from "@/app/(app)/settings/performance/scale-form";

const show = () =>
  render(
    <ToastProvider>
      <RatingScaleForm />
    </ToastProvider>,
  );

const edit = async (level: number) => {
  await userEvent.click(
    screen.getByRole("button", { name: `Edit rating ${String(level)}` }),
  );
  const dialog = screen.getByRole("dialog", {
    name: `Rating ${String(level)}`,
  });
  return {
    dialog,
    word: within(dialog).getByLabelText("Name") as HTMLInputElement,
    meaning: within(dialog).getByLabelText(/Meaning/) as HTMLTextAreaElement,
    save: within(dialog).getByRole("button", { name: "Save" }),
  };
};

beforeEach(() => {
  scale = { source: "saved", max: 5, levels };
  allowed = true;
  save.mockClear();
});

describe("the rows", () => {
  it("are five, best first, each a number and its word, and nothing else", () => {
    show();
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(5);
    expect(rows.map((row) => row.textContent)).toEqual([
      "5Outstanding",
      "4Exceeds",
      "3Meets",
      "2Partly",
      "1Below",
    ]);
    expect(screen.queryByText("Delivered what was agreed.")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("have no heading, badge, help line, callout or Unsaved changes", () => {
    const { container } = show();
    expect(screen.queryByRole("heading")).toBeNull();
    expect(container.textContent).not.toMatch(
      /Your own names|Built-in names|Shown under the name|Can't save yet|Unsaved changes/,
    );
    expect(screen.queryByRole("button", { name: /^Save/ })).toBeNull();
  });

  it("have no pencil, menu or save for somebody who cannot change settings", () => {
    allowed = false;
    show();
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.queryByRole("button", { name: /Edit rating/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /More actions/ })).toBeNull();
  });
});

describe("a rating's word and its meaning are edited separately", () => {
  it("opens on what is saved", async () => {
    show();
    const { word, meaning } = await edit(3);
    expect(word).toHaveValue("Meets");
    expect(meaning).toHaveValue("Delivered what was agreed.");
  });

  it("keeps the meaning when the word is changed", async () => {
    show();
    const { word, meaning } = await edit(3);
    await userEvent.type(word, " well");
    expect(word).toHaveValue("Meets well");
    expect(meaning).toHaveValue("Delivered what was agreed.");
  });

  it("keeps the word when the meaning is changed", async () => {
    show();
    const { word, meaning } = await edit(3);
    await userEvent.type(meaning, " On time.");
    expect(meaning).toHaveValue("Delivered what was agreed. On time.");
    expect(word).toHaveValue("Meets");
  });

  it("is saved with the whole set, the other four as they were", async () => {
    show();
    const { word, save: press } = await edit(3);
    expect(press).toBeDisabled();
    await userEvent.type(word, " well");
    expect(press).toBeEnabled();
    await userEvent.click(press);

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]?.[0]).toEqual(
      levels.map((entry) =>
        entry.level === 3 ? { ...entry, label: "Meets well" } : entry,
      ),
    );
  });
});

describe("a word that cannot be saved", () => {
  it("is marked, not explained, when it is the same as another rating's", async () => {
    show();
    const { word, save: press } = await edit(3);
    await userEvent.clear(word);
    await userEvent.type(word, "exceeds");
    expect(word).toHaveAttribute("aria-invalid", "true");
    expect(press).toBeDisabled();
    expect(screen.queryByText(/cannot share a word/)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("is marked when it is blank", async () => {
    show();
    const { word, save: press } = await edit(3);
    await userEvent.clear(word);
    expect(word).toHaveAttribute("aria-invalid", "true");
    expect(press).toBeDisabled();
  });

  it("is not marked while it is fine", async () => {
    show();
    const { word } = await edit(3);
    expect(word).not.toHaveAttribute("aria-invalid");
  });
});

describe("Reset to built-in names", () => {
  it("is in a menu, asks first, and then saves the built-in set", async () => {
    show();
    await userEvent.click(
      screen.getByRole("button", { name: "More actions for rating names" }),
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Reset to built-in names" }),
    );
    const confirm = screen.getByRole("dialog", {
      name: "Reset to the built-in names?",
    });
    expect(save).not.toHaveBeenCalled();
    await userEvent.click(
      within(confirm).getByRole("button", { name: "Reset" }),
    );

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const sent = save.mock.calls[0]?.[0] as ApiRatingLevel[];
    expect(sent.map((entry) => entry.label)).toEqual(
      [1, 2, 3, 4, 5].map((level) => RATING_LABELS[level]),
    );
  });

  it("is not offered to a company that already follows the built-in names", () => {
    scale = { source: "default", max: 5, levels };
    show();
    expect(screen.queryByRole("button", { name: /More actions/ })).toBeNull();
  });
});
