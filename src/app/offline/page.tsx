import type { Metadata } from "next";
import { ArrowLeftRight, ShieldCheck, Wifi, WifiOff } from "lucide-react";
import { HERO_BLUE, HeroBackdrop } from "@/components/ui/hero-backdrop";

export const metadata: Metadata = { title: "No connection" };

/**
 * What the app shows when the device has no network.
 *
 * ## Why this page exists rather than the browser's own error
 *
 * Installed with `display: standalone` there is no address bar and no reload
 * button, so a failed navigation shows the browser's offline page inside what
 * the reader believes is an app. It does not carry our name, it offers a
 * refresh control that is not there, and it reads as ApproveHR being broken
 * rather than as the connection being down.
 *
 * ## It states the real reason rather than a generic apology
 *
 * A company's people, payroll and attendance live on a server. There is no
 * cached copy of any of it on the device and there should not be — a stale
 * salary or a stale leave balance read as current is the class of wrong this
 * product is built to refuse. So this page says the data is on a server rather
 * than implying something failed to load, which is the same argument
 * `components/portal/auth-gate.tsx` makes for its own unreachable state.
 *
 * ## It carries its own styles
 *
 * `public/sw.js` caches this one HTML document and nothing else, deliberately
 * (see its header): no stylesheet, no script bundle, no font. Offline, the
 * `<link>` to the app's CSS may or may not be in the browser's HTTP cache. A
 * page that needed it would sometimes arrive as bare text, which is the worst
 * moment to look broken. So everything this page needs is in this file: a
 * `<style>` element with plain CSS (never below the 14px floor), inline SVG for
 * the symbol and the backdrop, and the system font stack as the fallback for
 * Geist. It follows the app's own dark theme through `data-theme`, which the
 * root layout's init script sets from the very same HTML.
 *
 * ## It reopens the app when the connection returns
 *
 * A few lines of plain inline script (not React: nothing here is hydrated
 * offline) listen for the browser's `online` event and navigate to the
 * dashboard, so somebody who walked back into signal does not have to press
 * anything. It fires once per change of state, so it cannot loop. Without it
 * the page is still complete: the button is an ordinary link that re-issues the
 * navigation, which is all "try again" ever meant.
 *
 * Served by `public/sw.js` on a navigation the network refused. It is a normal
 * route as well, so it renders identically if anybody reaches it directly.
 */
export default function OfflinePage() {
  return (
    <main id="main" className="ahr-offline">
      <style>{CSS}</style>

      <header className="ahr-offline-hero">
        <HeroBackdrop />
        <div className="ahr-offline-hero-inner">
          <span aria-hidden="true" className="ahr-offline-glyph">
            <WifiOff width={40} height={40} strokeWidth={1.75} />
          </span>
          <h1>No connection</h1>
          <p>ApproveHR can&rsquo;t be reached right now.</p>
        </div>
      </header>

      <section className="ahr-offline-body">
        <p className="ahr-offline-lead">
          ApproveHR could not reach the server. Your company&rsquo;s people,
          payroll and attendance are kept there rather than on this device, so
          there is nothing to show until the connection is back.
        </p>

        <ul className="ahr-offline-tips">
          <li>
            <span aria-hidden="true" className="ahr-offline-tile">
              <Wifi width={20} height={20} strokeWidth={1.75} />
            </span>
            <span>Check that mobile data or Wi-Fi is switched on.</span>
          </li>
          <li>
            <span aria-hidden="true" className="ahr-offline-tile">
              <ArrowLeftRight width={20} height={20} strokeWidth={1.75} />
            </span>
            <span>Try the other one: from Wi-Fi to mobile data, or back.</span>
          </li>
          <li>
            <span aria-hidden="true" className="ahr-offline-tile">
              <ShieldCheck width={20} height={20} strokeWidth={1.75} />
            </span>
            <span>
              Anything you clocked or typed before the signal went was either
              sent or never sent at all. Nothing is half-saved.
            </span>
          </li>
        </ul>

        {/* A plain link, not a button with an onClick. This page is served by a
            service worker to a document that has no JavaScript running yet, so a
            control that needs React would be a dead button, the exact thing this
            codebase keeps recording. A link re-issues the navigation. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages --
            deliberately not a `Link`: a router link needs the very JavaScript
            this page is served without, and a plain navigation is the whole of
            "try again". */}
        <a href="/dashboard" className="ahr-offline-button">
          Try again
        </a>

        <p className="ahr-offline-note">
          ApproveHR will reopen by itself as soon as you are back online.
        </p>
      </section>

      <script dangerouslySetInnerHTML={{ __html: ONLINE_SCRIPT }} />
    </main>
  );
}

/** Goes to the dashboard when the browser says the network is back. Once per change, so it cannot loop. */
const ONLINE_SCRIPT = `window.addEventListener("online",function(){window.location.replace("/dashboard");});`;

/*
 * Plain CSS, scoped by the `ahr-offline` prefix so it neither depends on nor disturbs the app's own classes.
 * Sizes are in rem and none is below 0.875rem (14px). Colours are the app's tokens written out, because the
 * custom properties live in the stylesheet this page cannot rely on: light is the canvas, ink, body and
 * indigo; dark is the same set under `data-theme="dark"`.
 */
const CSS = `
.ahr-offline {
  --ahr-canvas: #f7f9fb;
  --ahr-ink: #0a1f2d;
  --ahr-body: #4a5a68;
  --ahr-tile: #eef1fa;
  --ahr-tile-ink: #2b3990;
  --ahr-button: #2b3990;
  --ahr-button-ink: #ffffff;
  box-sizing: border-box;
  min-height: 100vh;
  min-height: 100dvh;
  margin: 0;
  display: flex;
  flex-direction: column;
  background: var(--ahr-canvas);
  color: var(--ahr-body);
  font-family: var(--font-geist-sans, system-ui), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
:root[data-theme="dark"] .ahr-offline {
  --ahr-canvas: #0b121b;
  --ahr-ink: #edf1f4;
  --ahr-body: #9ba9b5;
  --ahr-tile: #1b2242;
  --ahr-tile-ink: #aab8f5;
  --ahr-button: #ffffff;
  --ahr-button-ink: #1c2872;
}
.ahr-offline *, .ahr-offline *::before, .ahr-offline *::after { box-sizing: border-box; }
/* The layout's skip link is hidden by a class from the stylesheet this page cannot rely on. Without it, it would
   sit unstyled in the corner of the very page that is meant to look finished. Hidden until focused, as designed. */
body:has(.ahr-offline) .skip-link:not(:focus) {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.ahr-offline-hero {
  position: relative;
  overflow: hidden;
  background: ${HERO_BLUE.from};
  color: #ffffff;
  padding: 4.5rem 1.5rem 3.5rem;
  flex: 0 0 auto;
}
.ahr-offline-hero-inner {
  position: relative;
  max-width: 34rem;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.75rem;
}
.ahr-offline-glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 5.5rem;
  height: 5.5rem;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.5);
  color: #ffffff;
  margin-bottom: 0.5rem;
}
.ahr-offline-hero h1 {
  margin: 0;
  font-size: 2.25rem;
  line-height: 1.15;
  font-weight: 650;
  letter-spacing: -0.02em;
  color: #ffffff;
}
.ahr-offline-hero p {
  margin: 0;
  font-size: 1.125rem;
  color: rgba(255, 255, 255, 0.86);
}
.ahr-offline-body {
  width: 100%;
  max-width: 34rem;
  margin: 0 auto;
  padding: 2rem 1.5rem 3rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
.ahr-offline-lead {
  margin: 0;
  font-size: 1rem;
  color: var(--ahr-ink);
}
.ahr-offline-tips {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.ahr-offline-tips li {
  display: flex;
  align-items: flex-start;
  gap: 0.875rem;
  font-size: 1rem;
}
.ahr-offline-tips li > span:last-child { padding-top: 0.5rem; }
.ahr-offline-tile {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.75rem;
  background: var(--ahr-tile);
  color: var(--ahr-tile-ink);
}
.ahr-offline-button {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 3rem;
  border-radius: 0.75rem;
  background: var(--ahr-button);
  color: var(--ahr-button-ink);
  font-size: 1rem;
  font-weight: 600;
  text-decoration: none;
}
.ahr-offline-button:hover { filter: brightness(1.08); }
.ahr-offline-button:focus-visible { outline: 3px solid #4059d3; outline-offset: 3px; }
.ahr-offline-note {
  margin: -0.5rem 0 0;
  text-align: center;
  font-size: 0.875rem;
}
@media (min-width: 40rem) {
  .ahr-offline-hero { padding: 6rem 2rem 4.5rem; }
  .ahr-offline-hero h1 { font-size: 2.75rem; }
  .ahr-offline-body { padding-top: 2.5rem; }
}
`;
