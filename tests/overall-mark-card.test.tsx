import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";

/**
 * The switch for the overall mark, in Appraisal scoring > Names of marks.
 *
 * The cases are the states that are not simply "on" and "off": a server that
 * does not know the setting, no server at all, a read that failed, somebody who
 * may look and not change, and the one sentence the card says only when it is
 * true (Self-assessment is weighted and nobody can give the mark it counts).
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
      <OverallMarkCard
        connected
        selfWeightBp={0}
        onChanged={onChanged}
        {...props}
      />
    </ToastProvider>,
  );
  return { onChanged };
};

const MARK = /Self-assessment has nothing to count/;

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
  it("reads off, and says the answers stand on their own", () => {
    mount();
    expect(screen.getByRole("switch")).not.toBeChecked();
    expect(
      screen.getByText(/Forms do not ask for an overall mark/),
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
  it("says it has nothing to count when the weight is above 0 and the mark is off", async () => {
    mount({ selfWeightBp: 2000 });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: MARK })).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: /weighted at 20%/ }),
    ).toBeInTheDocument();
  });

  it("says nothing at the default weight of 0%", () => {
    mount({ selfWeightBp: 0 });
    expect(screen.queryByRole("button", { name: MARK })).toBeNull();
  });

  it("says nothing while the mark is on, because then there is something to count", () => {
    mount({ selfWeightBp: 2000 }, { overallMark: true });
    expect(screen.queryByRole("button", { name: MARK })).toBeNull();
  });

  it("says nothing about a setting the server does not have", () => {
    mount({ selfWeightBp: 2000 }, { overallMark: null });
    expect(screen.queryByRole("button", { name: MARK })).toBeNull();
  });
});
