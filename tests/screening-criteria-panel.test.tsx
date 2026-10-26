import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { NO_CRITERIA } from "@/lib/hiring/screening/model";
import { fakeGateway, kw, savedView } from "./screening-helpers";

/**
 * An advert's criteria, whole: read, edited, previewed, saved, and re-scored.
 *
 * What these hold: nothing is saved by typing, a save names the version it started
 * from and says what it will do before it does it, a refused save keeps the work
 * and says why, a preview says what it was asked about and when the draft has
 * moved on, and saving starts a visible re-score the person can ignore.
 */

const current = { gateway: fakeGateway() };
vi.mock("@/lib/hiring/screening/use-gateway", () => ({
  useScreeningGateway: () => current.gateway,
}));
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: true, isLoading: false, user: null }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/permissions", () => ({
  useCan: () => true,
  usePermissions: () => ({ can: () => true, loading: false }),
}));

const { ScreeningWorkbench } =
  await import("@/components/hiring/screening/screening-workbench");

const open = () =>
  render(
    <ToastProvider>
      <ScreeningWorkbench postingId="p1" />
    </ToastProvider>,
  );

const ready = () => screen.findByTestId("criteria-version");

const addSkill = async (
  user: ReturnType<typeof userEvent.setup>,
  list: RegExp,
  text: string,
) => {
  const box = screen.getByRole("textbox", { name: list });
  await user.type(box, `${text}{Enter}`);
};

beforeEach(() => {
  current.gateway = fakeGateway();
});

describe("reading", () => {
  it("shows the version, who saved it and when", async () => {
    open();
    expect(await ready()).toHaveTextContent(
      "Version 3, saved 10 Oct 2026 by Fatima Bello.",
    );
  });

  it("says plainly that nobody has a score before criteria are saved", async () => {
    current.gateway = fakeGateway({
      criteria: {
        ...fakeGateway().criteria,
        get: vi.fn(async () =>
          savedView({
            version: null,
            configured: false,
            criteria: NO_CRITERIA,
            updatedAt: null,
            updatedBy: null,
          }),
        ),
      },
    });
    open();
    expect(await ready()).toHaveTextContent(
      "No criteria saved yet. Nobody has a score until you save some.",
    );
    expect(screen.getByText("No criteria yet")).toBeInTheDocument();
  });

  it("says it is advice, and that nobody is rejected until a person confirms", async () => {
    open();
    await ready();
    expect(screen.getByText("Screening is advice for a person")).toBeVisible();
    expect(
      screen.getByText(/Nobody is rejected until a person confirms it/),
    ).toBeVisible();
  });

  it("names a failure to load, with a way to try again", async () => {
    current.gateway = fakeGateway({
      criteria: {
        ...fakeGateway().criteria,
        get: vi.fn(async () => {
          throw new ApiError(503, "unavailable", "The service is busy.");
        }),
      },
    });
    open();
    expect(
      await screen.findByRole("button", { name: /Try again/ }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("criteria-version")).toBeNull();
  });
});

describe("editing and saving", () => {
  it("writes nothing while somebody types, and marks the page unsaved", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    expect(
      screen.getByRole("button", { name: "Save criteria" }),
    ).toBeDisabled();
    await addSkill(user, /^Must-have skills/, "Tax");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save criteria" })).toBeEnabled();
    expect(current.gateway.criteria.save).not.toHaveBeenCalled();
  });

  it("asks first, saying what it will do, then saves from the version it started on", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await addSkill(user, /^Must-have skills/, "Tax");
    await user.click(screen.getByRole("button", { name: "Save criteria" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Save these as version 4?",
    });
    expect(dialog).toHaveTextContent("scored again");
    expect(dialog).toHaveTextContent("Nobody is rejected by a score");
    expect(current.gateway.criteria.save).not.toHaveBeenCalled();
    await user.click(
      within(dialog).getByRole("button", { name: "Save and score" }),
    );
    await waitFor(() =>
      expect(current.gateway.criteria.save).toHaveBeenCalledTimes(1),
    );
    const [postingId, sent, base] = current.gateway.criteria.save.mock
      .calls[0] as unknown as [
      string,
      { mustHave: { label: string }[] },
      number,
    ];
    expect(postingId).toBe("p1");
    expect(base).toBe(3);
    expect(sent.mustHave.map((c) => c.label)).toEqual(["Payroll", "Tax"]);
    expect(await screen.findByText("Criteria saved")).toBeInTheDocument();
  });

  it("will not save something it can see is wrong, and marks it", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await addSkill(user, /^Nice-to-have skills/, "payroll");
    expect(screen.getByRole("button", { name: "Save criteria" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Save criteria" }));
    expect(await screen.findByText(/is in both lists/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(current.gateway.criteria.save).not.toHaveBeenCalled();
  });

  it("keeps the work and offers to reload when somebody saved first", async () => {
    current.gateway = fakeGateway({
      criteria: {
        ...fakeGateway().criteria,
        save: vi.fn(async () => {
          throw new ApiError(
            409,
            "conflict",
            "Somebody saved newer criteria, version 4, while you were editing.",
          );
        }),
      },
    });
    const user = userEvent.setup();
    open();
    await ready();
    await addSkill(user, /^Must-have skills/, "Tax");
    await user.click(screen.getByRole("button", { name: "Save criteria" }));
    await user.click(
      await screen.findByRole("button", { name: "Save and score" }),
    );
    expect(await screen.findByText("Somebody saved first")).toBeInTheDocument();
    expect(
      screen.getByText(/version 4, while you were editing/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove Tax" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reload the newest version" }),
    ).toBeInTheDocument();
  });

  it("puts the API's own words on a refusal that is not a clash", async () => {
    current.gateway = fakeGateway({
      criteria: {
        ...fakeGateway().criteria,
        save: vi.fn(async () => {
          throw new ApiError(400, "validation_failed", "Not valid.", [
            {
              field: "skills.must.0.term",
              message: "Use up to 60 characters.",
            },
          ]);
        }),
      },
    });
    const user = userEvent.setup();
    open();
    await ready();
    await addSkill(user, /^Must-have skills/, "Tax");
    await user.click(screen.getByRole("button", { name: "Save criteria" }));
    await user.click(
      await screen.findByRole("button", { name: "Save and score" }),
    );
    /* The refusal names the list it is about, beside that list's own box. */
    const message = await screen.findAllByText("Use up to 60 characters.");
    expect(message.length).toBeGreaterThanOrEqual(2);
    const list = screen
      .getByRole("textbox", { name: /^Must-have skills/ })
      .closest("div.flex-col") as HTMLElement;
    expect(list).toHaveTextContent("Use up to 60 characters.");
    expect(
      screen
        .getByRole("textbox", { name: /^Nice-to-have skills/ })
        .closest("div.flex-col"),
    ).not.toHaveTextContent("Use up to 60 characters.");
  });

  it("throws changes away only after asking", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await addSkill(user, /^Must-have skills/, "Tax");
    await user.click(screen.getByRole("button", { name: "Discard" }));
    await user.click(
      await screen.findByRole("button", { name: "Discard changes" }),
    );
    expect(screen.queryByRole("button", { name: "Remove Tax" })).toBeNull();
    expect(screen.queryByText("Unsaved changes")).toBeNull();
  });

  it("hands the editor a suggestion from the advert, applying nothing", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await user.click(
      screen.getByRole("button", { name: "Suggest from the job description" }),
    );
    expect(
      await screen.findByText("Suggestions from the advert"),
    ).toBeVisible();
    expect(current.gateway.criteria.suggest).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Unsaved changes")).toBeNull();
  });
});

describe("saving what is already saved", () => {
  it("says nothing changed and starts no re-score", async () => {
    current.gateway = fakeGateway({
      criteria: {
        ...fakeGateway().criteria,
        save: vi.fn(async () => ({ ...savedView(), changed: false })),
      },
    });
    const user = userEvent.setup();
    open();
    await ready();
    await addSkill(user, /^Must-have skills/, "Tax");
    await user.click(screen.getByRole("button", { name: "Save criteria" }));
    await user.click(
      await screen.findByRole("button", { name: "Save and score" }),
    );
    expect(await screen.findByText("Nothing changed")).toBeInTheDocument();
    expect(screen.getByText(/nobody was scored again/)).toBeInTheDocument();
    expect(current.gateway.rescore.progress).toHaveBeenCalledTimes(1);
  });

  it("says what the API tidied", async () => {
    current.gateway = fakeGateway({
      criteria: {
        ...fakeGateway().criteria,
        save: vi.fn(async () => ({
          ...savedView({ version: 4 }),
          changed: true,
          notes: ['"Tax" was listed twice; kept once.'],
        })),
      },
    });
    const user = userEvent.setup();
    open();
    await ready();
    await addSkill(user, /^Must-have skills/, "Tax");
    await user.click(screen.getByRole("button", { name: "Save criteria" }));
    await user.click(
      await screen.findByRole("button", { name: "Save and score" }),
    );
    expect(
      await screen.findByText(/"Tax" was listed twice; kept once\./),
    ).toBeInTheDocument();
  });
});

describe("previewing", () => {
  it("says how the draft would score the people who have applied, and writes nothing", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await user.click(
      screen.getByRole("button", { name: "Preview on current applicants" }),
    );
    const preview = await screen.findByTestId("criteria-preview");
    expect(preview).toHaveTextContent(
      "Tried on the newest 20 of 4,210 applicants whose CV has been read. 19 would get a score, and 1 would not, because there is too little in the CV to judge. The average would be 64.2.",
    );
    expect(within(preview).getByText("Ada Okafor")).toBeInTheDocument();
    expect(
      within(preview).getByText("Fit 91, up 31 from 60"),
    ).toBeInTheDocument();
    expect(within(preview).getByText("Matched: Payroll.")).toBeInTheDocument();
    expect(
      within(preview).getByText("No score either way"),
    ).toBeInTheDocument();
    expect(
      within(preview).getByRole("list", { name: "Scores by band" }),
    ).toBeInTheDocument();
    expect(current.gateway.criteria.save).not.toHaveBeenCalled();
    expect(current.gateway.criteria.preview).toHaveBeenCalledTimes(1);
  });

  it("says the preview is out of date once the draft moves on", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await user.click(
      screen.getByRole("button", { name: "Preview on current applicants" }),
    );
    await screen.findByTestId("criteria-preview");
    expect(
      screen.queryByText(/You changed the criteria after this/),
    ).toBeNull();
    await addSkill(user, /^Must-have skills/, "Tax");
    expect(
      screen.getByText(/You changed the criteria after this was made/),
    ).toBeInTheDocument();
  });

  it("cannot be asked for while the draft is not complete", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await user.click(screen.getByRole("button", { name: "Remove Payroll" }));
    await user.click(screen.getByRole("button", { name: "Remove Excel" }));
    const years = screen.getByRole("textbox", { name: /Years of experience/ });
    await user.clear(years);
    await user.selectOptions(
      screen.getByRole("combobox", { name: /Education level/ }),
      "Not asked",
    );
    expect(
      screen.getByRole("button", { name: "Preview on current applicants" }),
    ).toBeDisabled();
  });

  it("says all of them, not the newest of them, when the sample is everybody", async () => {
    current.gateway = fakeGateway({
      criteria: {
        ...fakeGateway().criteria,
        preview: vi.fn(async () => ({
          available: 16,
          sampled: 16,
          rows: [],
          scored: 16,
          notScorable: 0,
          mean: 55.1,
          bands: [0, 1, 0, 4, 2, 2, 3, 1, 0, 3],
        })),
      },
    });
    const user = userEvent.setup();
    open();
    await ready();
    await user.click(
      screen.getByRole("button", { name: "Preview on current applicants" }),
    );
    expect(await screen.findByTestId("criteria-preview")).toHaveTextContent(
      "Tried on all 16 applicants whose CV has been read. 16 would get a score. The average would be 55.1.",
    );
  });

  it("says a preview could not be made", async () => {
    current.gateway = fakeGateway({
      criteria: {
        ...fakeGateway().criteria,
        preview: vi.fn(async () => {
          throw new ApiError(503, "unavailable", "Scoring is busy.");
        }),
      },
    });
    const user = userEvent.setup();
    open();
    await ready();
    await user.click(
      screen.getByRole("button", { name: "Preview on current applicants" }),
    );
    expect(await screen.findByText("Scoring is busy.")).toBeInTheDocument();
  });
});

describe("re-scoring after a save", () => {
  it("shows how far it has got, says you can keep working, then goes away", async () => {
    let calls = 0;
    current.gateway = fakeGateway({
      rescore: {
        start: null,
        progress: vi.fn(async () => {
          calls += 1;
          /* Nothing running at first; running once a save asks again; then done. */
          if (calls === 1)
            return { running: false, done: 0, total: 0, cause: null };
          if (calls === 2)
            return {
              running: true,
              done: 1240,
              total: 4210,
              cause: "CRITERIA" as const,
            };
          return { running: false, done: 4210, total: 4210, cause: null };
        }),
      },
    });
    const user = userEvent.setup();
    open();
    await ready();
    await addSkill(user, /^Must-have skills/, "Tax");
    await user.click(screen.getByRole("button", { name: "Save criteria" }));
    await user.click(
      await screen.findByRole("button", { name: "Save and score" }),
    );
    const bar = (
      await screen.findByText(/Re-scoring after the criteria changed/)
    ).closest('[role="status"]') as HTMLElement;
    expect(bar).toHaveTextContent(
      "Re-scoring after the criteria changed: 1,240 of 4,210",
    );
    expect(bar).toHaveTextContent("You can keep working");
    expect(within(bar).getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "1240",
    );
    /* The editor is still usable while it runs. */
    expect(
      screen.getByRole("textbox", { name: /^Must-have skills/ }),
    ).toBeEnabled();
    await waitFor(() => expect(screen.queryByRole("progressbar")).toBeNull(), {
      timeout: 8000,
    });
  }, 15000);

  it("shows a quiet 'working' line when it only knows it is running", async () => {
    let calls = 0;
    current.gateway = fakeGateway({
      rescore: {
        start: null,
        progress: vi.fn(async () => {
          calls += 1;
          return calls === 1
            ? { running: true, done: 0, total: 0, cause: "PASS_MARK" as const }
            : { running: false, done: 0, total: 0, cause: null };
        }),
      },
    });
    open();
    expect(
      await screen.findByText("Working out who is below the new pass mark"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});

describe("a skill the form already asks about", () => {
  it("keeps the other spellings it was saved with", async () => {
    open();
    await ready();
    expect(
      screen.getByRole("list", { name: "Must-have skills" }),
    ).toHaveTextContent("also PAYE");
    expect(kw("x").weight).toBe(1);
  });
});

describe("what the progress bar says it is doing", () => {
  const running = (cause: "CRITERIA" | "PASS_MARK") => ({
    running: true,
    done: 40,
    total: 100,
    cause,
    failure: null,
  });

  it("says new criteria move scores to the new version", async () => {
    const { RescoreBar } =
      await import("@/components/hiring/screening/rescore-progress");
    render(<RescoreBar progress={running("CRITERIA")} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Scores change to the new version as they are ready",
    );
  });

  it("says a new pass mark changes nobody's score, and rejects nobody", async () => {
    const { RescoreBar } =
      await import("@/components/hiring/screening/rescore-progress");
    render(<RescoreBar progress={running("PASS_MARK")} />);
    const note = screen.getByRole("status");
    expect(note).toHaveTextContent(
      "Working out who is below the new pass mark",
    );
    expect(note).toHaveTextContent(
      "Nobody's score changes and nobody is rejected",
    );
    expect(note).not.toHaveTextContent("Scores change to the new version");
  });
});
