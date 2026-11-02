"use client";

import { useEffect, useState } from "react";
import { announcementsApi } from "@/lib/api/announcements";
import { cn } from "@/lib/cn";

/**
 * A notice's picture.
 *
 * Fetched with the session's token and shown from an object URL, because an
 * `<img src>` pointing at the API cannot carry the bearer token. A picture
 * that fails to load is simply not shown: the words are the notice.
 */
export function NoticeImage({
  id,
  alt,
  className,
}: {
  id: string;
  alt: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let made: string | null = null;
    announcementsApi
      .image(id, controller.signal)
      .then((blob) => {
        made = URL.createObjectURL(blob);
        setUrl(made);
      })
      .catch(() => setUrl(null));
    return () => {
      controller.abort();
      if (made) URL.revokeObjectURL(made);
    };
  }, [id]);

  if (!url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- an object URL, not an optimisable asset
    <img
      src={url}
      alt={alt}
      className={cn(
        "max-h-80 w-auto max-w-full rounded-lg border border-line",
        className,
      )}
    />
  );
}
