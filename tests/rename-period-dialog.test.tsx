import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ToastProvider } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { ApiCycle } from "@/lib/api/performance";
import {
  PERIOD_NAME_TOO_LONG,
  PERIOD_NAME_TOO_SHORT,
} from "@/lib/performance/period-name";

/**
 * Changing what an appraisal period is called.
 *
 * What is worth a test is what is sent and what is told: that only the name goes,
 * trimmed, and only when it differs; that a name the API would refuse is refused
 * here without a request; that the API's own sentence about a name already in use
 * stays on the field with what was typed still there; and that the dialog cannot
 * be closed while the request is in flight, so an answer is never lost behind a
 * dialog that has gone. None of it is visible to `tsc`.
 */

let updateCycle: Mock<(...args: unknown[]) => Promise<unknown>>;

vi.mock("@/lib/store/performance", () => ({
  useCycleMutations: () => ({
    updateCycle: (...args: unknown[]) => updateCycle(...args),
  }),
}));

const { RenamePeriodDialog } =
  await import("@/app/(app)/performance/periods/[id]/rename-period-dialog");

const period = (
  over: Partial<Pick<ApiCycle, "id" | "name" | "stage">> = {},
): Pick<ApiCycle, "id" | "name" | "stage"> => ({
  id: "cycle-1",
  name: "Q1-Q3 Appraisal",
  stage: "DRAFT",
  ...over,
});

const show = (subject = period()) => {
  const onClose = vi.fn();
  const onRenamed = vi.fn();
  render(
    <ToastProvider>
      <RenamePeriodDialog
        period={subject}
        onClose={onClose}
        onRenamed={onRenamed}
      />
    </ToastProvider>,
  );
  return { onClose, onRenamed };
};

const box = () => screen.getByLabelText(/Period name/) as HTMLInputElement;
const save = () => screen.getByRole("button", { name: "Save" });
const retype = async (text: string) => {
  const user = userEvent.setup();
  await user.clear(box());
  if (text) await user.type(box(), text);
  return user;
};

beforeEach(() => {
  updateCycle = vi.fn().mockResolvedValue({});
});

describe("opening it", () => {
  it("is titled and starts on the period's current name, with Save off", () => {
    show();
    expect(
      screen.getByRole("dialog", { name: "Rename this period" }),
    ).toBeInTheDocument();
    expect(box().value).toBe("Q1-Q3 Appraisal");
    expect(save()).toBeDisabled();
  });

  it("says where the name is seen, without the line about sent messages on a draft", () => {
    show(period({ stage: "DRAFT" }));
    expect(
      screen.getByText(/People see this name on their form/),
    ).toBeVisible();
    expect(screen.queryByText(/Messages already sent/)).toBeNull();
  });

  it("says that messages already sent keep the old name once the period has started", () => {
    show(period({ stage: "SELF" }));
    expect(
      screen.getByText(/Messages already sent keep the old name\./),
    ).toBeVisible();
  });
});

describe("when Save is on", () => {
  it("stays off for the same name, and for the same name with spaces around it", async () => {
    show();
    const user = await retype("  Q1-Q3 Appraisal  ");
    expect(save()).toBeDisabled();
    await user.type(box(), "!");
    expect(save()).toBeEnabled();
  });

  it("is off again when the typing goes back to what it was", async () => {
    show();
    const user = await retype("Q1-Q3 Appraisals");
    expect(save()).toBeEnabled();
    await user.type(box(), "{Backspace}");
    expect(save()).toBeDisabled();
  });
});

describe("saving", () => {
  it("sends the period and the trimmed name, and nothing else", async () => {
    const { onRenamed, onClose } = show();
    const user = await retype("   H1 2027 Appraisal  ");
    await user.click(save());

    expect(updateCycle).toHaveBeenCalledTimes(1);
    expect(updateCycle).toHaveBeenCalledWith("cycle-1", {
      name: "H1 2027 Appraisal",
    });
    expect(onRenamed).toHaveBeenCalledWith("H1 2027 Appraisal");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("tells the person what the period is called now", async () => {
    show();
    const user = await retype("H1 2027 Appraisal");
    await user.click(save());
    expect(await screen.findByText("Renamed")).toBeVisible();
    expect(
      screen.getByText("This period is now called H1 2027 Appraisal."),
    ).toBeVisible();
  });

  it("saves on Enter, as a form does", async () => {
    const { onRenamed } = show();
    const user = await retype("H1 2027 Appraisal");
    await user.type(box(), "{Enter}");
    await waitFor(() => expect(updateCycle).toHaveBeenCalledTimes(1));
    expect(onRenamed).toHaveBeenCalled();
  });

  it("does not send a name that has not changed, even by Enter", async () => {
    show();
    const user = userEvent.setup();
    await user.click(box());
    await user.keyboard("{Enter}");
    expect(updateCycle).not.toHaveBeenCalled();
  });
});

describe("a name the API would refuse", () => {
  it("is refused when it is too short, with no request", async () => {
    const { onClose } = show();
    const user = await retype("ab");
    await user.click(save());
    expect(await screen.findByText(PERIOD_NAME_TOO_SHORT)).toBeVisible();
    expect(updateCycle).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("is refused when it is too long, with no request", async () => {
    show();
    await retype("a".repeat(81));
    await userEvent.setup().click(save());
    expect(await screen.findByText(PERIOD_NAME_TOO_LONG)).toBeVisible();
    expect(updateCycle).not.toHaveBeenCalled();
  });

  it("clears the sentence as soon as the typing changes", async () => {
    show();
    const user = await retype("ab");
    await user.click(save());
    expect(await screen.findByText(PERIOD_NAME_TOO_SHORT)).toBeVisible();
    await user.type(box(), "c");
    expect(screen.queryByText(PERIOD_NAME_TOO_SHORT)).toBeNull();
  });
});

describe("the API's refusal", () => {
  it("is the server's own sentence on the field, with what was typed still there and nothing closed", async () => {
    const sentence = '"Q4 Appraisal" already exists.';
    updateCycle.mockRejectedValue(new ApiError(409, "conflict", sentence));
    const { onClose, onRenamed } = show();
    const user = await retype("Q4 Appraisal");
    await user.click(save());

    expect(await screen.findByText(sentence)).toBeVisible();
    expect(box().value).toBe("Q4 Appraisal");
    expect(onClose).not.toHaveBeenCalled();
    expect(onRenamed).not.toHaveBeenCalled();
    expect(save()).toBeEnabled();
  });

  it("goes away when the person types again, and a second try can succeed", async () => {
    const sentence = '"Q4 Appraisal" already exists.';
    updateCycle.mockRejectedValueOnce(new ApiError(409, "conflict", sentence));
    const { onRenamed } = show();
    const user = await retype("Q4 Appraisal");
    await user.click(save());
    expect(await screen.findByText(sentence)).toBeVisible();

    await user.type(box(), " 2");
    expect(screen.queryByText(sentence)).toBeNull();
    await user.click(save());
    await waitFor(() =>
      expect(onRenamed).toHaveBeenCalledWith("Q4 Appraisal 2"),
    );
    expect(updateCycle).toHaveBeenCalledTimes(2);
  });
});

describe("while the request is in flight", () => {
  it("cannot be closed, and the box and Cancel are off, so the answer is never lost", async () => {
    let finish: (value: unknown) => void = () => undefined;
    updateCycle.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { onClose } = show();
    const user = await retype("H1 2027 Appraisal");
    await user.click(save());

    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(box()).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      finish({});
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("sends once however many times Save is pressed", async () => {
    let finish: (value: unknown) => void = () => undefined;
    updateCycle.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    show();
    const user = await retype("H1 2027 Appraisal");
    await user.dblClick(save());
    expect(updateCycle).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish({});
    });
  });
});

describe("cancelling", () => {
  it("closes without sending", async () => {
    const { onClose } = show();
    const user = await retype("Something else");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(updateCycle).not.toHaveBeenCalled();
  });
});
