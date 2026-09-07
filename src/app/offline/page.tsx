import type { Metadata } from "next";

export const metadata: Metadata = { title: "No connection" };

/**
 * What an installed app shows when the phone has no network.
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
 * cached copy of any of it on the phone and there should not be — a stale
 * salary or a stale leave balance read as current is the class of wrong this
 * product is built to refuse. So this page says the data is on a server rather
 * than implying something failed to load, which is the same argument
 * `components/portal/auth-gate.tsx` makes for its own unreachable state.
 *
 * Served by `public/sw.js` on a navigation the network refused. It is a normal
 * route as well, so it renders identically if anybody reaches it directly.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-canvas px-6 py-16 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-h3 text-ink">No connection</h1>
        <p className="mx-auto max-w-sm text-body-sm leading-relaxed text-body">
          ApproveHR could not reach the server. Your company&rsquo;s people,
          payroll and attendance are kept there rather than on this phone, so
          there is nothing to show until the connection is back.
        </p>
      </div>

      <ul className="mx-auto flex max-w-sm flex-col gap-1.5 text-left text-meta text-muted">
        <li>&middot; Check whether you have mobile data or Wi-Fi.</li>
        <li>&middot; If you are on Wi-Fi, try mobile data instead.</li>
        <li>
          &middot; Anything you clocked or typed before you lost signal was
          already sent, or was never sent at all. Nothing is half-saved.
        </li>
      </ul>

      {/* A plain link, not a button with an onClick. This page is served by a
          service worker to a document that has no JavaScript running yet, so a
          control that needs React would be a dead button — the exact thing this
          codebase keeps recording. A link re-issues the navigation, which is
          all "try again" ever meant. */}
      <a
        href="/dashboard"
        className="rounded-md bg-accent px-4 py-2 text-body-sm font-medium text-white"
      >
        Try again
      </a>
    </main>
  );
}
