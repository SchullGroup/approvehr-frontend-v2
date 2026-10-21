import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

/**
 * Catches every address no route in the product matches, and hands it to
 * `(app)/not-found.tsx`.
 *
 * Next sends a URL that matches **nothing** to the root `app/not-found.tsx`,
 * which here is the marketing site's 404 with its own nav and footer — and a
 * nested `not-found.tsx` is only consulted when a route *inside* its segment
 * calls `notFound()`. So a signed-in person who mistyped `/people/leev` was shown
 * the sales site. A catch-all inside the group is how an unmatched address gets
 * to be a route in it, and so gets the product's chrome and the product's words.
 *
 * It never renders anything of its own, and it matches only what no more
 * specific route does, so it cannot shadow a real page. A signed-out visitor
 * reaches the sign-in screen first, as at every other address in the product, and
 * the not-found state once they are in.
 */
export default function UnmatchedAddress(): never {
  notFound();
}
