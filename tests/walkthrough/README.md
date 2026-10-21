# The walkthrough harness

Records a module of the product being used by people, start to finish, and writes down what a person would have
run into. It produces a video (`walkthrough.webm`, and an `.mp4` with chapters when ffmpeg is available), a
timeline, screenshots, and a list of everything the browser reported along the way.

It is **not** part of `npm run check`, `npm run e2e` or CI. A walkthrough needs a staged stack and a recording takes
the better part of an hour. The only parts of this folder that run in the normal suite are its own unit tests
(`*.test.ts`), which are cheap.

## The one rule

A journey does what a person can do: click, type, choose a file, follow a link, go back, sign out and in. It cannot
read the database, call the API, edit storage or cookies, `goto` its way round, guess what is on screen with a
conditional, or skip a step that fails. If a step fails the way a user would fail, the run fails, and that failure
is a finding.

That is held two ways, so a paragraph is not the only thing standing in the way:

1. **A journey is never handed a `page`.** It gets a `Walker` (`harness/walker.ts`) that offers exactly the verbs
   above and nothing that reaches into the app. The tab's address is typed once (`open`); `page.goto` itself is
   wrapped to throw on a second call. The mailbox is the one named exception (`openMail`), because opening your mail
   is something a person does by going to another site.
2. **`walkthrough.guard.test.ts` reads every journey file as a syntax tree** and refuses the names and statements
   that would be needed to go round the first. It reads syntax rather than text, so a caption saying "Fetch the
   report" is fine and a real `fetch(` is not. The harness and stage files are exempt by name, each with a reason,
   and a file nobody listed is held to the rules.

## What is in here

| Path | What it is |
| ---- | ---------- |
| `journey/*.walk.ts` | The journeys. `*.walk.ts` so that vitest (which matches `*.test.ts`) never picks one up. |
| `harness/walker.ts` | The actor API a journey holds. Every action must be inside a captioned, timed step. |
| `harness/observers.ts` | Listens without acting: console, page errors, failed and failing requests, an accessibility scan on each new route, and anything that tries to leave the machine (blocked, and recorded). |
| `harness/overlay.ts` | The cursor, click ripple and caption bar, drawn inside the page so they are in the recording by construction. |
| `harness/title-card.ts` | The recording's opening card, which is also its clock (see below). |
| `harness/timeline.ts` | Pure: chapters, `chapters.vtt`, ffmpeg chapters, and the coverage ticks. |
| `harness/fixtures.ts` | Makes the browser page, runs the journey, and writes the run's files whatever happened. |
| `harness/config.ts` | Reads the environment. `WALK_OUT` has no default on purpose (see below). |
| `people.ts` | The fictional people, one per role, on `.example` addresses, and run-time passwords that are never written down. |
| `stage/stage.ts` | Brings the stack up and down. |
| `stage/mail-sink.ts` | A local stand-in for the mail provider, with an inbox page a journey can open. |
| `stage/atlassian-standin.ts`, `stage/jira-fixture.ts` | A local stand-in for Atlassian's sign-in and Jira Cloud. Its consent page says on its face that it is not Atlassian. |
| `stage/encode.ts` | `walkthrough.webm` into `walkthrough.mp4` with the run's chapters. |
| `../../playwright.walkthrough.config.ts` | The runner's config. One worker, no retries, no parallelism. |

## Running it

The stack needs a backend checkout that has `RESEND_API_BASE_URL` and `JIRA_AUTH_BASE_URL` / `JIRA_API_BASE_URL`
(backend PRs #210 and #211), a Postgres you can create databases in, and this repository built. Nothing is read from
the repository for credentials: `WALK_PG_ADMIN_URL` is yours to give.

```bash
export WALK_OUT=<the MAIN checkout>/out/walkthrough/<slug>     # never a worktree: it is removed with the branch
export WALK_BACKEND_DIR=<backend checkout>
export WALK_PG_ADMIN_URL=postgresql://user:password@127.0.0.1:5432

npx tsx tests/walkthrough/stage/stage.ts up --fresh      # empty database, migrated, never seeded
WALK_RUN_ID=rehearsal-1 npx playwright test -c playwright.walkthrough.config.ts
WALK_FFMPEG=/path/to/ffmpeg npx tsx tests/walkthrough/stage/encode.ts "$WALK_OUT/_evidence/rehearsal-1"
npx tsx tests/walkthrough/stage/stage.ts down [--drop-db]
```

- **The database name** must be `wip_<something>_walkthrough`. After creating it, the stage asks Postgres which
  database it is connected to before it migrates; the answer from Postgres, not the string in a variable, is believed.
- **Every run that creates an account needs a fresh database** (`stage up --fresh`): the journeys sign people up.
- **The API is started with no `REDIS_URL`**, so its worker polls the database and stays off any shared Redis, and
  with the mail provider's address and Atlassian's two hosts pointed at the sinks, so nothing can leave the machine.
- **`WALK_MODE=soft`** (recon only): a failed step is recorded and the run moves on to the next chapter. The default,
  `strict`, stops at the first failure. Only a strict run started with `WALK_FINAL=1` writes the deliverables to the
  output root; any other run goes to `_evidence/<run id>/`.
- **`WALK_MATRIX`** points at the coverage matrix (default `$WALK_OUT/coverage-matrix.md`). A step names the rows it
  covers; a passing step ticks them; the final run fails while any row is still `planned`.

## Writing a journey

```ts
import { by, test } from "../harness/fixtures";
import { PEOPLE, passwordFor } from "../people";

test("owner signs up", async ({ walk }) => {
  await walk.chapter("Owner", "owner", async () => {
    await walk.step({ id: "own-01", name: "They create the company's account", covers: ["own-01"] }, async () => {
      await walk.open("/register");
      await walk.type(by.label("Company name"), "Fictional Works");
      await walk.type(by.textbox(/^Password/), passwordFor("owner"));
      await walk.click(by.button("Create account"));
      await walk.seeUrl(/dashboard/);
    });
  });
});
```

Say what to click by what is on screen (`by.button`, `by.link`, `by.heading`, `by.label`, `by.textbox`, `by.text`).
Assert with `see`, `seeUrl`, `seeValue`, `seeCount`, `notSee` (absent, not merely disabled). Keep loops and data in
the journey but no `if`: a conditional is a guess, and a guess hides a finding.

## The recording's clock

Playwright's recorder takes a couple of seconds to start after the page is created, and nothing in the file says how
many (2.3 s in the measured runs, and it varies with load). So the run waits until the recorder is certainly running
(the blank page is white), then paints the dark **title card** and starts its own clock on that instant. The
white-to-dark change is the one frame the video and the run agree on: `encode.ts` finds it from the brightness of each
frame and puts the chapters on the video's clock. Measured against the captions on screen, the markers land within
the 0.1 s the check could resolve. If the recording began *after* the card, there is no white frame, and `encode.ts`
says so instead of guessing.

(Two earlier approaches were wrong and are worth not repeating: starting the clock when the browser opens, which
leaves every marker early by the recorder's start-up delay, and estimating the offset from the end of the file, which
fails because the recorder pads about a second past the close.)

## What the observers record

`observed.json`, one line per thing: kind (`console`, `pageerror`, `requestfailed`, `http`, `external`, `axe`),
severity, route, role, step, and the message. Serious and critical accessibility violations are blockers, a
hydration error is a blocker, any other console error is major. Some of it is expected (a sign-in form's first look
at the session endpoint); the report says which route and step it came from so the reader can tell.

## Not demonstrable here, and said so

Reading or downloading a CV (the backend has no file store), AI suggestions (no key), real SMS, a real payment
webhook, waiting 30 days. These go on the PDF's "Not demonstrable here" list; they are never skipped silently.
