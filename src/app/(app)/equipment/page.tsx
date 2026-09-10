import type { Metadata } from "next";
import { MyAssets } from "@/app/(app)/people/assets";
import { PageBody, PageHeader } from "@/components/portal/shell";

export const metadata: Metadata = {
  title: "My equipment",
  description:
    "The laptop, phone and SIM the company has issued you, and how to report a fault on any of them.",
};

/**
 * The employee's own door into equipment.
 *
 * ## Why it needed a route at all
 *
 * `MyAssets` has existed for a while and rendered in exactly one place: a card
 * partway down `/profile`. The nav entry for Equipment is gated on
 * `EDIT_RECORDS`, so an employee had no path to their own kit except finding
 * Profile and scrolling — and no path at all to reporting a fault, which is
 * the one thing on that card they might urgently need.
 *
 * Documents had the same gate and got away with it, because a document request
 * raises a notification that links straight to `/documents`. Nothing raises a
 * notification about a laptop until it is already broken.
 *
 * ## The same component, not a second one
 *
 * `<MyAssets />` with no `employeeId` reads the signed-in person, which is
 * what makes this three lines rather than a screen. The HR view passes an id
 * and gets the same rows without the self-only actions — the component already
 * draws that distinction, and it is the API's distinction rather than this
 * page's invention.
 */
export default function MyEquipmentPage() {
  return (
    <>
      <PageHeader title="My equipment" />
      <PageBody>
        <MyAssets />
      </PageBody>
    </>
  );
}
