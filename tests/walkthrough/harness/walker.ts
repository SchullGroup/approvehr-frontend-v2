import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import type { RunConfig } from "./config";
import type { Observers } from "./observers";
import { normaliseRoute } from "./observers";
import type { TimelineEntry } from "./timeline";

/**
 * The only thing a journey ever holds.
 *
 * ## The rule, enforced by what is not here
 *
 * A journey does what a person does: click, type, choose a file, follow a link,
 * go back, sign out and in. This class offers exactly those, and nothing that
 * reaches into the app. A journey is never handed a `page`, so it has no `goto`,
 * no `evaluate`, no `request`, no cookies, no storage. That is the first line of
 * defence. The second is `walkthrough.guard.test.ts`, which reads every journey
 * file and refuses the words that would be needed to go round it.
 *
 * ## Why every action has to be inside a step
 *
 * A step is the unit of the video: it is captioned, timed, screenshotted and
 * says which rows of the coverage matrix it proves. An action outside one would
 * be in the recording with no caption and in no row, so it throws. In a soft
 * (recon) run a failed step ends its chapter and the run moves on; the later
 * steps of that chapter do nothing, because they would be acting on a state the
 * failure has already made untrue.
 *
 * ## One `goto` per tab
 *
 * The first load of the tab is the only time the address is typed. After that
 * the person clicks. `page.goto` itself is wrapped to throw on a second call, so
 * even code in this folder cannot teleport. The one exception is the mailbox:
 * opening your mail is something a person does by going to another site, so
 * `openMail()` may, and it can only ever go to the mail sink.
 *
 * ## Typing is real
 *
 * Text goes in a key at a time, 50 to 120 ms apart, from a generator seeded by
 * the run id, so two runs pace alike. `fill` is not used: it sets a value in one
 * instant, which is not typing and skips every key handler.
 */

type Role = Parameters<Page["getByRole"]>[0];

export type Target = { describe: string; locate: (page: Page) => Locator };

type Pick = { exact?: boolean; nth?: number };

const pick = (locator: Locator, options?: Pick): Locator =>
  options?.nth === undefined ? locator : locator.nth(options.nth);

/** Say what to click or read, the way a person would: by what is on screen. */
export const by = {
  role: (role: Role, name?: string | RegExp, options?: Pick): Target => ({
    describe: `${role}${name === undefined ? "" : ` "${String(name)}"`}`,
    locate: (page) =>
      pick(
        page.getByRole(role, {
          ...(name === undefined ? {} : { name }),
          ...(options?.exact === undefined ? {} : { exact: options.exact }),
        }),
        options,
      ),
  }),
  button: (name: string | RegExp, options?: Pick): Target =>
    by.role("button", name, options),
  link: (name: string | RegExp, options?: Pick): Target =>
    by.role("link", name, options),
  heading: (name: string | RegExp, options?: Pick): Target =>
    by.role("heading", name, options),
  textbox: (name: string | RegExp, options?: Pick): Target =>
    by.role("textbox", name, options),
  checkbox: (name: string | RegExp, options?: Pick): Target =>
    by.role("checkbox", name, options),
  tab: (name: string | RegExp, options?: Pick): Target =>
    by.role("tab", name, options),
  label: (text: string | RegExp, options?: Pick): Target => ({
    describe: `field "${String(text)}"`,
    locate: (page) =>
      pick(
        page.getByLabel(
          text,
          options?.exact === undefined ? {} : { exact: options.exact },
        ),
        options,
      ),
  }),
  text: (text: string | RegExp, options?: Pick): Target => ({
    describe: `text "${String(text)}"`,
    locate: (page) =>
      pick(
        page.getByText(
          text,
          options?.exact === undefined ? {} : { exact: options.exact },
        ),
        options,
      ),
  }),
  placeholder: (text: string | RegExp, options?: Pick): Target => ({
    describe: `field with placeholder "${String(text)}"`,
    locate: (page) => pick(page.getByPlaceholder(text), options),
  }),
  within: (parent: Target, child: Target): Target => ({
    describe: `${child.describe} in ${parent.describe}`,
    locate: (page) => {
      const inside = parent.locate(page);
      // A child is found by running its own locator inside the parent's.
      return child.locate(inside as unknown as Page);
    },
  }),
};

export type StepMeta = {
  id: string;
  name: string;
  /** Matrix row ids this step proves if it passes. */
  covers?: readonly string[];
};

export type Recorder = {
  config: RunConfig;
  entries: TimelineEntry[];
  /** Failures that did not stop the run (soft mode). */
  failures: {
    step: string;
    chapter: string;
    message: string;
    screenshot: string;
  }[];
  /** Typing time so far, against the budget. */
  typedMs: number;
  mailOpens: number;
  startedAt: number;
};

const STEP_TIMEOUT = 20_000;
const MIN_KEY_MS = 50;
const MAX_KEY_MS = 120;

/** A small seeded generator (mulberry32), so two runs of one id pace alike. */
function seeded(text: string): () => number {
  let seed = 0;
  for (const ch of text) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) | 0;
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const keyDelay = (random: () => number): number =>
  Math.round(MIN_KEY_MS + random() * (MAX_KEY_MS - MIN_KEY_MS));

export class Walker {
  private opened = false;
  private mailing = false;
  private gotos = 0;
  private chapterName = "";
  private roleName = "visitor";
  private stepName = "";
  private caption = "";
  private inStep = false;
  private chapterFailed = false;
  private readonly random: () => number;
  private lastRoute = "";

  constructor(
    private readonly page: Page,
    private readonly rec: Recorder,
    private readonly observers: Observers,
  ) {
    this.random = seeded(rec.config.runId);

    /* One load of the address bar per tab, and the mailbox. The wrapper is on
       the page itself, so nothing in this folder can go round it either. */
    const original = page.goto.bind(page);
    page.goto = ((url: string, options?: Parameters<Page["goto"]>[1]) => {
      this.gotos += 1;
      if (this.gotos > 1 && !this.mailing) {
        throw new Error(
          `goto was called twice on one tab (${url}). A person types the address once and then clicks; a second goto is a teleport.`,
        );
      }
      return original(url, options);
    }) as Page["goto"];

    page.on("domcontentloaded", () => {
      void this.paint();
    });
  }

  /* --------------------------------------------------------------- state */

  /** For the observers: who is acting, in which step, how far into the video. */
  readonly where = {
    role: (): string => this.roleName,
    step: (): string => this.stepName,
    now: (): number => Date.now() - this.rec.startedAt,
  };

  private async paint(): Promise<void> {
    try {
      await this.page.evaluate(
        ([chapter, text]) => {
          (
            window as unknown as {
              __walkOverlay?: { caption: (c: string, t: string) => void };
            }
          ).__walkOverlay?.caption(chapter ?? "", text ?? "");
        },
        [this.chapterLabel(), this.caption],
      );
    } catch {
      /* A page that is mid-navigation cannot be painted on; the next load will. */
    }
  }

  private chapterLabel(): string {
    return this.chapterName === ""
      ? ""
      : `${this.chapterName} · ${this.roleName}`;
  }

  private assertInStep(action: string): void {
    if (!this.inStep) {
      throw new Error(
        `${action} was called outside a step. Every action belongs to a step, so it is captioned, timed and counted against a row of the coverage matrix.`,
      );
    }
  }

  private async settle(ms = 350): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  /** A pause for the viewer, not for the app. */
  async pause(ms: number): Promise<void> {
    this.assertInStep("pause");
    await this.page.waitForTimeout(ms);
  }

  /* ------------------------------------------------------ chapter, step */

  async chapter(
    name: string,
    role: string,
    body: () => Promise<void>,
  ): Promise<void> {
    this.chapterName = name;
    this.roleName = role;
    this.chapterFailed = false;
    await body();
  }

  async step(meta: StepMeta, body: () => Promise<void>): Promise<void> {
    if (this.chapterFailed) return;
    if (this.inStep)
      throw new Error(`Step ${meta.id} started inside another step.`);

    const index = this.rec.entries.length + 1;
    const startMs = this.where.now();
    this.inStep = true;
    this.stepName = meta.id;
    this.caption = meta.name;
    await this.paint();
    /* Long enough to read, so a caption is not a flicker. */
    await this.page.waitForTimeout(
      Math.min(2800, Math.max(1100, meta.name.length * 38)),
    );

    const shot = `screenshots/${String(index).padStart(3, "0")}-${meta.id}.png`;
    let failure: Error | null = null;
    try {
      await body();
      await this.afterAction();
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
    }

    const file = path.join(this.rec.config.runDir, shot);
    mkdirSync(path.dirname(file), { recursive: true });
    await this.page.screenshot({ path: file }).catch(() => undefined);
    this.inStep = false;

    this.rec.entries.push({
      id: meta.id,
      chapter: this.chapterName,
      role: this.roleName,
      name: meta.name,
      covers: [...(meta.covers ?? [])],
      startMs,
      endMs: this.where.now(),
      screenshot: shot,
      status: failure ? "failed" : "ok",
    });

    if (failure) {
      if (this.rec.config.mode === "strict") throw failure;
      this.chapterFailed = true;
      this.rec.failures.push({
        step: meta.id,
        chapter: this.chapterName,
        message: failure.message.slice(0, 1500),
        screenshot: shot,
      });
    }
  }

  /* ------------------------------------------------------------- opening */

  /** The first and only time this tab's address is typed. */
  async open(url: string): Promise<void> {
    this.assertInStep("open");
    if (this.opened) {
      throw new Error(
        "open() was called twice on one tab. After the first load a person clicks.",
      );
    }
    this.opened = true;
    await this.page.goto(new URL(url, this.rec.config.webUrl).toString());
    await this.afterAction();
  }

  /** A person goes to their webmail. The only place a second address may be typed. */
  async openMail(): Promise<void> {
    this.assertInStep("openMail");
    this.mailing = true;
    this.rec.mailOpens += 1;
    try {
      await this.page.goto(this.rec.config.mailUrl);
    } finally {
      this.mailing = false;
    }
    await expect(this.page.getByRole("heading", { name: "Inbox" })).toBeVisible(
      {
        timeout: STEP_TIMEOUT,
      },
    );
  }

  /* ------------------------------------------------------------- actions */

  private async glide(locator: Locator, describe: string): Promise<void> {
    await expect(locator, `${describe} should be on screen`).toBeVisible({
      timeout: STEP_TIMEOUT,
    });
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    if (!box) throw new Error(`${describe} has no position on screen`);
    await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
      steps: 22,
    });
    await this.page.waitForTimeout(140);
  }

  async click(target: Target): Promise<void> {
    this.assertInStep("click");
    const locator = target.locate(this.page);
    await this.glide(locator, target.describe);
    await locator.click({ timeout: STEP_TIMEOUT });
    await this.settle();
    await this.afterAction();
  }

  /**
   * Type into a field a key at a time. The text is never written to the
   * timeline: a step's caption is its author's words, not what was typed, so a
   * password cannot leak into `timeline.json` even though the field masks it on
   * screen.
   */
  async type(target: Target, text: string): Promise<void> {
    this.assertInStep("type");
    await this.click(target);
    for (const ch of text) {
      await this.page.keyboard.type(ch);
      const ms = keyDelay(this.random);
      this.rec.typedMs += ms;
      await this.page.waitForTimeout(ms);
    }
  }

  /** Select what is there and type over it, as a person would. */
  async replace(target: Target, text: string): Promise<void> {
    this.assertInStep("replace");
    await this.click(target);
    await this.page.keyboard.press("ControlOrMeta+A");
    await this.page.keyboard.press("Delete");
    await this.type(target, text);
  }

  async press(key: string): Promise<void> {
    this.assertInStep("press");
    await this.page.keyboard.press(key);
    await this.settle();
    await this.afterAction();
  }

  /** A native `<select>`: the person opens it and chooses a label. */
  async choose(target: Target, label: string): Promise<void> {
    this.assertInStep("choose");
    const locator = target.locate(this.page);
    await this.glide(locator, target.describe);
    await locator.selectOption({ label }, { timeout: STEP_TIMEOUT });
    await this.settle();
  }

  /** Press the button that opens the file dialog and choose a file in it. */
  async upload(target: Target, file: string): Promise<void> {
    this.assertInStep("upload");
    const locator = target.locate(this.page);
    await this.glide(locator, target.describe);
    const [chooser] = await Promise.all([
      this.page.waitForEvent("filechooser", { timeout: STEP_TIMEOUT }),
      locator.click({ timeout: STEP_TIMEOUT }),
    ]);
    await chooser.setFiles(file);
    await this.settle();
  }

  async back(): Promise<void> {
    this.assertInStep("back");
    const before = this.page.url();
    await this.page.goBack();
    await this.settle();
    /* A single-page navigation returns no response, so the only honest check
       that it went anywhere is that the address changed. */
    expect(this.page.url(), "Back should have gone somewhere").not.toBe(before);
    await this.afterAction();
  }

  async forward(): Promise<void> {
    this.assertInStep("forward");
    await this.page.goForward();
    await this.settle();
    await this.afterAction();
  }

  /* ---------------------------------------------------------- assertions */

  async see(target: Target): Promise<void> {
    this.assertInStep("see");
    await expect(
      target.locate(this.page),
      `${target.describe} should be on screen`,
    ).toBeVisible({
      timeout: STEP_TIMEOUT,
    });
  }

  async seeText(text: string | RegExp): Promise<void> {
    await this.see(by.text(text, { nth: 0 }));
  }

  /** Absent, not disabled: nothing on the page matches. */
  async notSee(target: Target): Promise<void> {
    this.assertInStep("notSee");
    await expect(
      target.locate(this.page),
      `${target.describe} should not be on the page`,
    ).toHaveCount(0, { timeout: STEP_TIMEOUT });
  }

  async seeCount(target: Target, count: number): Promise<void> {
    this.assertInStep("seeCount");
    await expect(
      target.locate(this.page),
      `${target.describe} should appear ${String(count)} times`,
    ).toHaveCount(count, { timeout: STEP_TIMEOUT });
  }

  async seeValue(target: Target, value: string | RegExp): Promise<void> {
    this.assertInStep("seeValue");
    await expect(
      target.locate(this.page),
      `${target.describe} should hold the value`,
    ).toHaveValue(value, { timeout: STEP_TIMEOUT });
  }

  async seeDisabled(target: Target): Promise<void> {
    this.assertInStep("seeDisabled");
    await expect(
      target.locate(this.page),
      `${target.describe} should be disabled`,
    ).toBeDisabled({
      timeout: STEP_TIMEOUT,
    });
  }

  async seeUrl(pattern: RegExp): Promise<void> {
    this.assertInStep("seeUrl");
    await expect(this.page).toHaveURL(pattern, { timeout: STEP_TIMEOUT });
  }

  /* ------------------------------------------------------------ internals */

  /** After anything that may have changed the page: scan a route the first time it is seen. */
  private async afterAction(): Promise<void> {
    await this.paint();
    let route = "";
    try {
      route = normaliseRoute(new URL(this.page.url()).pathname);
    } catch {
      return;
    }
    if (route === this.lastRoute) return;
    this.lastRoute = route;
    await this.page.waitForLoadState("load");
    await this.page.waitForTimeout(700);
    await this.observers.scan(this.page);
  }
}
