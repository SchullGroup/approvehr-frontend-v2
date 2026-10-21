import type { RunConfig } from "./config";

/**
 * The first thing in the recording: a card saying what it is.
 *
 * It is also the recording's clock. A video only begins when the page first
 * paints, and the page starts as a blank one, so a run that starts timing when
 * the browser opens is ahead of its own video by however long the blank page
 * sat there. Painting this card first and starting the clock the moment it is on
 * screen makes video time and run time the same time, so a chapter marker means
 * what it says without anybody estimating an offset. (An offset estimated from
 * the far end was tried first and was wrong, because the recorder writes a frame
 * only when something changes, so the file can end before the context closes.)
 *
 * It is not in the product's page: it is written into the blank page before the
 * product is ever opened, so it cannot affect what the product does.
 */

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function titleCard(config: RunConfig, title: string): string {
  const kind = config.final
    ? "The recorded walkthrough"
    : `A rehearsal (${config.mode})`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  html, body { margin: 0; height: 100%; }
  body { display: grid; place-items: center; background: #14202b; color: #fff;
         font: 20px/1.5 system-ui, sans-serif; text-align: center; }
  main { max-width: 760px; padding: 0 32px; }
  h1 { font-size: 44px; margin: 0 0 12px; letter-spacing: -0.01em; }
  p { margin: 6px 0; color: #c9d4de; }
  .small { font-size: 16px; color: #9fb3c8; margin-top: 28px; }
</style></head>
<body><main>
  <h1>${esc(title)}</h1>
  <p>${esc(kind)}</p>
  <p class="small">Everything after this card is done by clicking and typing, the way a person would.<br>
  Mail goes to a local inbox and nothing leaves this machine.</p>
</main></body></html>`;
}
