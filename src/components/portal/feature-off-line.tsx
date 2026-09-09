"use client";

import Link from "next/link";
import { NOTICE_LINK, NoticeLine } from "@/components/portal/notice-line";
import { FEATURE_COPY, useFeatures } from "@/lib/store/features";
import type { FeatureKey } from "@/lib/api/setup";

/**
 * One line, on a screen whose module is switched off.
 *
 * ## The gap this closes
 *
 * Fourteen sidebar entries are gated on a feature flag, and `nav.tsx` hides
 * the entry when the flag is false. Nothing else changes: the route still
 * works, the API still answers, and somebody who arrives by bookmark, by a
 * link a colleague sent, or from the assistant uses a module their colleagues
 * cannot find — with no way to know that is what is happening.
 *
 * The original complaint was about exactly this, on loans: *"I couldn't find
 * the loans module."* It was complete in both repos and switched off by one
 * flag. Settings → Features is linked now, which fixes finding the switch. This
 * fixes the other half — knowing there is a switch to find.
 *
 * ## Why a line and not a block, and why it does not refuse
 *
 * It **does not gate anything.** The screen works, the API allows it, and
 * turning a discoverability problem into a locked door would remove
 * capability to explain a setting. So this states a fact and links to the
 * switch; everything on the page keeps working.
 *
 * And it is a line, not a card. This is reference-shaped detail about a
 * setting somebody else chose — the reader's next five seconds are the work
 * they came to do, not this. A tinted panel with a heading and a paragraph is
 * exactly the clutter the layout complaint was about.
 *
 * Renders **nothing** while the flags are still loading, and nothing when the
 * module is on — so the common case costs no space and no flicker.
 */
export function FeatureOffLine({ feature }: { feature: FeatureKey }) {
  const features = useFeatures();

  /* `=== false` and not `!features[feature]`: undefined is "not answered yet",
     and a line that appears a moment late is better than one that appears and
     is taken away. Same reasoning `useIsManager` records for its count. */
  if (features.loading || features[feature] !== false) return null;

  return (
    <NoticeLine tone="muted">
      {FEATURE_COPY[feature].label} is switched off for your company, so it is
      hidden from the sidebar. Everything here still works.
      <Link className={NOTICE_LINK} href="/settings/features">
        Switch it on
      </Link>
    </NoticeLine>
  );
}
