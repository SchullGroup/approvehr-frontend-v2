import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";

/**
 * The switch for the overall mark, in Appraisal scoring > Names of marks.
 *
 * The cases are the states that are not simply "on" and "off": a server that
 * does not know the setting, no server at all, a read that failed, somebody who
 * may look and not change, and that the card says nothing about Self-assessment:
 * the part is read from the answers when there is no overall mark, so a warning
 * that it "has nothing to count" would describe something that no longer happens.
 */

const setOverallMark = vi.fn<(next: boolean) => Promise<object>>(
  async () => ({}),
);

type FeatureState = {
  overallMark: boolean | null;
  editable: boolean;
  loading: boolean;
  saving: string | null;
  error: unknown;
};
let features: FeatureState = {
  overallMark: false,
  editable: true,
  loading: false,
  saving: null,
  error: null,
};
vi.mock("@/lib/store/features", async (original) => ({
  ...(await original<typeof import("@/lib/store/features")>()),
  useFeatureSettings: () => ({ ...features, setOverallMark }),
}));

import { OverallMarkCard } from "@/app/(app)/settings/performance/overall-mark-card";

const mount = (
  props: Partial<Parameters<typeof OverallMarkCard>[0]> = {},
  over: Partial<FeatureState> = {},
) => {
  features = { ...features, ...over };
  const onChanged = vi.fn();
  render(
    <ToastProvider>
      <OverallMarkCard connected onChanged={onChanged} {...props} />
    </ToastProvider>,
  );
  return { onChanged };
};

beforeEach(() => {
  vi.clearAllMocks();
  features = {
    overallMark: false,
    editable: true,
    loading: false,
    saving: null,
    error: null,
  };
});

describe("the switch", () => {
  it("reads off, and for a server with no Manager appraisal part says the answers stand on their own", () => {
    mount();
    expect(screen.getByRole("switch")).not.toBeChecked();
    expect(
      screen.getByText(
        "Forms do not ask for an overall mark. The answers stand on their own.",
      ),
    ).toBeInTheDocument();
  });

  it("reads on, and says the form ends with a page for it", () => {
    mount({}, { overallMark: true });
    expect(screen.getByRole("switch")).toBeChecked();
    expect(
      screen.getByText(
        /Each form ends with a page asking for one overall mark/,
      ),
    ).toBeInTheDocument();
  });

  it("says what it does not do: a mark is shown beside the score, and a given one is never touched", () => {
    /* A server with no Manager appraisal part: a manager's overall mark is
       never counted there, and the card says what it always did. */
    mount();
    expect(
      screen.getByText(/shown beside the score and is not counted in it/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/A mark already given is never removed or changed/),
    ).toBeInTheDocument();
  });

  it("turns on with one press, and tells the page to read the weights again", async () => {
    const { onChanged } = mount();
    await userEvent.click(screen.getByRole("switch"));
    expect(setOverallMark).toHaveBeenCalledTimes(1);
    expect(setOverallMark).toHaveBeenCalledWith(true);
    expect(
      await screen.findByText("Appraisal forms will end with an overall mark"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "It applies to the next form anybody opens. Marks already given are not touched.",
      ),
    ).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("turns off the same way", async () => {
    const { onChanged } = mount({}, { overallMark: true });
    await userEvent.click(screen.getByRole("switch"));
    expect(setOverallMark).toHaveBeenCalledWith(false);
    expect(
      await screen.findByText(
        "Appraisal forms will not ask for an overall mark",
      ),
    ).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("shows the server's refusal and does not claim a change", async () => {
    setOverallMark.mockRejectedValueOnce(new Error("You cannot change that."));
    const { onChanged } = mount();
    await userEvent.click(screen.getByRole("switch"));
    expect(await screen.findByText("That was refused")).toBeInTheDocument();
    expect(screen.getByText("You cannot change that.")).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("is read-only for somebody who may not change company settings", () => {
    mount({}, { editable: false });
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(
      screen.getByText(/needs the Manage settings permission/),
    ).toBeInTheDocument();
  });

  it("is held while it is saving", () => {
    mount({}, { saving: "overallMark" });
    expect(screen.getByRole("switch")).toBeDisabled();
  });
});

/**
 * The card where a manager's form can ask for a mark whatever the switch says.
 *
 * On a server that has the Manager appraisal part the switch decides what a form
 * offers, and a manager's form in a period that weights the part asks for a mark
 * and needs one regardless. So the header, the line under the switch and the
 * toast all name the exception together: a header saying "forms do not ask for an
 * overall mark" beside a line saying managers have to give one is two claims at
 * once. And where the weights are not in, or could not be read, nothing is known,
 * so nothing is claimed about whether forms ask or whether the mark counts.
 */
describe("where the server has the Manager appraisal part", () => {
  const has = { state: "has", label: "Line view" } as const;

  it("names the exception in the header when it is off, so it does not say forms do not ask while a manager's form does", () => {
    mount({ managerAppraisal: has });
    expect(
      screen.getByText(
        "Forms do not ask for an overall mark, except a manager's form in a period that weights Line view. Otherwise the answers stand on their own.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Forms do not ask for an overall mark. The answers stand on their own.",
      ),
    ).toBeNull();
  });

  it("names it under the switch, in the company's own word, and stops saying the mark is not counted", () => {
    mount({ managerAppraisal: has });
    expect(
      screen.getByText(
        "The person picks one of the names below after the questions. It is optional, except for managers in a period that weights Line view: they have to give one.",
      ),
    ).toBeInTheDocument();
    /* Whether the mark counts is the weights tab's to say, in the API's words:
       it counts where a period weights the part, and a sentence that says it
       never does would be false there. */
    expect(screen.queryByText(/is not counted in it/)).toBeNull();
    expect(screen.queryByText(/shown beside the score/)).toBeNull();
  });

  it("names it in the toast when the switch is turned off", async () => {
    mount({ managerAppraisal: has }, { overallMark: true });
    await userEvent.click(screen.getByRole("switch"));
    expect(setOverallMark).toHaveBeenCalledWith(false);
    expect(
      await screen.findByText(
        "Appraisal forms will not ask for an overall mark, except a manager's form in a period that weights Line view",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Appraisal forms will not ask for an overall mark"),
    ).toBeNull();
  });

  it("keeps the toast for turning it on, which is true either way", async () => {
    mount({ managerAppraisal: has });
    await userEvent.click(screen.getByRole("switch"));
    expect(
      await screen.findByText("Appraisal forms will end with an overall mark"),
    ).toBeInTheDocument();
  });

  it("says nothing different on the header when it is on", () => {
    mount({ managerAppraisal: has }, { overallMark: true });
    expect(
      screen.getByText(
        "Each form ends with a page asking for one overall mark.",
      ),
    ).toBeInTheDocument();
  });
});

describe("where nothing is known about the part: the weights are not in, or could not be read", () => {
  const unknown = { state: "unknown" } as const;

  it("says nothing about whether a form asks for a mark when it is off", () => {
    mount({ managerAppraisal: unknown });
    expect(screen.getByRole("switch")).not.toBeChecked();
    expect(
      screen.getByText(
        "Whether each form ends with a page asking for one overall mark.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/stand on their own/)).toBeNull();
    expect(screen.queryByText(/do not ask for an overall mark/)).toBeNull();
  });

  it("says nothing about the mark being optional or being counted, on a server that may well have the part", () => {
    mount({ managerAppraisal: unknown });
    expect(
      screen.getByText(
        "The person picks one of the names below after the questions.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/is not counted in it/)).toBeNull();
    expect(screen.queryByText(/shown beside the score/)).toBeNull();
    expect(screen.queryByText(/optional/i)).toBeNull();
    expect(screen.queryByText(/have to give one/)).toBeNull();
  });

  it("does not claim forms will not ask when it is switched off", async () => {
    mount({ managerAppraisal: unknown }, { overallMark: true });
    await userEvent.click(screen.getByRole("switch"));
    expect(
      await screen.findByText("Overall mark switched off"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/will not ask/)).toBeNull();
  });

  it("is not the same as a loaded set with no row, which is a server that predates the part", () => {
    mount({ managerAppraisal: { state: "none" } });
    expect(
      screen.getByText(/shown beside the score and is not counted in it/),
    ).toBeInTheDocument();
  });
});

describe("where there is no answer to show", () => {
  it("offers no switch for a server that does not have the setting, and does not call it off", () => {
    mount({}, { overallMark: null });
    expect(screen.queryByRole("switch")).toBeNull();
    expect(
      screen.getByText(
        /This server has not been updated to offer this setting yet/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/The answers stand on their own/)).toBeNull();
  });

  it("offers no switch with no server at all, and says why", () => {
    mount({ connected: false }, { overallMark: null });
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.getByText(/kept on the server/)).toBeInTheDocument();
    expect(screen.queryByText(/has not been updated/)).toBeNull();
  });

  it("does not say the server is behind while it is still being asked", () => {
    mount({}, { overallMark: null, loading: true });
    expect(screen.getByText("Reading the setting")).toBeInTheDocument();
    expect(screen.queryByText(/has not been updated/)).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("does not say the server is behind when the read failed", () => {
    mount({}, { overallMark: null, error: new Error("boom") });
    expect(screen.getByText(/could not be read/)).toBeInTheDocument();
    expect(screen.queryByText(/has not been updated/)).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });
});

describe("what it says about Self-assessment", () => {
  /* Nothing, whatever is set. Self-assessment counts from the answers when there
     is no overall mark, so there is no state in which the card has a warning true
     enough to give. It used to give one, and was wrong the day the part began to
     read the answers. */
  it.each([
    ["off", false],
    ["on", true],
    ["not said", null],
  ] as const)("says nothing about it when the mark is %s", (_name, value) => {
    mount({}, { overallMark: value });
    expect(screen.queryByText(/Self-assessment/)).toBeNull();
    expect(screen.queryByText(/nothing to count/i)).toBeNull();
  });
});
