import { Skeleton } from "@/components/ui";
import { PageBody } from "@/components/portal/shell";

/**
 * What a signed-in route shows while its segment is still arriving.
 *
 * There was no `loading.tsx` anywhere in the app, so a navigation to a route
 * that had to fetch on the server held the *previous* screen on display with no
 * indication anything was happening — the reader clicks Payroll, nothing moves,
 * and they click it again.
 *
 * ## Why a shape rather than a spinner
 *
 * The shell, the sidebar and the header are already painted by the layout above
 * this, so what is missing is one page's worth of content. A skeleton in
 * roughly the shape every screen in this product actually has — a title, a row
 * of stats, a table — reads as "this is loading" without claiming anything
 * about what will land, and it does not shift the page when the real content
 * replaces it.
 *
 * No text. "Loading…" under a skeleton is a second way of saying the thing the
 * skeleton already says, and it is one more string to translate later.
 * `aria-busy` and the label carry it for a screen reader, which is where saying
 * it actually helps.
 */
export default function AppLoading() {
  return (
    <PageBody className="pt-6">
      {/* `PageBody` takes only a className, so the live-region attributes go on
          a wrapper rather than being added to a shared primitive for one
          caller's benefit. */}
      <div
        aria-busy="true"
        aria-label="Loading this screen"
        className="flex flex-col gap-6"
      >
        <Skeleton className="h-8 w-56" />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>

        <Skeleton className="h-72 w-full" />
      </div>
    </PageBody>
  );
}
