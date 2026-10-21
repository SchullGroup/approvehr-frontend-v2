import { Callout } from "@/components/ui";
import type { ImportCheckNotice } from "@/lib/imports/surface";

/**
 * What a surface wants said about the whole file, above the report.
 *
 * Rendered as ordinary callouts and never as a gate: nothing here changes whether
 * the button below it works. It sits beside the page's own error callout rather
 * than inside `CheckReport`, which keeps this a sentence about the file and the
 * report a list of rows. A surface with nothing to say passes nothing and this
 * renders nothing — an absent notice is not a notice reading zero.
 */
export function CheckNotices({
  notices,
}: {
  notices: readonly ImportCheckNotice[];
}) {
  return (
    <>
      {notices.map((notice) => (
        <Callout key={notice.title} tone={notice.tone} title={notice.title}>
          {notice.body}
        </Callout>
      ))}
    </>
  );
}
