import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test as base } from "@playwright/test";
import { readConfig } from "./config";
import { Observers } from "./observers";
import { OVERLAY_SCRIPT } from "./overlay";
import { titleCard } from "./title-card";
import { chaptersOf, tickMatrix, toVtt } from "./timeline";
import { Walker, type Recorder } from "./walker";

/**
 * Gives a journey a `walk` and writes down what happened, whatever happened.
 *
 * One browser context and one page for the whole run: the recording is a single
 * continuous file, which a second tab would not be (the video is per page).
 * That is why the mailbox is a place the one tab goes, not a second tab.
 *
 * The files are written in the teardown, after the journey has finished or
 * thrown, so a run that fails halfway still leaves its timeline, its screenshots
 * and its findings. The recording is the last thing to finish: a video is only
 * a file once the context is closed.
 *
 * ## What ends a run badly
 *
 * - a step that fails in a strict run (that is the walkthrough working);
 * - a step that claims a matrix row that does not exist (a typo that would
 *   otherwise be a tick nobody earned);
 * - in the final run only: a row still `planned` at the end, or more typing than
 *   the budget allows. Both are reported with the names, not a count.
 */

type Fixtures = { walk: Walker };

/** Longer than the recorder has been seen to take to start, on a busy machine. */
const VIDEO_WARMUP_MS = 4500;

export const test = base.extend<Fixtures>({
  walk: async ({ browser }, provide) => {
    const config = readConfig();
    mkdirSync(path.join(config.runDir, "screenshots"), { recursive: true });
    const videoDir = path.join(config.runDir, "_video");

    const context = await browser.newContext({
      viewport: config.viewport,
      deviceScaleFactor: 1,
      locale: "en-GB",
      colorScheme: "light",
      recordVideo: { dir: videoDir, size: config.viewport },
    });
    await context.addInitScript(OVERLAY_SCRIPT);

    const recorder: Recorder = {
      config,
      entries: [],
      failures: [],
      typedMs: 0,
      mailOpens: 0,
      startedAt: Date.now(),
    };

    const page = await context.newPage();
    /* The recorder takes a couple of seconds to start and the blank page is white.
       Wait until it is certainly running, then paint the dark title card and start
       the clock on that instant: the change from white to dark is the one frame
       the video and the run agree on (see `cardStartMs`). */
    await page.waitForTimeout(VIDEO_WARMUP_MS);
    await page.setContent(
      titleCard(config, process.env["WALK_TITLE"] ?? "Product walkthrough"),
    );
    recorder.startedAt = Date.now();
    await page.waitForTimeout(2500);

    /* The observers need to know who is acting, which the walker knows. The
       walker needs the observers to scan a new route. Each is given a way to
       ask the other, so neither has to exist first. */
    let walker: Walker | null = null;
    const observers = new Observers(
      {
        role: () => walker?.where.role() ?? "visitor",
        step: () => walker?.where.step() ?? "",
        now: () => Date.now() - recorder.startedAt,
      },
      [config.webUrl, config.apiUrl, config.mailUrl, config.atlassianUrl],
    );
    await observers.attach(context);
    observers.watch(page);
    walker = new Walker(page, recorder, observers);

    let problem: Error | null = null;
    try {
      await provide(walker);
    } catch (error) {
      problem = error instanceof Error ? error : new Error(String(error));
    }

    /* The video is a file only once the context is closed. */
    const video = page.video();
    await context.close();
    if (video) {
      const target = path.join(config.runDir, "walkthrough.webm");
      await video.saveAs(target).catch(() => undefined);
    }

    const chapters = chaptersOf(recorder.entries);
    writeFileSync(
      path.join(config.runDir, "timeline.json"),
      `${JSON.stringify(recorder.entries, null, 2)}\n`,
    );
    writeFileSync(
      path.join(config.runDir, "chapters.json"),
      `${JSON.stringify(chapters, null, 2)}\n`,
    );
    writeFileSync(path.join(config.runDir, "chapters.vtt"), toVtt(chapters));
    writeFileSync(
      path.join(config.runDir, "observed.json"),
      `${JSON.stringify(observers.list, null, 2)}\n`,
    );

    const matrixPath =
      process.env["WALK_MATRIX"] ??
      path.join(config.outRoot, "coverage-matrix.md");
    let planned: string[] = [];
    let unknown: string[] = [];
    if (existsSync(matrixPath)) {
      const ticked = tickMatrix(
        readFileSync(matrixPath, "utf8"),
        recorder.entries,
      );
      planned = ticked.planned;
      unknown = ticked.unknown;
      writeFileSync(
        path.join(config.runDir, "coverage-matrix.md"),
        ticked.markdown,
      );
    }

    writeFileSync(
      path.join(config.runDir, "run.json"),
      `${JSON.stringify(
        {
          runId: config.runId,
          mode: config.mode,
          final: config.final,
          steps: recorder.entries.length,
          failedSteps: recorder.failures,
          typedMinutes: Math.round((recorder.typedMs / 60_000) * 10) / 10,
          typingBudgetMinutes: config.typingBudgetMs / 60_000,
          mailOpens: recorder.mailOpens,
          observed: observers.list.length,
          rowsStillPlanned: planned,
          unknownRows: unknown,
        },
        null,
        2,
      )}\n`,
    );

    if (problem) throw problem;
    if (unknown.length > 0) {
      throw new Error(
        `Steps claim matrix rows that do not exist: ${unknown.join(", ")}`,
      );
    }
    if (config.final) {
      if (planned.length > 0) {
        throw new Error(
          `The final run left ${String(planned.length)} rows planned: ${planned.join(", ")}`,
        );
      }
      if (recorder.typedMs > config.typingBudgetMs) {
        throw new Error(
          `Typing took ${String(Math.round(recorder.typedMs / 60_000))} minutes against a budget of ${String(config.typingBudgetMs / 60_000)}.`,
        );
      }
    }
  },
});

/* `expect` is deliberately not re-exported. A journey asserts through the walker
   (`see`, `seeUrl`, `seeValue` ...), which is what keeps every assertion
   captioned and counted; a bare `expect` on a page the journey does not hold
   would be a way round both. */
export { by } from "./walker";
export type { Walker };
export const fixtureFile = (name: string): string =>
  path.resolve(__dirname, "../fixtures", name);
