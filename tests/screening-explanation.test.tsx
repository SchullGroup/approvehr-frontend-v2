import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { explanation, fakeGateway } from "./screening-helpers";

/**
 * Why somebody has the score they have.
 *
 * What these hold: each thing asked for says matched, partly, missing or unknown
 * and why, the matched words are marked inside a short stretch of the CV and
 * nothing more of the CV is shown, unknown is left out of the sum and said to be,
 * a stale score says which version it is from, and every case with no score has a
 * next step.
 */

const current = { gateway: fakeGateway() };
vi.mock("@/lib/hiring/screening/use-gateway", () => ({
  useScreeningGateway: () => current.gateway,
}));

const { ExplanationView, ExplanationDisclosure, markedParts } =
  await import("@/components/hiring/screening/explanation-panel");

beforeEach(() => {
  current.gateway = fakeGateway();
});

describe("a scored person", () => {
  it("writes the score, the formula, the version and the coverage", () => {
    render(<ExplanationView explanation={explanation()} />);
    const view = screen.getByTestId("explanation");
    expect(view).toHaveTextContent("Fit score 72 out of 100");
    expect(view).toHaveTextContent(
      "How it is worked out: Credit earned out of the weight that could be judged.",
    );
    expect(view).toHaveTextContent("version 3 of the criteria");
    expect(view).toHaveTextContent("It could judge 80% of what you asked for.");
    expect(view).toHaveTextContent("It decides nothing");
  });

  it("warns that a low coverage is not the whole picture", () => {
    render(<ExplanationView explanation={explanation({ coverage: 30 })} />);
    expect(screen.getByText(/not as the whole picture/)).toBeInTheDocument();
  });

  it("gives each thing asked for a verdict", () => {
    render(<ExplanationView explanation={explanation()} />);
    const must = screen.getByRole("region", { name: "Must-have skills" });
    expect(within(must).getByText("Payroll")).toBeInTheDocument();
    expect(within(must).getByText("Matched")).toBeInTheDocument();
    expect(within(must).getByText("Missing")).toBeInTheDocument();
    const nice = screen.getByRole("region", { name: "Nice-to-have skills" });
    expect(within(nice).getByText("Partly")).toBeInTheDocument();
  });

  it("says how sure the match is, for a match, and not for a miss", () => {
    render(<ExplanationView explanation={explanation()} />);
    expect(screen.getByText("Sure of this match")).toBeInTheDocument();
    expect(screen.getByText("Not very sure of this match")).toBeInTheDocument();
    expect(screen.getAllByText(/of this match/)).toHaveLength(2);
  });

  it("marks the matched words inside a short stretch of the CV", () => {
    render(<ExplanationView explanation={explanation()} />);
    const mark = screen.getByText("payroll", { selector: "mark" });
    expect(mark).toBeInTheDocument();
    const quote = mark.closest("blockquote");
    expect(quote).toHaveTextContent("ran monthly payroll for 400 staff");
    expect(quote?.textContent?.length).toBeLessThan(80);
  });

  it("splits a stretch around every word to mark, longest first, any case", () => {
    expect(
      markedParts("Ran PAYE and Payroll for staff", ["Payroll", "PAYE"]),
    ).toEqual([
      { text: "Ran ", marked: false },
      { text: "PAYE", marked: true },
      { text: " and ", marked: false },
      { text: "Payroll", marked: true },
      { text: " for staff", marked: false },
    ]);
    expect(markedParts("nothing here", [])).toEqual([
      { text: "nothing here", marked: false },
    ]);
    expect(markedParts("a.b", ["."])).toHaveLength(3);
  });

  it("says where words came from when it was not the CV", () => {
    render(
      <ExplanationView
        explanation={explanation({
          items: [
            {
              id: "must:0",
              kind: "MUST_HAVE",
              label: "Payroll",
              verdict: "MATCHED",
              confidence: "MEDIUM",
              value: 1,
              evidence: [
                { source: "answer", text: "I run payroll", marks: ["payroll"] },
              ],
              note: null,
            },
          ],
        })}
      />,
    );
    expect(
      screen.getByText("(From an answer on the form)"),
    ).toBeInTheDocument();
  });

  it("leaves 'unknown' out of the score and says so, not as a miss", () => {
    render(<ExplanationView explanation={explanation()} />);
    const years = screen.getByRole("region", { name: "Years of experience" });
    expect(within(years).getByText("Unknown")).toBeInTheDocument();
    expect(
      within(years).getByText("Left out of the score"),
    ).toBeInTheDocument();
    expect(within(years).queryByText("Missing")).not.toBeInTheDocument();
    expect(years).toHaveTextContent("Left out: nothing in it could be judged");
  });

  it("says how much of the 100 each part carries, out of the parts judged", () => {
    render(<ExplanationView explanation={explanation()} />);
    expect(
      screen.getByRole("region", { name: "Must-have skills" }),
    ).toHaveTextContent("Counts for 77 of the 100");
    expect(
      screen.getByRole("region", { name: "Nice-to-have skills" }),
    ).toHaveTextContent("Counts for 23 of the 100");
  });

  it("says a stale score is from an older version, and which", () => {
    render(
      <ExplanationView
        explanation={explanation({
          stale: true,
          version: 2,
          currentVersion: 3,
        })}
      />,
    );
    const note = screen.getByText("Scored with an older version").parentElement;
    expect(note).toHaveTextContent("version 2");
    expect(note).toHaveTextContent("now on version 3");
    expect(note).toHaveTextContent("A new score is on its way");
  });

  it("says where somebody stands against the pass mark, and that a person decides", () => {
    render(
      <ExplanationView
        explanation={explanation({
          standing: {
            below: true,
            reasons: [{ kind: "FIT", text: "Fit 41, and the pass mark is 50" }],
            kept: null,
          },
        })}
      />,
    );
    const note = screen.getByText("Below the pass mark").parentElement;
    expect(note).toHaveTextContent("Fit 41, and the pass mark is 50");
    expect(note).toHaveTextContent("A person decides what happens next.");
  });

  it("says who kept somebody in the running, and why", () => {
    render(
      <ExplanationView
        explanation={explanation({
          standing: {
            below: false,
            reasons: [],
            kept: {
              reason: "Strong portfolio",
              at: "2026-10-10T09:00:00Z",
              by: "Fatima Bello",
            },
          },
        })}
      />,
    );
    expect(
      screen.getByText("Kept in the running").parentElement,
    ).toHaveTextContent(
      "Fatima Bello kept them in the running, and said: Strong portfolio",
    );
  });
});

describe("somebody with no score", () => {
  const none = (
    status:
      | "WAITING_FOR_TEXT"
      | "NO_TEXT"
      | "NO_CV"
      | "NO_CRITERIA"
      | "COULD_NOT_READ",
    extraction = {},
  ) =>
    explanation({
      status,
      score: null,
      coverage: null,
      items: [],
      groups: [],
      extraction: {
        state: "READY",
        reason: null,
        canRetry: false,
        ...extraction,
      },
    });

  it("offers a way to add criteria when there are none", () => {
    render(
      <ExplanationView
        explanation={none("NO_CRITERIA")}
        criteriaHref="/hiring/postings/p1?tab=screening"
      />,
    );
    expect(screen.getByRole("link", { name: "Add criteria" })).toHaveAttribute(
      "href",
      "/hiring/postings/p1?tab=screening",
    );
  });

  it("says a CV with no text needs a person to read it, and gives the reason", () => {
    render(
      <ExplanationView
        explanation={none("NO_TEXT", {
          state: "NO_TEXT",
          reason: "This CV is a scan of paper.",
        })}
      />,
    );
    const view = screen.getByTestId("explanation");
    expect(view).toHaveTextContent("Needs a person to read it");
    expect(view).toHaveTextContent("This CV is a scan of paper.");
    expect(view).not.toHaveTextContent("Fit score");
  });

  it("says a CV still waiting to be read is waiting", () => {
    render(
      <ExplanationView
        explanation={none("WAITING_FOR_TEXT", { state: "PENDING" })}
      />,
    );
    expect(screen.getByTestId("explanation")).toHaveTextContent(
      "Waiting for CV text",
    );
  });

  it("gives the reason a file could not be read, and a retry where there is one", async () => {
    const retry = vi.fn(async () => undefined);
    const user = userEvent.setup();
    render(
      <ExplanationView
        explanation={none("COULD_NOT_READ", {
          state: "COULD_NOT_READ",
          reason: "The file is protected with a password.",
          canRetry: true,
        })}
        onRetryReading={retry}
      />,
    );
    expect(screen.getByTestId("explanation")).toHaveTextContent(
      "The file is protected with a password.",
    );
    await user.click(
      screen.getByRole("button", { name: "Try reading it again" }),
    );
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("offers no retry where the API offers none", () => {
    render(
      <ExplanationView
        explanation={none("COULD_NOT_READ", {
          state: "COULD_NOT_READ",
          reason: "Damaged.",
          canRetry: true,
        })}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Try reading it again/ }),
    ).not.toBeInTheDocument();
  });

  it("says a person with no CV has nothing to read, never a zero", () => {
    render(<ExplanationView explanation={none("NO_CV", { state: "NO_CV" })} />);
    expect(screen.getByTestId("explanation")).not.toHaveTextContent(/\b0\b/);
  });
});

describe("on a queue row", () => {
  it("asks for nothing until it is opened, then once", async () => {
    const user = userEvent.setup();
    render(
      <ExplanationDisclosure
        subject={{ kind: "application", id: "a1" }}
        criteriaHref="/x"
      />,
    );
    expect(current.gateway.explanation).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "How this score was worked out" }),
    );
    await waitFor(() =>
      expect(current.gateway.explanation).toHaveBeenCalledTimes(1),
    );
    expect(current.gateway.explanation).toHaveBeenCalledWith(
      { kind: "application", id: "a1" },
      expect.anything(),
    );
    expect(await screen.findByText(/Fit score/)).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Hide the explanation" }),
    );
    await user.click(
      screen.getByRole("button", { name: "How this score was worked out" }),
    );
    expect(current.gateway.explanation).toHaveBeenCalledTimes(1);
  });

  it("says the explanation could not be loaded, and offers another go", async () => {
    current.gateway = fakeGateway({
      explanation: vi.fn(async () => {
        throw new Error("down");
      }),
    });
    const user = userEvent.setup();
    render(
      <ExplanationDisclosure subject={{ kind: "application", id: "a1" }} />,
    );
    await user.click(
      screen.getByRole("button", { name: "How this score was worked out" }),
    );
    expect(
      await screen.findByText("The explanation could not be loaded."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });
});
