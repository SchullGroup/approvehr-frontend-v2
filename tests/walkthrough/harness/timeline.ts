/**
 * The record of a run: what was done, when in the video, and which rows of the
 * coverage matrix it proves.
 *
 * `timeline.json` is the one source. The PDF's captions, the chapter markers on
 * the video, and the ticks on the coverage matrix are all generated from it, so
 * none of them can say something the run did not do. A tick is never typed: a
 * step names the row ids it covers, the step either passes or does not, and the
 * matrix follows.
 */

export type TimelineEntry = {
  id: string;
  chapter: string;
  /** A role key, or `visitor` before anybody has signed in. */
  role: string;
  name: string;
  covers: string[];
  /** Milliseconds from the start of the recording. */
  startMs: number;
  endMs: number;
  screenshot: string;
  status: "ok" | "failed";
};

export type Chapter = {
  title: string;
  role: string;
  startMs: number;
  endMs: number;
};

/** Consecutive steps of one chapter and role are one chapter on the video. */
export function chaptersOf(entries: readonly TimelineEntry[]): Chapter[] {
  const out: Chapter[] = [];
  for (const entry of entries) {
    const last = out[out.length - 1];
    if (last && last.title === entry.chapter && last.role === entry.role) {
      last.endMs = entry.endMs;
    } else {
      out.push({
        title: entry.chapter,
        role: entry.role,
        startMs: entry.startMs,
        endMs: entry.endMs,
      });
    }
  }
  return out;
}

const pad = (n: number, width: number): string =>
  String(n).padStart(width, "0");

/** `1:02:03.450`-style, which is what WebVTT wants. */
export function vttTime(ms: number): string {
  const whole = Math.max(0, Math.round(ms));
  const h = Math.floor(whole / 3_600_000);
  const m = Math.floor((whole % 3_600_000) / 60_000);
  const s = Math.floor((whole % 60_000) / 1000);
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}.${pad(whole % 1000, 3)}`;
}

export function toVtt(chapters: readonly Chapter[]): string {
  const cues = chapters.map(
    (c, index) =>
      `${String(index + 1)}\n${vttTime(c.startMs)} --> ${vttTime(c.endMs)}\n${c.title} (${c.role})`,
  );
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}

/* ----------------------------------------------------------- the matrix */

export type MatrixRow = { id: string; negative: boolean; status: string };

/** `own-01` or `pub-05 (neg)`: the first cell of a matrix row. */
const ROW = /^\|\s*([a-z]+-\d+)(\s*\(neg\))?\s*\|/;

export function parseMatrix(markdown: string): MatrixRow[] {
  return markdown.split("\n").flatMap((line) => {
    const head = ROW.exec(line);
    if (!head?.[1]) return [];
    const cells = line.split("|").map((c) => c.trim());
    return [
      {
        id: head[1],
        negative: Boolean(head[2]),
        status: cells[cells.length - 2] ?? "",
      },
    ];
  });
}

export type Ticked = {
  markdown: string;
  /** Rows no passing step covered and that are not marked `not demonstrable`. */
  planned: string[];
  /** Ids a step claimed to cover that are not in the matrix: a typo, not a tick. */
  unknown: string[];
};

export function tickMatrix(
  markdown: string,
  entries: readonly TimelineEntry[],
): Ticked {
  const rows = new Set(parseMatrix(markdown).map((r) => r.id));
  const covered = new Set(
    entries.filter((e) => e.status === "ok").flatMap((e) => e.covers),
  );
  const claimed = new Set(entries.flatMap((e) => e.covers));
  const planned: string[] = [];

  const lines = markdown.split("\n").map((line) => {
    const head = ROW.exec(line);
    const id = head?.[1];
    if (!id) return line;
    const cells = line.split("|");
    /* The last real cell is the one before the trailing pipe. */
    const index = cells.length - 2;
    const status = (cells[index] ?? "").trim();
    if (status === "not demonstrable") return line;
    if (covered.has(id)) {
      cells[index] = " ticked ";
      return cells.join("|");
    }
    planned.push(id);
    cells[index] = " planned ";
    return cells.join("|");
  });

  return {
    markdown: lines.join("\n"),
    planned,
    unknown: [...claimed].filter((id) => !rows.has(id)),
  };
}

/* ---------------------------------------------------------- the mp4 chapters */

/**
 * The chapter list in the form ffmpeg reads (`-i chapters.ffmetadata
 * -map_metadata 1`), so the mp4 has the same chapters as `chapters.vtt` and both
 * come from the one timeline.
 */
export function toFfMetadata(chapters: readonly Chapter[]): string {
  const blocks = chapters.map(
    (c) =>
      `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${String(Math.round(c.startMs))}\nEND=${String(Math.round(c.endMs))}\ntitle=${c.title} (${c.role})`,
  );
  return `;FFMETADATA1\n${blocks.join("\n")}\n`;
}

/* ------------------------------------------------- the video's own clock */

/**
 * Where the title card starts in the video, from how bright each frame is.
 *
 * Playwright's recorder needs a couple of seconds to start after the page is
 * created, and nothing in the file says how many. The run therefore waits until
 * the recorder is certainly running (the blank page is white), then paints the
 * dark title card and starts its own clock on that instant. The white-to-dark
 * change is the one frame both clocks agree on, and it is unmistakable.
 *
 * Returns `null` when there is no white frame before the dark one, which means
 * the recording began after the card was painted and nothing in the file can be
 * lined up with the run: the caller should say so and not guess.
 */
export function cardStartMs(
  frames: readonly { t: number; brightness: number }[],
): number | null {
  const sawWhite = frames.findIndex((f) => f.brightness > 200);
  if (sawWhite === -1) return null;
  const dark = frames.slice(sawWhite).find((f) => f.brightness < 120);
  return dark ? Math.round(dark.t * 1000) : null;
}

/** `ffmpeg ... signalstats,metadata=print` output as (time, brightness) pairs. */
export function parseBrightness(
  output: string,
): { t: number; brightness: number }[] {
  const frames: { t: number; brightness: number }[] = [];
  let t: number | null = null;
  for (const line of output.split("\n")) {
    const time = /pts_time:([0-9.]+)/.exec(line);
    if (time?.[1]) t = Number(time[1]);
    const luma = /lavfi\.signalstats\.YAVG=([0-9.]+)/.exec(line);
    if (luma?.[1] && t !== null) {
      frames.push({ t, brightness: Number(luma[1]) });
      t = null;
    }
  }
  return frames;
}

/**
 * Move chapters from the run's clock onto the video's: the video's time is the
 * run's time plus however long the video had been going when the run's clock
 * started. Clamped to the file, so a marker never points past its end.
 */
export function onVideoClock(
  chapters: readonly Chapter[],
  cardMs: number,
  durationMs: number,
): Chapter[] {
  const at = (ms: number): number =>
    Math.min(Math.max(ms + cardMs, 0), durationMs);
  return chapters
    .map((c) => ({ ...c, startMs: at(c.startMs), endMs: at(c.endMs) }))
    .filter((c) => c.endMs > c.startMs);
}
