import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  DeletionNotice,
  InterviewScoreCard,
  RecordEmails,
} from "@/components/hiring/record-comms";
import { DeletionLine, ScoreBadge } from "@/components/hiring/card-bits";
import type { ScoreSummary, SentEmail } from "@/lib/hiring/comms/model";

/**
 * What a candidate's record says about emails, the interview score and when the
 * person is scheduled to go.
 *
 * Each is a reading of what the API holds, and the rule across all of them is that
 * nothing is invented: an email is called sent only when the API says so, a person
 * nobody scored has no score (never 0), and no retention period means no date.
 */

const email = (over: Partial<SentEmail>): SentEmail => ({
  id: "e1",
  kindLabel: "Update on their application",
  status: "SENT",
  note: null,
  subject: null,
  stageName: "Interview",
  templateName: "Next stage",
  sentAt: null,
  createdAt: "2026-10-12T09:30:00.000Z",
  because: "Moved into Interview",
  ...over,
});

describe("emails to them", () => {
  it("says no email has been asked for, and that one goes only when somebody chooses", () => {
    render(<RecordEmails emails={[]} timeZone="Africa/Lagos" />);
    expect(
      screen.getByText(
        /No email has been asked for\. One goes only when somebody/,
      ),
    ).toBeInTheDocument();
  });

  it("calls an email sent only when the API says it was, with the subject that went", () => {
    render(
      <RecordEmails
        emails={[
          email({
            status: "SENT",
            sentAt: "2026-10-12T09:31:00.000Z",
            subject: "Schull: an update on your application",
          }),
        ]}
        timeZone="Africa/Lagos"
      />,
    );
    expect(screen.getByText("Sent")).toBeInTheDocument();
    expect(screen.getByText(/^Sent 12 Oct 2026/)).toBeInTheDocument();
    expect(
      screen.getByText("Subject: Schull: an update on your application"),
    ).toBeInTheDocument();
  });

  it("calls one still on its way queued, and never sent", () => {
    render(
      <RecordEmails
        emails={[email({ status: "PENDING", note: null })]}
        timeZone="Africa/Lagos"
      />,
    );
    expect(screen.getByText("Queued")).toBeInTheDocument();
    expect(screen.queryByText("Sent")).not.toBeInTheDocument();
    expect(screen.getByText("It is waiting to be sent.")).toBeInTheDocument();
  });

  it("says why one was not sent, without repeating 'not sent' in the sentence", () => {
    render(
      <RecordEmails
        emails={[
          email({
            status: "SKIPPED",
            note: "not sent: no reply-to address is set for this company (Careers settings). We do not send an email whose replies would go nowhere",
          }),
        ]}
        timeZone="Africa/Lagos"
      />,
    );
    expect(screen.getByText("Not sent")).toBeInTheDocument();
    expect(
      screen.getByText(/^No reply-to address is set for this company/),
    ).toBeInTheDocument();
  });

  it("shows a waiting email's reason, and a failed one as failed", () => {
    render(
      <RecordEmails
        emails={[
          email({
            id: "e2",
            status: "PENDING",
            note: "waiting: this company has reached its daily limit of emails to candidates",
          }),
          email({
            id: "e3",
            status: "FAILED",
            note: "not sent: the mail provider refused it 3 times",
          }),
        ]}
        timeZone="Africa/Lagos"
      />,
    );
    expect(
      screen.getByText(
        "This company has reached its daily limit of emails to candidates.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(
      screen.getByText("The mail provider refused it 3 times."),
    ).toBeInTheDocument();
  });

  it("says what asked for each email", () => {
    render(
      <RecordEmails
        emails={[
          email({
            because: "Rejected, with a decline email",
            templateName: null,
          }),
        ]}
        timeZone="Africa/Lagos"
      />,
    );
    expect(
      screen.getByText(/Rejected, with a decline email · asked for/),
    ).toBeInTheDocument();
  });
});

describe("the interview score", () => {
  const scored: ScoreSummary = {
    outOf: 5,
    composite: 4.17,
    interviews: [
      {
        interviewId: "i1",
        kind: "Panel",
        composite: 4.17,
        scorecards: [],
      },
    ],
    recommendations: { STRONG_YES: 1, YES: 1, NO: 0, STRONG_NO: 0 },
    byCompetency: [
      { competency: "Technical", average: 4.67, ratings: 2 },
      { competency: "Communication", average: 3, ratings: 1 },
    ],
    scorecardsSubmitted: 2,
  };

  it("shows the figure to two places and how many scorecards it came from", () => {
    render(<InterviewScoreCard score={scored} />);
    /* The score, and the one interview it was made of. */
    expect(screen.getAllByText("4.17")).toHaveLength(2);
    expect(screen.getByText(/out of 5, from 2 scorecards/)).toBeInTheDocument();
    expect(screen.getByText("Technical")).toBeInTheDocument();
  });

  it("says not scored yet rather than showing a zero", () => {
    render(
      <InterviewScoreCard
        score={{
          ...scored,
          composite: null,
          byCompetency: [],
          interviews: [],
          scorecardsSubmitted: 0,
          recommendations: { STRONG_YES: 0, YES: 0, NO: 0, STRONG_NO: 0 },
        }}
      />,
    );
    expect(screen.getByText(/Not scored yet/)).toBeInTheDocument();
    expect(screen.queryByText("0.00")).not.toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("tallies recommendations beside the score and says they are counted apart", () => {
    render(<InterviewScoreCard score={scored} />);
    expect(
      screen.getByText(/Recommendations, counted apart from the score/),
    ).toBeInTheDocument();
    expect(screen.getByText("1 strong yes")).toBeInTheDocument();
    expect(screen.getByText("1 yes")).toBeInTheDocument();
    expect(screen.queryByText(/ no$/)).not.toBeInTheDocument();
  });
});

describe("when somebody is scheduled to go", () => {
  it("says the day, and points at the retention period", () => {
    render(
      <DeletionNotice
        line={{ scheduledDeletionOn: "2027-11-03", reason: null }}
      />,
    );
    expect(screen.getByText(/Scheduled for deletion on/).textContent).toContain(
      "3 Nov 2027",
    );
    expect(
      screen.getByRole("link", { name: "retention period" }),
    ).toHaveAttribute("href", "/hiring/settings/retention");
  });

  it("says why there is no day when the person is kept on purpose or still in progress", () => {
    const { rerender } = render(
      <DeletionNotice
        line={{ scheduledDeletionOn: null, reason: "talent_pool" }}
      />,
    );
    expect(screen.getByText(/Kept in the talent pool/)).toBeInTheDocument();
    rerender(
      <DeletionNotice
        line={{ scheduledDeletionOn: null, reason: "still_active" }}
      />,
    );
    expect(
      screen.getByText(/Still in progress on another role/),
    ).toBeInTheDocument();
  });

  it("says nothing when no period is set, and nothing for a hire", () => {
    const { container, rerender } = render(
      <DeletionNotice
        line={{ scheduledDeletionOn: null, reason: "none_set" }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(
      <DeletionNotice line={{ scheduledDeletionOn: null, reason: "hired" }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("a card's small facts", () => {
  it("shows a score, and nothing at all when nobody has scored", () => {
    const { container, rerender } = render(<ScoreBadge score={4.2} />);
    expect(screen.getByText("Score 4.20")).toBeInTheDocument();
    rerender(<ScoreBadge score={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<ScoreBadge score={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a deletion day only when there is one", () => {
    const { container, rerender } = render(<DeletionLine day="2027-01-10" />);
    expect(
      within(container).getByText(/Scheduled for deletion on 10 Jan 2027/),
    ).toBeInTheDocument();
    rerender(<DeletionLine day={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
