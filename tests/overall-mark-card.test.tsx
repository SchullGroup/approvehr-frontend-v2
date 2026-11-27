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

/** The rules are behind the info icon beside the switch's name. */
const openTip = () =>
  userEvent.click(
    screen.getByRole("button", { name: "About the overall rating" }),
  );

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
  it("reads off, with no line under it: what the person does with it is behind the icon", async () => {
    mount();
    expect(screen.getByRole("switch")).not.toBeChecked();
    expect(
      screen.queryByText(/People pick one of the rating names below/),
    ).toBeNull();
    await openTip();
    expect(
      screen.getByText(/People pick one of the rating names below\./),
    ).toBeInTheDocument();
  });

  it("is named by what it asks, not by the icon beside it", () => {
    mount();
    expect(
      screen.getByRole("switch", {
        name: "Ask for an overall rating at the end of each appraisal",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("reads on", () => {
    mount({}, { overallMark: true });
    expect(screen.getByRole("switch")).toBeChecked();
  });

  it("says behind the info icon when it applies, and that a given rating never changes", async () => {
    mount();
    await openTip();
    expect(
      screen.getByText(
        /It applies to forms opened from now on\. A rating already given never changes\./,
      ),
    ).toBeInTheDocument();
  });

  it("turns on with one press, and tells the page to read the weights again", async () => {
    const { onChanged } = mount();
    await userEvent.click(screen.getByRole("switch"));
    expect(setOverallMark).toHaveBeenCalledTimes(1);
    expect(setOverallMark).toHaveBeenCalledWith(true);
    expect(
      await screen.findByText("Overall rating switched on"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Applies to forms opened from now on."),
    ).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("turns off the same way", async () => {
    const { onChanged } = mount({}, { overallMark: true });
    await userEvent.click(screen.getByRole("switch"));
    expect(setOverallMark).toHaveBeenCalledWith(false);
    expect(
      await screen.findByText("Overall rating switched off"),
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
      screen.getByText(/Only people who manage settings can change/),
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
 * On a server that has the Manager appraisal part, a manager's form in a period
 * that weights the part asks for a mark and needs one regardless of the switch.
 * So the line under the switch and the toast name the exception. Where the
 * weights are not in, or could not be read, nothing is known, so nothing is
 * claimed about managers; and nothing anywhere says the mark is or is not
 * counted, which is the weights tab's to say.
 */
describe("where the server has the Manager appraisal part", () => {
  const has = { state: "has", label: "Line view" } as const;

  it("names the exception behind the icon, in the company's own word", async () => {
    mount({ managerAppraisal: has });
    await openTip();
    expect(
      screen.getByText(
        /People pick one of the rating names below\. Managers must give one in a period that weights Line view\./,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/is not counted/)).toBeNull();
    expect(screen.queryByText(/shown beside the score/)).toBeNull();
  });

  it("names it in the toast when the switch is turned off", async () => {
    mount({ managerAppraisal: has }, { overallMark: true });
    await userEvent.click(screen.getByRole("switch"));
    expect(setOverallMark).toHaveBeenCalledWith(false);
    expect(
      await screen.findByText(
        "Overall rating switched off, except for managers in periods that weight Line view",
      ),
    ).toBeInTheDocument();
  });

  it("keeps the toast for turning it on, which is true either way", async () => {
    mount({ managerAppraisal: has });
    await userEvent.click(screen.getByRole("switch"));
    expect(
      await screen.findByText("Overall rating switched on"),
    ).toBeInTheDocument();
  });
});

describe("where nothing is known about the part, or the server predates it", () => {
  it.each([
    ["not known", { state: "unknown" } as const],
    ["a server that predates it", { state: "none" } as const],
  ])(
    "%s: says nothing about managers, or about the mark counting",
    async (_name, part) => {
      mount({ managerAppraisal: part });
      await openTip();
      expect(
        screen.getByText(/People pick one of the rating names below\./),
      ).toBeInTheDocument();
      expect(screen.queryByText(/Managers must/)).toBeNull();
      expect(screen.queryByText(/counted/)).toBeNull();
      expect(screen.queryByText(/optional/i)).toBeNull();
    },
  );

  it("does not claim an exception when it is switched off", async () => {
    mount({ managerAppraisal: { state: "unknown" } }, { overallMark: true });
    await userEvent.click(screen.getByRole("switch"));
    expect(
      await screen.findByText("Overall rating switched off"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/except/)).toBeNull();
  });
});

describe("where there is no answer to show", () => {
  it("offers no switch for a server that does not have the setting, and does not call it off", () => {
    mount({}, { overallMark: null });
    expect(screen.queryByRole("switch")).toBeNull();
    expect(
      screen.getByText(/This server doesn't offer this setting yet/),
    ).toBeInTheDocument();
  });

  it("offers no switch with no server at all, and says why", () => {
    mount({ connected: false }, { overallMark: null });
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.getByText(/kept on the server/)).toBeInTheDocument();
    expect(screen.queryByText(/doesn't offer this setting/)).toBeNull();
  });

  it("does not say the server is behind while it is still being asked", () => {
    mount({}, { overallMark: null, loading: true });
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(screen.queryByText(/doesn't offer this setting/)).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("does not say the server is behind when the read failed", () => {
    mount({}, { overallMark: null, error: new Error("boom") });
    expect(screen.getByText(/didn't load/)).toBeInTheDocument();
    expect(screen.queryByText(/doesn't offer this setting/)).toBeNull();
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
  ] as const)("says nothing about it when the score is %s", (_name, value) => {
    mount({}, { overallMark: value });
    expect(screen.queryByText(/Self-assessment/)).toBeNull();
    expect(screen.queryByText(/nothing to count/i)).toBeNull();
  });
});
