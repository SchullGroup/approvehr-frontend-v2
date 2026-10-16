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
import type { AssessmentCheck } from "@/lib/hiring/screening/model";
import { fakeGateway } from "./screening-helpers";

/**
 * Bringing a test's results in, and typing one score by hand.
 *
 * What these hold: the file's own headings are found whatever they are called, a
 * wrong file says which column is missing, nothing is saved before the check has
 * said how many rows can be and why the others cannot, every refusal is a sentence
 * on its row, the button says how many it will save, and what was saved is on the
 * person's record with where it came from.
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
  max: 100,
  rows: [
    {
      row: 1,
      email: "ada@example.test",
      name: "Ada Okafor",
      score: 72,
      refusal: null,
      message: null,
    },
    {
      row: 2,
      email: "tunde@example.test",
      name: "Tunde Bello",
      score: 58.5,
      refusal: null,
      message: null,
    },
    {
      row: 3,
      email: "nobody@example.test",
      name: null,
      score: 40,
      refusal: "unmatched_email",
      message: "No applicant for this advert has that email.",
    },
    {
      row: 4,
      email: "ada@example.test",
      name: null,
      score: 130,
      refusal: "out_of_range",
      message: "Scores run from 0 to 100.",
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
      expect(read.rows).toEqual([{ row: 1, email: "ada@x.test", score: "72" }]);
    }
  });

  it("says which column is missing, not that every row is wrong", () => {
    expect(readAssessmentText("Name,Score\nAda,72\n")).toEqual({
      ok: false,
      problem:
        'There is no column called "Email". Add one, or start from the template.',
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

  it("reads a score as a number from 0 to 100, with a percent sign allowed", () => {
    expect(parseScoreCell("72")).toBe(72);
    expect(parseScoreCell(" 58.5 ")).toBe(58.5);
    expect(parseScoreCell("64%")).toBe(64);
    expect(parseScoreCell("seven")).toBeNull();
    expect(parseScoreCell("")).toBeNull();
    expect(parseScoreCell("1,000")).toBeNull();
  });

  it("has a template with the two columns and an example row", () => {
    const template = assessmentTemplate();
    expect(template.filename).toBe("assessment-scores-template.csv");
    expect(template.body).toContain("Email,Score");
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
    expect(screen.getByText(/A number from 0 to 100/)).toBeInTheDocument();
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
    const [, name, rows] = current.gateway.assessment.check.mock
      .calls[0] as unknown as [string, string, unknown[]];
    expect(name).toBe("bootcamp.csv");
    expect(rows).toHaveLength(4);
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
    expect(body).toContain("Row,Email,Score,Problem");
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
      await screen.findByText(/There is no column called "Email"/),
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

describe("a person's assessment score", () => {
  const subject = { kind: "application" as const, id: "a1" };

  it("shows the newest score and where each one came from", async () => {
    current.gateway.assessment.history.mockImplementation(async () => [
      {
        id: "3",
        at: "2026-10-12T09:00:00Z",
        by: "Fatima Bello",
        source: "MANUAL",
        filename: null,
        score: 80,
        note: "Re-sat the test",
      },
      {
        id: "2",
        at: "2026-10-05T09:00:00Z",
        by: "Fatima Bello",
        source: "IMPORT",
        filename: "bootcamp.csv",
        score: 64,
        note: null,
      },
    ]);
    render(
      <ToastProvider>
        <AssessmentRecord subject={subject} canEdit />
      </ToastProvider>,
    );
    expect(await screen.findByText("80")).toBeInTheDocument();
    expect(screen.getByText(/from a score typed in/)).toBeInTheDocument();
    expect(
      screen.getByText(/64, imported by Fatima Bello/),
    ).toBeInTheDocument();
  });

  it("says there is none, rather than showing 0", async () => {
    render(
      <ToastProvider>
        <AssessmentRecord subject={subject} canEdit />
      </ToastProvider>,
    );
    expect(
      await screen.findByText(/No assessment score yet/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^0$/)).toBeNull();
  });

  it("types a score in, with a note, and reads it back", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <AssessmentRecord subject={subject} canEdit />
      </ToastProvider>,
    );
    await screen.findByText(/No assessment score yet/);
    const save = screen.getByRole("button", { name: "Save the score" });
    expect(save).toBeDisabled();
    await user.type(
      screen.getByRole("textbox", { name: /Type a score/ }),
      "64",
    );
    await user.type(
      screen.getByRole("textbox", { name: /Note/ }),
      "Boot camp week 3",
    );
    await user.click(save);
    await waitFor(() =>
      expect(current.gateway.assessment.enter).toHaveBeenCalledWith(
        subject,
        64,
        "Boot camp week 3",
      ),
    );
    expect(
      await screen.findByText("Assessment score saved"),
    ).toBeInTheDocument();
    expect(current.gateway.assessment.history).toHaveBeenCalledTimes(2);
  });

  it("refuses a score out of range before asking", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <AssessmentRecord subject={subject} canEdit />
      </ToastProvider>,
    );
    await screen.findByText(/No assessment score yet/);
    await user.type(
      screen.getByRole("textbox", { name: /Type a score/ }),
      "130",
    );
    expect(screen.getByText("A number from 0 to 100.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save the score" }),
    ).toBeDisabled();
  });

  it("offers no box to somebody who may only read", async () => {
    render(
      <ToastProvider>
        <AssessmentRecord subject={subject} canEdit={false} />
      </ToastProvider>,
    );
    await screen.findByText(/No assessment score yet/);
    expect(
      screen.queryByRole("button", { name: "Save the score" }),
    ).not.toBeInTheDocument();
  });
});
