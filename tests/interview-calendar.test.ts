import { describe, expect, it } from "vitest";
import {
  buildIcs,
  eventFor,
  googleCalendarUrl,
  icsFilename,
  outlookCalendarUrl,
  type CalendarEvent,
} from "@/lib/hiring/interviews/calendar";

/**
 * Putting an interview into a calendar: two addresses and a file.
 *
 * The addresses have to survive a title with an ampersand, a hash and an accent in it,
 * and the file has to be one a calendar reads: CRLF lines, escaped text, folded at 75
 * octets, the same identity every time so a change replaces the entry.
 */

const interview = {
  id: "iv-7",
  candidateName: "Ada & Sons Okafor",
  role: "Payroll #1 Analyst, Lagos",
  kind: "TECHNICAL" as const,
  scheduledFor: "2026-10-20T09:00:00.000Z",
  durationMins: 90,
  location: "Boardroom; 4th floor",
  joinUrl: "https://meet.google.com/abc-defg-hij",
  sequence: 2,
  status: "SCHEDULED" as const,
};

describe("the entry for an interview", () => {
  const event = eventFor(interview);

  it("runs for the length of the interview", () => {
    expect(event.start).toBe("2026-10-20T09:00:00.000Z");
    expect(event.end).toBe("2026-10-20T10:30:00.000Z");
  });

  it("keeps its identity across edits and carries the sequence", () => {
    expect(event.uid).toBe("interview-iv-7@approvehr");
    expect(eventFor({ ...interview, sequence: 5 }).uid).toBe(event.uid);
    expect(eventFor({ ...interview, sequence: 5 }).sequence).toBe(5);
  });

  it("puts the link and the place in the description", () => {
    expect(event.description).toContain(
      "Join: https://meet.google.com/abc-defg-hij",
    );
    expect(event.description).toContain("Where: Boardroom; 4th floor");
  });

  it("uses the place for the location, else the link", () => {
    expect(event.location).toBe("Boardroom; 4th floor");
    expect(eventFor({ ...interview, location: null }).location).toBe(
      "https://meet.google.com/abc-defg-hij",
    );
    expect(
      eventFor({ ...interview, location: null, joinUrl: null }).location,
    ).toBeNull();
  });

  it("is cancelled when the interview is", () => {
    expect(eventFor({ ...interview, status: "CANCELLED" }).cancelled).toBe(
      true,
    );
    expect(event.cancelled).toBe(false);
  });

  it("tells a panelist where to hand the scorecard in, and a person on staff nothing of the kind", () => {
    expect(eventFor(interview, "panelist").description).toContain(
      "My interviews",
    );
    expect(event.description).not.toContain("My interviews");
  });

  it("takes the name, the role, the time, the place and the link and nothing else, whatever it is handed", () => {
    /* A caller with a fatter object (a record with contact details and a score on it)
       cannot put any of it into a calendar entry: only named fields are read. */
    const fat = {
      ...interview,
      email: "ada.okafor@example.com",
      phone: "+234 803 123 4567",
      expectedSalaryKobo: 123_456_700,
      fitScore: 88,
      notices: [{ note: "secret note" }],
    };
    const text = JSON.stringify(eventFor(fat, "panelist"));
    for (const leak of [
      "ada.okafor@example.com",
      "803 123",
      "123456700",
      "88",
      "secret note",
    ]) {
      expect(text, leak).not.toContain(leak);
    }
  });
});

describe("the Google Calendar address", () => {
  const url = googleCalendarUrl(eventFor(interview));

  it("opens the new-event form", () => {
    expect(
      url.startsWith(
        "https://calendar.google.com/calendar/render?action=TEMPLATE&",
      ),
    ).toBe(true);
  });

  it("states the times in UTC", () => {
    expect(url).toContain("dates=20261020T090000Z/20261020T103000Z");
  });

  it("encodes what would otherwise end a field or start another", () => {
    const query = new URL(url).searchParams;
    expect(query.get("text")).toBe("Technical interview: Ada & Sons Okafor");
    expect(query.get("location")).toBe("Boardroom; 4th floor");
    expect(query.get("details")).toContain("Payroll #1 Analyst, Lagos");
    expect(query.get("details")).toContain("\n");
    /* The raw text carries none of the characters that would break the query. */
    const raw = url.split("?")[1] ?? "";
    expect(raw).not.toMatch(/ |#|;/);
    expect(raw.match(/&/g)?.length).toBe(4);
  });

  it("encodes an accent and a line break", () => {
    const text = googleCalendarUrl({
      ...eventFor(interview),
      title: "Entretien: Renée\nLagos",
    });
    expect(new URL(text).searchParams.get("text")).toBe(
      "Entretien: Renée\nLagos",
    );
    expect(text).toContain("Ren%C3%A9e%0ALagos");
  });

  it("leaves the location off when there is none", () => {
    expect(
      googleCalendarUrl(
        eventFor({ ...interview, location: null, joinUrl: null }),
      ),
    ).not.toContain("location=");
  });

  it("keeps an address a browser will accept, however long the description", () => {
    const long = googleCalendarUrl({
      ...eventFor(interview),
      description: "x".repeat(5000),
    });
    expect(long.length).toBeLessThan(2200);
  });
});

describe("the Outlook address", () => {
  const url = outlookCalendarUrl(eventFor(interview));
  const query = new URL(url).searchParams;

  it("opens the compose form for a new event", () => {
    expect(
      url.startsWith("https://outlook.live.com/calendar/0/deeplink/compose?"),
    ).toBe(true);
    expect(query.get("path")).toBe("/calendar/action/compose");
    expect(query.get("rru")).toBe("addevent");
  });

  it("carries the times as ISO instants", () => {
    expect(query.get("startdt")).toBe("2026-10-20T09:00:00.000Z");
    expect(query.get("enddt")).toBe("2026-10-20T10:30:00.000Z");
  });

  it("encodes the title, the body and the place", () => {
    expect(query.get("subject")).toBe("Technical interview: Ada & Sons Okafor");
    expect(query.get("body")).toContain(
      "Join: https://meet.google.com/abc-defg-hij",
    );
    expect(query.get("location")).toBe("Boardroom; 4th floor");
    expect(url.split("?")[1]).not.toMatch(/ |#|;/);
  });
});

describe("the calendar file", () => {
  const event: CalendarEvent = eventFor(interview);
  const stamp = new Date("2026-10-17T12:00:00.000Z");
  const text = buildIcs(event, { stamp });
  const lines = text.split("\r\n");

  it("is a calendar with one event, written with CRLF lines", () => {
    expect(text.endsWith("\r\n")).toBe(true);
    expect(text).not.toMatch(/[^\r]\n/);
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines).toContain("BEGIN:VEVENT");
    expect(lines.filter((line) => line === "END:VEVENT")).toHaveLength(1);
    expect(lines).toContain("END:VCALENDAR");
    expect(lines).toContain("VERSION:2.0");
  });

  it("says when, how long, which event and which version of it", () => {
    expect(lines).toContain("DTSTART:20261020T090000Z");
    expect(lines).toContain("DTEND:20261020T103000Z");
    expect(lines).toContain("DTSTAMP:20261017T120000Z");
    expect(lines).toContain("UID:interview-iv-7@approvehr");
    expect(lines).toContain("SEQUENCE:2");
    expect(lines).toContain("STATUS:CONFIRMED");
  });

  it("escapes what the format reserves", () => {
    const unfolded = text.replace(/\r\n /g, "");
    expect(unfolded).toContain("LOCATION:Boardroom\; 4th floor");
    expect(unfolded).toContain(
      "SUMMARY:Technical interview: Ada & Sons Okafor",
    );
    expect(unfolded).toContain("Payroll #1 Analyst\\, Lagos");
    expect(unfolded).toContain("\\nJoin: https://meet.google.com/abc-defg-hij");
  });

  it("never lets a line pass 75 octets, even through a multi-byte character", () => {
    const wide = buildIcs(
      { ...event, description: `${"é".repeat(120)}\n${"x".repeat(200)}` },
      { stamp },
    );
    const encoder = new TextEncoder();
    for (const line of wide.split("\r\n")) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }
    const unfolded = wide.replace(/\r\n /g, "");
    expect(unfolded).toContain("é".repeat(120));
  });

  it("marks a cancelled interview cancelled, with the higher sequence", () => {
    const cancelled = buildIcs(
      { ...event, cancelled: true, sequence: 3 },
      { stamp },
    ).split("\r\n");
    expect(cancelled).toContain("STATUS:CANCELLED");
    expect(cancelled).toContain("SEQUENCE:3");
  });

  it("says inside the file when it is a practice copy, and not otherwise", () => {
    const practice = buildIcs(event, { stamp, demo: true });
    expect(practice).toContain("X-APPROVEHR-DEMO:TRUE");
    expect(practice.replace(/\r\n /g, "")).toContain("practice file");
    expect(text).not.toContain("practice file");
    expect(text).not.toContain("X-APPROVEHR-DEMO");
  });

  it("names the file after the person and the day", () => {
    expect(icsFilename(event)).toBe("interview-ada-sons-okafor-2026-10-20.ics");
  });
});
