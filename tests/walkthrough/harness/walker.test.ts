// @vitest-environment node
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Page } from "@playwright/test";
import { describe, expect, it } from "vitest";
import type { RunConfig } from "./config";
import type { Observers } from "./observers";
import { Walker, by, keyDelay, type Recorder } from "./walker";

/**
 * The walker's rules, held against a fake page.
 *
 * A fake is enough because everything asserted here is a decision the walker
 * makes before it touches a browser: that a tab is opened once, that an action
 * belongs to a step, and that a failed step ends a strict run and only a chapter
 * of a soft one. What a click does in Chromium is Playwright's; the end-to-end
 * proof of that is the smoke journey, run against the real stack.
 */

const fake = () => {
  const calls: string[] = [];
  const page = {
    goto: async (url: string) => {
      calls.push(`goto ${url}`);
      return null;
    },
    on: () => page,
    evaluate: async () => undefined,
    waitForTimeout: async () => undefined,
    waitForLoadState: async () => undefined,
    /* Playwright writes the file at `path`; the fake has to as well, or the test
       would be asserting on the fake. */
    screenshot: async (options?: { path?: string }) => {
      if (options?.path) writeFileSync(options.path, "");
      return Buffer.alloc(0);
    },
    url: () => "http://localhost:3297/dashboard",
  } as unknown as Page;
  return { page, calls };
};

const setup = (mode: "strict" | "soft" = "strict") => {
  const { page, calls } = fake();
  const dir = mkdtempSync(path.join(os.tmpdir(), "walk-test-"));
  const config = {
    runId: "test",
    mode,
    final: false,
    outRoot: dir,
    runDir: dir,
    webUrl: "http://localhost:3297",
    apiUrl: "http://127.0.0.1:8797",
    mailUrl: "http://127.0.0.1:8798",
    atlassianUrl: "http://127.0.0.1:8799",
    typingBudgetMs: 720_000,
    viewport: { width: 1280, height: 720 },
  } satisfies RunConfig;
  const rec: Recorder = {
    config,
    entries: [],
    failures: [],
    typedMs: 0,
    mailOpens: 0,
    startedAt: Date.now(),
  };
  const observers = { scan: async () => undefined } as unknown as Observers;
  return { walk: new Walker(page, rec, observers), page, calls, rec, dir };
};

describe("one address per tab", () => {
  it("opens the tab once", async () => {
    const { walk, calls } = setup();
    await walk.step({ id: "a", name: "open" }, async () => {
      await walk.open("/");
    });
    expect(calls).toEqual(["goto http://localhost:3297/"]);
  });

  it("refuses to open the same tab twice", async () => {
    const { walk } = setup();
    await expect(
      walk.step({ id: "a", name: "open twice" }, async () => {
        await walk.open("/");
        await walk.open("/hiring");
      }),
    ).rejects.toThrow(/open\(\) was called twice/);
  });

  it("makes a raw goto on the page throw as well, so nothing in this folder can teleport", async () => {
    const { walk, page } = setup();
    await walk.step({ id: "a", name: "open" }, async () => {
      await walk.open("/");
    });
    expect(() => page.goto("http://localhost:3297/payroll")).toThrow(
      /goto was called twice/,
    );
  });
});

describe("every action belongs to a step", () => {
  it("refuses a click outside one", async () => {
    const { walk } = setup();
    await expect(walk.click(by.button("Save"))).rejects.toThrow(
      /outside a step/,
    );
  });

  it("refuses typing, choosing, uploading, going back and asserting outside one", async () => {
    const { walk } = setup();
    for (const action of [
      () => walk.type(by.label("Name"), "x"),
      () => walk.choose(by.label("Role"), "HR"),
      () => walk.upload(by.button("Upload"), "/tmp/x"),
      () => walk.back(),
      () => walk.see(by.heading("Hello")),
      () => walk.pause(1),
    ]) {
      await expect(action()).rejects.toThrow(/outside a step/);
    }
  });

  it("refuses a step inside a step", async () => {
    const { walk } = setup();
    await expect(
      walk.step({ id: "outer", name: "outer" }, async () => {
        await walk.step({ id: "inner", name: "inner" }, async () => undefined);
      }),
    ).rejects.toThrow(/inside another step/);
  });
});

describe("what a step records", () => {
  it("writes an entry with its chapter, role, the rows it covers, and a numbered screenshot", async () => {
    const { walk, rec, dir } = setup();
    await walk.chapter("Owner", "owner", async () => {
      await walk.step(
        { id: "own-01", name: "Sign up", covers: ["own-01"] },
        async () => undefined,
      );
    });
    expect(rec.entries).toHaveLength(1);
    expect(rec.entries[0]).toMatchObject({
      id: "own-01",
      chapter: "Owner",
      role: "owner",
      covers: ["own-01"],
      status: "ok",
      screenshot: "screenshots/001-own-01.png",
    });
    expect(readdirSync(path.join(dir, "screenshots"))).toEqual([
      "001-own-01.png",
    ]);
  });
});

describe("a step that fails", () => {
  const failing = async (walk: Walker) =>
    walk.step({ id: "bad", name: "this fails" }, async () => {
      throw new Error("a person could not do this");
    });

  it("ends a strict run, and still records the failed step", async () => {
    const { walk, rec } = setup("strict");
    await expect(failing(walk)).rejects.toThrow(/a person could not do this/);
    expect(rec.entries.map((e) => [e.id, e.status])).toEqual([
      ["bad", "failed"],
    ]);
  });

  it("ends only its chapter in a soft run: later steps in it do nothing, the next chapter runs", async () => {
    const { walk, rec } = setup("soft");
    await walk.chapter("One", "owner", async () => {
      await failing(walk);
      await walk.step({ id: "after", name: "skipped" }, async () => {
        throw new Error("must not run");
      });
    });
    await walk.chapter("Two", "owner", async () => {
      await walk.step({ id: "next", name: "runs" }, async () => undefined);
    });
    expect(rec.entries.map((e) => [e.id, e.status])).toEqual([
      ["bad", "failed"],
      ["next", "ok"],
    ]);
    expect(rec.failures).toHaveLength(1);
    expect(rec.failures[0]?.message).toContain("a person could not do this");
  });
});

describe("typing", () => {
  it("is paced between 50 and 120 ms a key", () => {
    expect(keyDelay(() => 0)).toBe(50);
    expect(keyDelay(() => 0.999999)).toBe(120);
    for (let i = 0; i < 500; i += 1) {
      const ms = keyDelay(Math.random);
      expect(ms).toBeGreaterThanOrEqual(50);
      expect(ms).toBeLessThanOrEqual(120);
    }
  });
});
