import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import {
  assessmentTemplate,
  parseScoreCell,
  readAssessmentText,
} from "@/lib/hiring/screening/assessment-file";
import type {
  AssessmentCheck,
  AssessmentHistory,
} from "@/lib/hiring/screening/model";
import { fakeGateway } from "./screening-helpers";

/**
 * Bringing a test's results in, and typing one result by hand.
 *
 * What these hold: the file's own headings are found whatever they are called, a
 * wrong file says which column is missing, nothing is saved before the check has
 * said how many rows can be and why the others cannot, every refusal is a sentence
 * on its row, the button says how many it will save, a mark is read with what it
 * is out of, and what was saved is on the person's record with where it came from.
 */

const current = { gateway: fakeGateway() };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/hiring/postings/demo-advert-req-01/assessment-scores",
}));
vi.mock("@/lib/hiring/screening/use-gateway", () => ({
  useScreeningGateway: () => current.gateway,
}));
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: false, isLoading: false, user: null }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/permissions", () => ({
  useCan: () => true,
  usePermissions: () => ({ can: () => true, loading: false }),
}));
const downloadCsv = vi.fn();
vi.mock("@/lib/csv", async (original) => {
  const real = await original<typeof import("@/lib/csv")>();
  return { ...real, downloadCsv: (...a: unknown[]) => downloadCsv(...a) };
});

const { AssessmentImportScreen } =
  await import("@/app/(app)/hiring/postings/[id]/assessment-scores/assessment-import-screen");
const { AssessmentRecord } =
  await import("@/components/hiring/screening/assessment-record");

const checkOf = (over: Partial<AssessmentCheck> = {}): AssessmentCheck => ({
  filename: "bootcamp.csv",
  token: "t",
  total: 4,
  usable: 2,
  refused: 2,
  replacing: 0,
  unchanged: 0,
  rows: [
    {
      row: 1,
      email: "ada@example.test",
      name: "Ada Okafor",
      score: 72,
      max: null,
      refusal: null,
      message: null,
      effect: "new",
    },
    {
      row: 2,
      email: "tunde@example.test",
      name: "Tunde Bello",
      score: 58.5,
      max: null,
      refusal: null,
      message: null,
      effect: "new",
    },
    {
      row: 3,
      email: "nobody@example.test",
      name: null,
      score: 40,
      max: null,
      refusal: "unmatched_email",
      message: "No applicant for this advert has that email.",
      effect: null,
    },
    {
      row: 4,
      email: "ada@example.test",
      name: null,
      score: 130,
      max: null,
      refusal: "out_of_range",
      message:
        "130 is over 100 and no maximum was given, so it cannot be read as a percentage.",
      effect: null,
    },
  ],
  ...over,
});

const file = (text: string, name = "bootcamp.csv") =>
  new File([text], name, { type: "text/csv" });

const open = () =>
  render(
    <ToastProvider>
      <AssessmentImportScreen id="demo-advert-req-01" />
    </ToastProvider>,
  );

beforeEach(() => {
  current.gateway = fakeGateway();
  current.gateway.assessment.check.mockImplementation(async () => checkOf());
  current.gateway.assessment.commit.mockImplementation(async () => ({
    saved: 2,
    unchanged: 0,
    refused: 2,
    movedBelow: 5,
  }));
  downloadCsv.mockReset();
});

describe("the file", () => {
  it("finds the email and score columns whatever they are called", () => {
    const read = readAssessmentText("E-mail Address;Marks\nada@x.test;72\n");
    expect(read).toMatchObject({ ok: true });
    if (read.ok) {
      expect(read.rows).toEqual([
        {
          row: 1,
          email: "ada@x.test",
          reference: "",
          score: "72",
          max: "",
          test: "",
          date: "",
        },
      ]);
    }
  });

  it("reads an application reference, what it is out of, the test and the day", () => {
    const read = readAssessmentText(
      "Reference,Marks,Out of,Test name,Date taken\nAPP-J7ET3745,42,60,Aptitude,2026-10-12\n",
    );
    expect(read).toMatchObject({ ok: true });
    if (read.ok) {
      expect(read.rows).toEqual([
        {
          row: 1,
          email: "",
          reference: "APP-J7ET3745",
          score: "42",
          max: "60",
          test: "Aptitude",
          date: "2026-10-12",
        },
      ]);
    }
  });

  it("says which column is missing, not that every row is wrong", () => {
    expect(readAssessmentText("Name,Score\nAda,72\n")).toEqual({
      ok: false,
      problem:
        'There is no column called "Email" or "Reference". Add one, or start from the template.',
    });
    expect(readAssessmentText("Email,Name\nada@x.test,Ada\n")).toEqual({
      ok: false,
      problem:
        'There is no column called "Score". Add one, or start from the template.',
    });
    expect(readAssessmentText("Email,Score\n")).toEqual({
      ok: false,
      problem: "The file has no rows to read.",
    });
  });

  it("reads a score as a number, a percentage or a mark out of something", () => {
    expect(parseScoreCell("72")).toEqual({ score: 72, max: null });
    expect(parseScoreCell(" 58.5 ")).toEqual({ score: 58.5, max: null });
    expect(parseScoreCell("64%")).toEqual({ score: 64, max: null });
    expect(parseScoreCell("42/60")).toEqual({ score: 42, max: 60 });
    expect(parseScoreCell("seven")).toBeNull();
    expect(parseScoreCell("")).toBeNull();
    expect(parseScoreCell("4/x")).toBeNull();
  });

  it("has a template with the columns the API reads and an example row", () => {
    const template = assessmentTemplate();
    expect(template.filename).toBe("assessment-scores-template.csv");
    expect(template.body).toContain(
      "Applicant email,Application reference,Score,Out of,Test,Date taken",
    );
    expect(template.body).toContain("ada.okafor@example.com");
  });
});

describe("the three steps", () => {
  it("offers the template and says what each column is", async () => {
    const user = userEvent.setup();
    open();
    expect(
      screen.getByRole("heading", { name: "Choose your file" }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Download the template" }),
    );
    expect(downloadCsv).toHaveBeenCalledWith("t.csv", "Email,Score\n");
    expect(
      screen.getByText(/read as a percentage, 0 to 100/),
    ).toBeInTheDocument();
  });

  it("checks the file before anything is saved, and says how many can be", async () => {
    const user = userEvent.setup();
    open();
    await user.upload(
      screen.getByLabelText("Assessment scores file"),
      file(
        "Email,Score\nada@example.test,72\ntunde@example.test,58.5\nnobody@example.test,40\nada@example.test,130\n",
      ),
    );
    expect(
      await screen.findByText("bootcamp.csv: 4 rows checked"),
    ).toBeInTheDocument();
    expect(current.gateway.assessment.check).toHaveBeenCalledTimes(1);
    const [, name, rows, options] = current.gateway.assessment.check.mock
      .calls[0] as unknown as [string, string, unknown[], { test: string }];
    expect(name).toBe("bootcamp.csv");
    expect(rows).toHaveLength(4);
    expect(options).toEqual({ test: "" });
    expect(current.gateway.assessment.commit).not.toHaveBeenCalled();
    expect(
      screen.getByText(/2 scores can be saved\. 2 rows cannot/),
    ).toBeInTheDocument();
  });

  it("lists each row it cannot use, with its number, its email and the reason", async () => {
    const user = userEvent.setup();
    open();
    await user.upload(
      screen.getByLabelText("Assessment scores file"),
      file("Email,Score\na@x.test,1\n"),
    );
    await screen.findByText("bootcamp.csv: 4 rows checked");
    const table = screen.getByRole("table", {
      name: /Rows of the file that cannot be saved/,
    });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("3");
    expect(rows[0]).toHaveTextContent("nobody@example.test");
    expect(rows[0]).toHaveTextContent("No applicant has this email");
    expect(rows[0]).toHaveTextContent(
      "No applicant for this advert has that email.",
    );
    expect(rows[1]).toHaveTextContent("The score is outside the range");
    expect(rows[1]).toHaveTextContent("no maximum was given");
  });

  it("sends the test's name chosen on screen with both the check and the save", async () => {
    const user = userEvent.setup();
    open();
    await user.type(
      screen.getByRole("textbox", { name: /Test name/ }),
      "Aptitude test",
    );
    await user.upload(
      screen.getByLabelText("Assessment scores file"),
      file("Email,Score\na@x.test,1\n"),
    );
    await screen.findByText("bootcamp.csv: 4 rows checked");
    await user.click(screen.getByRole("button", { name: "Save 2 scores" }));
    await waitFor(() =>
      expect(current.gateway.assessment.commit).toHaveBeenCalledTimes(1),
    );
    const checked = current.gateway.assessment.check.mock
      .calls[0] as unknown as [string, string, unknown[], { test: string }];
    const saved = current.gateway.assessment.commit.mock
      .calls[0] as unknown as [string, unknown, unknown[], { test: string }];
    expect(checked[3]).toEqual({ test: "Aptitude test" });
    expect(saved[3]).toEqual({ test: "Aptitude test" });
  });

  it("says how many replace a result and how many change nothing", async () => {
    current.gateway.assessment.check.mockImplementation(async () =>
      checkOf({
        usable: 3,
        refused: 1,
        replacing: 1,
        unchanged: 1,
        rows: [
          { ...checkOf().rows[0]!, effect: "replaces" as const },
          {
            ...checkOf().rows[1]!,
            max: 60,
            score: 42,
            effect: "unchanged" as const,
          },
          checkOf().rows[0]!,
          checkOf().rows[2]!,
        ].map((row, index) => ({ ...row, row: index + 1 })),
      }),
    );
    const user = userEvent.setup();
    open();
    await user.upload(
      screen.getByLabelText("Assessment scores file"),
      file("Email,Score\na@x.test,1\n"),
    );
    await screen.findByText("bootcamp.csv: 4 rows checked");
    expect(
      screen.getByText(/1 replaces a result the person already has/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/1 is already on file exactly as the file says/),
    ).toBeInTheDocument();
    /* The one that changes nothing is not counted in what will be saved. */
    expect(screen.getByRole("button", { name: "Save 2 scores" })).toBeEnabled();
  });

  it("offers the rows to fix as a file", async () => {
    const user = userEvent.setup();
    open();
    await user.upload(
      screen.getByLabelText("Assessment scores file"),
      file("Email,Score\na@x.test,1\n"),
    );
    await screen.findByText("bootcamp.csv: 4 rows checked");
    await user.click(
      screen.getByRole("button", { name: "Download these rows" }),
    );
    expect(downloadCsv).toHaveBeenCalledTimes(1);
    const [filename, body] = downloadCsv.mock.calls[0] as [string, string];
    expect(filename).toBe("assessment-rows-to-fix.csv");
    expect(body).toContain("Row,Email or reference,Score,Problem");
    expect(body).toContain("nobody@example.test");
  });

  it("saves only what the check said was usable, and says how many on the button", async () => {
    const user = userEvent.setup();
    open();
    await user.upload(
      screen.getByLabelText("Assessment scores file"),
      file("Email,Score\na@x.test,1\n"),
    );
    await screen.findByText("bootcamp.csv: 4 rows checked");
    await user.click(screen.getByRole("button", { name: "Save 2 scores" }));
    await waitFor(() =>
      expect(current.gateway.assessment.commit).toHaveBeenCalledTimes(1),
    );
    expect(await screen.findByText("2 scores saved")).toBeInTheDocument();
    expect(
      screen.getByText(
        /5 people are now below the pass mark\. Nobody is rejected/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/2 rows were not saved/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /See who is below the pass mark/ }),
    ).toHaveAttribute(
      "href",
      "/hiring/postings/demo-advert-req-01/below-pass-mark",
    );
  });

  it("cannot save a file with nothing usable in it", async () => {
    current.gateway.assessment.check.mockImplementation(async () =>
      checkOf({
        usable: 0,
        refused: 4,
        rows: checkOf().rows.map((row) => ({
          ...row,
          score: null,
          refusal: "unmatched_email" as const,
        })),
      }),
    );
    const user = userEvent.setup();
    open();
    await user.upload(
      screen.getByLabelText("Assessment scores file"),
      file("Email,Score\na@x.test,1\n"),
    );
    await screen.findByText("bootcamp.csv: 4 rows checked");
    expect(
      screen.getByText(/Not one row can be used, so nothing would be saved/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save 0 scores" }),
    ).toBeDisabled();
  });

  it("says a file with a missing column is not the one it wanted, and checks nothing", async () => {
    const user = userEvent.setup();
    open();
    await user.upload(
      screen.getByLabelText("Assessment scores file"),
      file("Name,Result\nAda,72\n"),
    );
    expect(
      await screen.findByText(
        /There is no column called "Email" or "Reference"/,
      ),
    ).toBeInTheDocument();
    expect(current.gateway.assessment.check).not.toHaveBeenCalled();
  });

  it("says why when the check itself is refused", async () => {
    current.gateway.assessment.check.mockImplementation(async () => {
      throw new ApiError(503, "unavailable", "Scoring is busy. Try again.");
    });
    const user = userEvent.setup();
    open();
    await user.upload(
      screen.getByLabelText("Assessment scores file"),
      file("Email,Score\na@x.test,1\n"),
    );
    expect(
      await screen.findByText("Scoring is busy. Try again."),
    ).toBeInTheDocument();
  });

  it("keeps the check on screen and says why when the save is refused", async () => {
    current.gateway.assessment.commit.mockImplementation(async () => {
      throw new ApiError(
        409,
        "conflict",
        "The file is not the one that was checked. Check it again.",
      );
    });
    const user = userEvent.setup();
    open();
    await user.upload(
      screen.getByLabelText("Assessment scores file"),
      file("Email,Score\na@x.test,1\n"),
    );
    await screen.findByText("bootcamp.csv: 4 rows checked");
    await user.click(screen.getByRole("button", { name: "Save 2 scores" }));
    expect(
      await screen.findByText(/The file is not the one that was checked/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save 2 scores" })).toBeEnabled();
  });
});

describe("a person's assessment results", () => {
  const subject = { kind: "application" as const, id: "a1" };

  const history = (
    over: Partial<AssessmentHistory> = {},
  ): AssessmentHistory => ({
    current: [
      {
        test: "Aptitude test",
        score: 42,
        max: 60,
        percent: 70,
        takenOn: "2026-10-12",
        source: "MANUAL",
        enteredAt: "2026-10-12T09:00:00Z",
      },
    ],
    entries: [
      {
        id: "3",
        at: "2026-10-12T09:00:00Z",
        by: "Fatima Bello",
        source: "MANUAL",
        test: "Aptitude test",
        score: 42,
        max: 60,
        percent: 70,
        takenOn: "2026-10-12",
        cleared: false,
      },
      {
        id: "2",
        at: "2026-10-05T09:00:00Z",
        by: "Fatima Bello",
        source: "IMPORT",
        test: "Aptitude test",
        score: 64,
        max: null,
        percent: 64,
        takenOn: null,
        cleared: false,
      },
    ],
    ...over,
  });

  it("shows each test's result with what it was out of, and where every value came from", async () => {
    current.gateway.assessment.history.mockImplementation(async () =>
      history(),
    );
    render(
      <ToastProvider>
        <AssessmentRecord subject={subject} canEdit />
      </ToastProvider>,
    );
    expect(await screen.findByText("42 out of 60 (70%)")).toBeInTheDocument();
    expect(screen.getByText(/taken 12 Oct 2026, typed in/)).toBeInTheDocument();
    expect(
      screen.getByText(/Aptitude test: 64%, imported by Fatima Bello/),
    ).toBeInTheDocument();
  });

  it("says a removed result was removed, and shows no result in use", async () => {
    current.gateway.assessment.history.mockImplementation(async () =>
      history({
        current: [],
        entries: [
          {
            id: "4",
            at: "2026-10-13T09:00:00Z",
            by: "Fatima Bello",
            source: "MANUAL",
            test: "Aptitude test",
            score: null,
            max: null,
            percent: null,
            takenOn: null,
            cleared: true,
          },
        ],
      }),
    );
    render(
      <ToastProvider>
        <AssessmentRecord subject={subject} canEdit />
      </ToastProvider>,
    );
    expect(
      await screen.findByText(/No result is in use now/),
    ).toBeInTheDocument();
  });

  it("says there is none, rather than showing 0", async () => {
    render(
      <ToastProvider>
        <AssessmentRecord subject={subject} canEdit />
      </ToastProvider>,
    );
    expect(
      await screen.findByText(/No assessment result yet/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^0$/)).toBeNull();
  });

  it("types a result in with what it is out of, the test and the day, and reads it back", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <AssessmentRecord subject={subject} canEdit />
      </ToastProvider>,
    );
    await screen.findByText(/No assessment result yet/);
    const save = screen.getByRole("button", { name: "Save the result" });
    expect(save).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: /^Score/ }), "42");
    await user.type(screen.getByRole("textbox", { name: /Out of/ }), "60");
    await user.type(
      screen.getByRole("textbox", { name: /^Test/ }),
      "Aptitude test",
    );
    await user.type(screen.getByLabelText(/Date taken/), "2026-10-12");
    await user.click(save);
    await waitFor(() =>
      expect(current.gateway.assessment.enter).toHaveBeenCalledWith(subject, {
        test: "Aptitude test",
        score: 42,
        max: 60,
        takenOn: "2026-10-12",
      }),
    );
    expect(
      await screen.findByText("Assessment result saved"),
    ).toBeInTheDocument();
    expect(current.gateway.assessment.history).toHaveBeenCalledTimes(2);
  });

  it("sends nothing for the test or the day when they are left empty", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <AssessmentRecord subject={subject} canEdit />
      </ToastProvider>,
    );
    await screen.findByText(/No assessment result yet/);
    await user.type(screen.getByRole("textbox", { name: /^Score/ }), "64");
    await user.click(screen.getByRole("button", { name: "Save the result" }));
    await waitFor(() =>
      expect(current.gateway.assessment.enter).toHaveBeenCalledWith(subject, {
        test: null,
        score: 64,
        max: null,
        takenOn: null,
      }),
    );
  });

  it("refuses a score over 100 with no maximum, and one over its maximum, before asking", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <AssessmentRecord subject={subject} canEdit />
      </ToastProvider>,
    );
    await screen.findByText(/No assessment result yet/);
    await user.type(screen.getByRole("textbox", { name: /^Score/ }), "130");
    expect(screen.getByText("A number from 0 to 100.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save the result" }),
    ).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: /Out of/ }), "200");
    expect(screen.queryByText("A number from 0 to 100.")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Save the result" }),
    ).toBeEnabled();
    await user.clear(screen.getByRole("textbox", { name: /Out of/ }));
    await user.type(screen.getByRole("textbox", { name: /Out of/ }), "100");
    await user.clear(screen.getByRole("textbox", { name: /^Score/ }));
    await user.type(screen.getByRole("textbox", { name: /^Score/ }), "130");
    expect(screen.getByText("A number from 0 to 100.")).toBeInTheDocument();
  });

  it("offers no box to somebody who may only read", async () => {
    render(
      <ToastProvider>
        <AssessmentRecord subject={subject} canEdit={false} />
      </ToastProvider>,
    );
    await screen.findByText(/No assessment result yet/);
    expect(
      screen.queryByRole("button", { name: "Save the result" }),
    ).not.toBeInTheDocument();
  });
});
