"use client";

import { useState } from "react";
import { Button, FileField } from "@/components/ui";
import {
  MAX_NOTICE_IMAGE_BYTES,
  NOTICE_IMAGE_TYPES,
  type ApiNoticeImage,
  type NoticeImageUpload,
} from "@/lib/api/announcements";

/**
 * The picture on a notice: none, the one it has, or a new one.
 *
 * `value` is what the save sends: `undefined` leaves the stored picture alone,
 * `null` removes it, and an upload replaces it. One picture per notice; it goes
 * on the board and inline in the email.
 */
export function NoticeImageField({
  current,
  value,
  onChange,
  onBusyChange,
}: {
  /** The picture the notice already has, when editing. */
  current?: ApiNoticeImage | null;
  value: NoticeImageUpload | null | undefined;
  onChange: (next: NoticeImageUpload | null | undefined) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const keeping = current && value === undefined;

  if (keeping) {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-body-sm font-medium text-ink">Picture</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-body-sm text-body">{current.filename}</span>
          <Button size="sm" variant="secondary" onClick={() => onChange(null)}>
            Remove picture
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <FileField
        label="Picture"
        help="Optional. A JPG, PNG or WebP under 5 MB. It shows on the notice and in the email."
        accept=".jpg,.jpeg,.png,.webp"
        maxBytes={MAX_NOTICE_IMAGE_BYTES}
        {...(onBusyChange ? { onBusyChange } : {})}
        onAttached={(file) => {
          setProblem(null);
          if (!file) {
            onChange(current ? null : undefined);
            return;
          }
          const type = NOTICE_IMAGE_TYPES.find((t) => t === file.mimeType);
          if (!type) {
            setProblem("Attach a JPG, PNG or WebP picture.");
            onChange(current ? null : undefined);
            return;
          }
          onChange({
            filename: file.filename,
            contentType: type,
            contentBase64: file.contentBase64,
          });
        }}
      />
      {problem && <p className="text-body-sm text-warning-text">{problem}</p>}
    </div>
  );
}
