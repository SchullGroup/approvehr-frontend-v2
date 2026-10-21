// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  cardStartMs,
  chaptersOf,
  onVideoClock,
  parseBrightness,
  parseMatrix,
  tickMatrix,
  toFfMetadata,
  toVtt,
  vttTime,
  type TimelineEntry,
} from "./timeline";

const entry = (
  id: string,
  over: Partial<TimelineEntry> = {},
): TimelineEntry => ({
  id,
  chapter: "Owner",
  role: "owner",
  name: id,
  covers: [],
  startMs: 0,
  endMs: 1000,
  screenshot: `screenshots/${id}.png`,
  status: "ok",
  ...over,
});

const MATRIX = `# Coverage

| Id | Feature | Route | Roles | The click | API | Status |
|---|---|---|---|---|---|---|
| own-01 | Sign up | /register | Owner | Fill the form | — | planned |
| own-02 | Wizard | /setup | Owner | Answer | — | planned |
| pub-05 (neg) | Duplicates refused | /careers | Applicant | Apply twice | — | planned |
| jira-09 | Real Atlassian | — | Owner | n/a | — | not demonstrable |
`;

describe("chapters", () => {
  it("joins consecutive steps of one chapter and role, and splits on either changing", () => {
    const chapters = chaptersOf([
      entry("a", { startMs: 0, endMs: 100 }),
      entry("b", { startMs: 100, endMs: 250 }),
      entry("c", { chapter: "Owner", role: "hr", startMs: 250, endMs: 400 }),
      entry("d", {
        chapter: "Requisitions",
        role: "hr",
        startMs: 400,
        endMs: 500,
      }),
    ]);
    expect(chapters).toEqual([
      { title: "Owner", role: "owner", startMs: 0, endMs: 250 },
      { title: "Owner", role: "hr", startMs: 250, endMs: 400 },
      { title: "Requisitions", role: "hr", startMs: 400, endMs: 500 },
    ]);
  });

  it("writes WebVTT times as hours, minutes, seconds and milliseconds", () => {
    expect(vttTime(0)).toBe("00:00:00.000");
    expect(vttTime(61_250)).toBe("00:01:01.250");
    expect(vttTime(3_723_004)).toBe("01:02:03.004");
    expect(vttTime(-5)).toBe("00:00:00.000");
  });

  it("writes one numbered cue per chapter, with the role", () => {
    const vtt = toVtt([
      { title: "Owner", role: "owner", startMs: 0, endMs: 2000 },
      { title: "Careers", role: "applicant", startMs: 2000, endMs: 5000 },
    ]);
    expect(
      vtt.startsWith(
        "WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\nOwner (owner)",
      ),
    ).toBe(true);
    expect(vtt).toContain(
      "2\n00:00:02.000 --> 00:00:05.000\nCareers (applicant)",
    );
  });

  it("writes the same chapters for ffmpeg, in milliseconds", () => {
    const meta = toFfMetadata([
      { title: "Owner", role: "owner", startMs: 0, endMs: 2000 },
    ]);
    expect(meta).toBe(
      ";FFMETADATA1\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=2000\ntitle=Owner (owner)\n",
    );
  });
});

describe("the video's own clock", () => {
  const frames = (...pairs: [number, number][]) =>
    pairs.map(([t, brightness]) => ({ t, brightness }));

  it("finds the card as the first dark frame after the white ones", () => {
    expect(
      cardStartMs(
        frames([0, 254], [0.05, 254], [1.4, 254], [1.45, 31], [1.5, 31]),
      ),
    ).toBe(1450);
  });

  it("refuses to guess when the recording began after the card was painted", () => {
    expect(cardStartMs(frames([0, 31], [0.05, 31], [0.1, 31]))).toBeNull();
  });

  it("ignores a dark frame that comes before any white one", () => {
    expect(
      cardStartMs(frames([0, 31], [0.2, 254], [0.4, 254], [0.6, 30])),
    ).toBe(600);
  });

  it("reads ffmpeg's signalstats output, pairing each brightness with its frame time", () => {
    const out = [
      "frame:0    pts:0       pts_time:0",
      "lavfi.signalstats.YAVG=254.5",
      "frame:1    pts:1       pts_time:0.05",
      "lavfi.signalstats.YAVG=31.25",
    ].join("\n");
    expect(parseBrightness(out)).toEqual([
      { t: 0, brightness: 254.5 },
      { t: 0.05, brightness: 31.25 },
    ]);
  });

  it("moves chapters onto the video's clock, and never past either end of the file", () => {
    const chapters = [
      { title: "A", role: "owner", startMs: 0, endMs: 10_000 },
      { title: "B", role: "owner", startMs: 10_000, endMs: 60_000 },
    ];
    expect(onVideoClock(chapters, 1500, 50_000)).toEqual([
      { title: "A", role: "owner", startMs: 1500, endMs: 11_500 },
      { title: "B", role: "owner", startMs: 11_500, endMs: 50_000 },
    ]);
  });
});

describe("the coverage matrix", () => {
  it("reads the id, whether it is negative, and its status", () => {
    expect(parseMatrix(MATRIX)).toEqual([
      { id: "own-01", negative: false, status: "planned" },
      { id: "own-02", negative: false, status: "planned" },
      { id: "pub-05", negative: true, status: "planned" },
      { id: "jira-09", negative: false, status: "not demonstrable" },
    ]);
  });

  it("ticks a row only when a passing step covers it", () => {
    const { markdown, planned } = tickMatrix(MATRIX, [
      entry("a", { covers: ["own-01"] }),
      entry("b", { covers: ["own-02"], status: "failed" }),
    ]);
    expect(markdown).toMatch(/\| own-01 \|.*\| ticked \|/);
    expect(markdown).toMatch(/\| own-02 \|.*\| planned \|/);
    expect(planned).toEqual(["own-02", "pub-05"]);
  });

  it("keeps the negative marker and leaves a not-demonstrable row alone", () => {
    const { markdown, planned } = tickMatrix(MATRIX, [
      entry("a", { covers: ["pub-05"] }),
    ]);
    expect(markdown).toMatch(/\| pub-05 \(neg\) \|.*\| ticked \|/);
    expect(markdown).toMatch(/\| jira-09 \|.*\| not demonstrable \|/);
    expect(planned).not.toContain("jira-09");
  });

  it("names a row a step claims that does not exist, instead of ticking nothing quietly", () => {
    const { unknown } = tickMatrix(MATRIX, [
      entry("a", { covers: ["own-99"] }),
    ]);
    expect(unknown).toEqual(["own-99"]);
  });

  it("does not let a failed step's claim count as covered", () => {
    const { planned } = tickMatrix(MATRIX, [
      entry("a", { covers: ["own-01"], status: "failed" }),
    ]);
    expect(planned).toContain("own-01");
  });

  it("is idempotent: ticking a ticked matrix changes nothing", () => {
    const once = tickMatrix(MATRIX, [
      entry("a", { covers: ["own-01"] }),
    ]).markdown;
    const twice = tickMatrix(once, [
      entry("a", { covers: ["own-01"] }),
    ]).markdown;
    expect(twice).toBe(once);
  });
});
