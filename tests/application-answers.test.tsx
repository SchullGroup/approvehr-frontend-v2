import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationAnswers } from "@/components/hiring/application-answers";
import {
  NO_EXTRAS,
  hasExtras,
  type AnswerRow,
  type ApplicationExtras,
} from "@/lib/hiring/answers-view";

/**
 * What a recruiter sees of an application's answers: each kind of answer, the
 * consent record, a flag that asks for a look and is never a verdict, and a
 * possible duplicate that is a marker and never a merge.
 */

vi.mock("@/lib/permissions", () => ({
  useCan: () => true,
  usePermissions: () => ({ can: () => true, loading: false }),
}));

const row = (over: Partial<AnswerRow> = {}): AnswerRow => ({
  id: "a1",
  label: "Current job title",
  kind: "SHORT_TEXT",
  knockout: false,
  text: "Payroll lead",
  words: null,
  link: null,
  file: null,
  flagged: false,
  flagReason: null,
  ...over,
});

const extras = (over: Partial<ApplicationExtras> = {}): ApplicationExtras => ({
  ...NO_EXTRAS,
  answers: [row()],
  ...over,
});

let opened: (
  id: string,
) => Promise<{ url: string | null; note: string | null }>;

beforeEach(() => {
  opened = vi.fn(async () => ({ url: null, note: "No bucket." }));
  vi.stubGlobal(
    "open",
    vi.fn(() => null),
  );
});

describe("the answers", () => {
  it("shows each question as it was asked beside what they said, in order", () => {
    render(
      <ApplicationAnswers
        extras={extras({
          answers: [
            row({ id: "1", label: "First question", text: "One" }),
            row({ id: "2", label: "Second question", text: "Two" }),
          ],
        })}
      />,
    );
    const items = screen.getAllByTestId("answer-row");
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining("First question"),
      expect.stringContaining("Second question"),
    ]);
    expect(within(items[0]!).getByText("One")).toBeInTheDocument();
  });

  it("counts the words of a long answer", () => {
    render(
      <ApplicationAnswers
        extras={extras({
          answers: [
            row({
              kind: "LONG_TEXT",
              label: "Why us?",
              text: "I like payroll because it has to be right",
              words: 9,
            }),
          ],
        })}
      />,
    );
    expect(screen.getByText("9 words")).toBeInTheDocument();
  });

  it("says one word, not one words", () => {
    render(
      <ApplicationAnswers
        extras={extras({
          answers: [row({ kind: "LONG_TEXT", text: "Yes", words: 1 })],
        })}
      />,
    );
    expect(screen.getByText("1 word")).toBeInTheDocument();
  });

  it("says a question was left blank rather than showing nothing", () => {
    render(
      <ApplicationAnswers
        extras={extras({ answers: [row({ text: null })] })}
      />,
    );
    expect(screen.getByText("Left blank")).toBeInTheDocument();
  });

  it("draws a web-address answer as a link that leaves safely, and anything else as text", () => {
    render(
      <ApplicationAnswers
        extras={extras({
          answers: [
            row({
              id: "u",
              kind: "URL",
              label: "Portfolio",
              text: "https://example.com/me",
              link: "https://example.com/me",
            }),
            row({
              id: "t",
              label: "Note",
              text: "https://not-a-link-field.example.com",
            }),
          ],
        })}
      />,
    );
    const link = screen.getByRole("link", { name: "https://example.com/me" });
    expect(link).toHaveAttribute("href", "https://example.com/me");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("rel")).toContain("nofollow");
  });

  it("never draws a link for an address that is not http or https", () => {
    render(
      <ApplicationAnswers
        extras={extras({
          answers: [
            row({ kind: "URL", text: "javascript:alert(1)", link: null }),
          ],
        })}
      />,
    );
    expect(
      screen.queryByRole("link", { name: /javascript/ }),
    ).not.toBeInTheDocument();
  });
});

describe("files", () => {
  const file = (over = {}) =>
    row({
      id: "f1",
      kind: "FILE",
      label: "Certificate",
      text: null,
      file: {
        description: "PDF, 54 KB",
        sizeBytes: 55_296,
        scanStatus: "NOT_SCANNED",
        ...over,
      },
    });

  it("describes the file and offers to open it only when this reader may", () => {
    const { rerender } = render(
      <ApplicationAnswers extras={extras({ answers: [file()] })} />,
    );
    expect(screen.getByText(/Attached file/)).toHaveTextContent("PDF, 54 KB");
    expect(
      screen.queryByRole("button", { name: /Open file/ }),
    ).not.toBeInTheDocument();

    rerender(
      <ApplicationAnswers
        extras={extras({ answers: [file()] })}
        openFile={opened}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Open file/ }),
    ).toBeInTheDocument();
  });

  it("asks the API for one file at the press, and says what it answered when there is nothing to open", async () => {
    const user = userEvent.setup();
    render(
      <ApplicationAnswers
        extras={extras({ answers: [file()] })}
        openFile={opened}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Open file/ }));
    await waitFor(() => expect(opened).toHaveBeenCalledWith("f1"));
    expect(await screen.findByText("No bucket.")).toBeInTheDocument();
  });

  it("does not offer a file the virus check flagged", () => {
    render(
      <ApplicationAnswers
        extras={extras({ answers: [file({ scanStatus: "INFECTED" })] })}
        openFile={opened}
      />,
    );
    expect(screen.getByText("Flagged by the virus check")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Open file/ }),
    ).not.toBeInTheDocument();
  });
});

describe("needs a look", () => {
  const flagged = extras({
    answers: [
      row({
        id: "w",
        kind: "YES_NO",
        label: "Right to work in Nigeria?",
        text: "No",
        knockout: true,
        flagged: true,
        flagReason: 'Answered No to "Right to work in Nigeria?"',
      }),
      row({ id: "x", label: "Other" }),
    ],
    flagCount: 1,
  });

  it("says one answer raised a flag, and that a flag is not a decision", () => {
    render(<ApplicationAnswers extras={flagged} />);
    /* A quiet line now: the title is visible and the rest sits behind its
       info icon, still in the page for a screen reader. */
    const note = screen
      .getAllByText("Needs a look")
      .find((el) => el.closest("p")?.textContent?.includes("raised a flag"));
    expect(note).toBeDefined();
    const region = note!.closest("p") as HTMLElement;
    expect(region).toHaveTextContent("One answer raised a flag.");
    expect(region).toHaveTextContent(
      "It is not a decision, and nobody is rejected because of it.",
    );
  });

  it("marks the answer itself, with the reason, and leaves the others unmarked", () => {
    render(<ApplicationAnswers extras={flagged} />);
    const rows = screen.getAllByTestId("answer-row");
    expect(rows[0]).toHaveAttribute("data-flagged", "true");
    expect(rows[1]).toHaveAttribute("data-flagged", "false");
    expect(within(rows[0]!).getByText("Needs a look")).toBeInTheDocument();
    expect(
      within(rows[0]!).getByText('Answered No to "Right to work in Nigeria?"'),
    ).toBeInTheDocument();
  });

  it("is never drawn as a rejection: no danger tone, no 'rejected' on the flag", () => {
    const { container } = render(<ApplicationAnswers extras={flagged} />);
    expect(container.innerHTML).not.toMatch(/danger/);
    for (const flag of screen.getAllByText("Needs a look")) {
      expect(
        flag.closest("[data-testid=answer-row], div")?.textContent ?? "",
      ).not.toMatch(/rejected\b(?! because)/i);
    }
    expect(
      screen.queryByText(/disqualif|knocked out|auto/i),
    ).not.toBeInTheDocument();
  });

  it("says several when there are several", () => {
    render(<ApplicationAnswers extras={{ ...flagged, flagCount: 3 }} />);
    expect(screen.getByText(/3 answers raised a flag\./)).toBeInTheDocument();
  });

  it("shows no note at all when nothing was flagged", () => {
    render(<ApplicationAnswers extras={extras()} />);
    expect(screen.queryByText("Needs a look")).not.toBeInTheDocument();
  });
});

describe("a possible duplicate", () => {
  it("names who, why, and links to the earlier application", () => {
    render(
      <ApplicationAnswers
        extras={extras({
          duplicate: {
            reason: "SAME_PHONE",
            ofId: "earlier-1",
            ofName: "Ada Okafor",
          },
        })}
      />,
    );
    const marker = screen.getByTestId("duplicate-marker");
    expect(marker).toHaveTextContent(
      "Possible duplicate: Ada Okafor gave the same phone number.",
    );
    expect(
      within(marker).getByRole("link", { name: "See the earlier one" }),
    ).toHaveAttribute("href", "/hiring/candidates/earlier-1");
  });

  it("copes with not knowing the name", () => {
    render(
      <ApplicationAnswers
        extras={extras({
          duplicate: { reason: "SAME_EMAIL", ofId: "e", ofName: null },
        })}
      />,
    );
    expect(screen.getByTestId("duplicate-marker")).toHaveTextContent(
      "an earlier application gave the same email address",
    );
  });

  it("does not merge or hide anything: the answers are still all there", () => {
    render(
      <ApplicationAnswers
        extras={extras({
          duplicate: { reason: "SAME_EMAIL", ofId: "e", ofName: "Ada" },
        })}
      />,
    );
    expect(screen.getByText("Payroll lead")).toBeInTheDocument();
  });
});

describe("consent, source and reference", () => {
  it("shows the date they agreed and the notice exactly as they were shown it", async () => {
    const user = userEvent.setup();
    render(
      <ApplicationAnswers
        extras={extras({
          consent: {
            acceptedOn: "2026-10-15",
            noticeText: "We keep it for a year.\n\nAsk us to delete it.",
            noticeRef: "custom-2",
          },
        })}
      />,
    );
    const record = screen.getByTestId("consent-record");
    expect(record).toHaveTextContent(
      "Agreed to the privacy notice on 2026-10-15",
    );
    await user.click(
      within(record).getByRole("button", {
        name: /The notice they were shown/,
      }),
    );
    expect(record).toHaveTextContent("We keep it for a year.");
    expect(record).toHaveTextContent("Ask us to delete it.");
    expect(record).toHaveTextContent("custom-2");
  });

  it("shows no consent line when none was given", () => {
    render(<ApplicationAnswers extras={extras()} />);
    expect(screen.queryByTestId("consent-record")).not.toBeInTheDocument();
  });

  it("shows the reference and where they came from", () => {
    render(
      <ApplicationAnswers
        extras={extras({ reference: "APP-7K2M9Q3X", source: "LinkedIn" })}
      />,
    );
    expect(screen.getByText("APP-7K2M9Q3X")).toBeInTheDocument();
    expect(screen.getByText("LinkedIn")).toBeInTheDocument();
  });
});

describe("a row in the queue", () => {
  it("keeps the answers behind a disclosure that says how many are answered", async () => {
    const user = userEvent.setup();
    render(
      <ApplicationAnswers
        compact
        extras={extras({
          answers: [
            row({ id: "1" }),
            row({ id: "2", label: "Blank", text: null }),
          ],
          flagCount: 1,
        })}
      />,
    );
    const toggle = screen.getByRole("button", { name: /Their answers/ });
    expect(toggle).toHaveAccessibleName(/1 of 2 answered/);
    await user.click(toggle);
    expect(screen.getAllByTestId("answer-row")).toHaveLength(2);
  });
});

describe("whether there is anything to show", () => {
  it("is false for an advert that asked nothing, and true for any one thing", () => {
    expect(hasExtras(NO_EXTRAS)).toBe(false);
    expect(hasExtras(null)).toBe(false);
    expect(hasExtras(extras({ answers: [] }))).toBe(false);
    expect(hasExtras(extras({ answers: [], reference: "APP-1" }))).toBe(true);
    expect(hasExtras(extras({ answers: [], flagCount: 1 }))).toBe(true);
    expect(
      hasExtras(
        extras({
          answers: [],
          duplicate: { reason: "SAME_EMAIL", ofId: "x", ofName: null },
        }),
      ),
    ).toBe(true);
  });
});
