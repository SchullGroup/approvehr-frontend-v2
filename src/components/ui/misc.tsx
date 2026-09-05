"use client";

import { useCallback, useRef, useState } from "react";
import { UploadCloud, FileText, X, Check } from "lucide-react";
import { cn } from "@/lib/cn";

/* Avatar, Timeline, FileDrop, DescriptionList and Tooltip. */

export function Avatar({
  name,
  src,
  size = "md",
  tone = "neutral",
  className,
}: {
  name: string;
  src?: string;
  size?: "xs" | "sm" | "md" | "lg";
  tone?: "neutral" | "accent" | "ink";
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  const sizes = {
    xs: "size-6 text-meta",
    sm: "size-8 text-meta",
    md: "size-10 text-body-sm",
    lg: "size-14 text-body-sm",
  } as const;

  const tones = {
    neutral: "bg-sunken text-body",
    accent: "bg-accent-soft text-accent-text",
    ink: "bg-fill-strong text-white",
  } as const;

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className={cn(
          "shrink-0 rounded-full object-cover",
          sizes[size],
          className,
        )}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        sizes[size],
        tones[tone],
        className,
      )}
    >
      {initials}
    </span>
  );
}

/* -------------------------------------------------------------------------- */

export type TimelineEntry = {
  id: string;
  title: string;
  detail?: React.ReactNode;
  timestamp: string;
  actor?: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "accent";
  icon?: React.ReactNode;
};

export function Timeline({
  entries,
  className,
}: {
  entries: TimelineEntry[];
  className?: string;
}) {
  const dots = {
    neutral: "bg-line-strong",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    accent: "bg-accent",
  } as const;

  return (
    <ol className={cn("flex flex-col", className)}>
      {entries.map((entry, i) => (
        <li key={entry.id} className="relative flex gap-4 pb-6 last:pb-0">
          {i < entries.length - 1 && (
            <span
              aria-hidden="true"
              className="absolute left-[11px] top-6 bottom-0 w-px bg-line"
            />
          )}
          <span
            aria-hidden="true"
            className={cn(
              "relative z-10 mt-1 flex size-6 shrink-0 items-center justify-center rounded-full border-4 border-surface",
              entry.icon
                ? "bg-sunken text-body [&>svg]:size-3"
                : dots[entry.tone ?? "neutral"],
            )}
          >
            {entry.icon}
          </span>

          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <p className="text-body-sm font-medium text-ink">{entry.title}</p>
              <time className="tabular shrink-0 text-meta text-muted">
                {entry.timestamp}
              </time>
            </div>
            {entry.actor && (
              <p className="mt-0.5 text-meta text-muted">
                by {entry.actor}
              </p>
            )}
            {entry.detail && (
              <div className="mt-1.5 text-body-sm leading-relaxed text-body">
                {entry.detail}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

/* -------------------------------------------------------------------------- */

export type DroppedFile = { id: string; name: string; size: number };

export function FileDrop({
  label,
  hint,
  accept = ".pdf,.doc,.docx,.jpg,.png",
  multiple = true,
  files,
  onFilesChange,
  className,
}: {
  label: string;
  hint?: string;
  accept?: string;
  multiple?: boolean;
  files: DroppedFile[];
  onFilesChange: (files: DroppedFile[]) => void;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const add = useCallback(
    (list: FileList | null) => {
      if (!list) return;
      const next = Array.from(list).map((f) => ({
        id: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 8)}`,
        name: f.name,
        size: f.size,
      }));
      onFilesChange(multiple ? [...files, ...next] : next.slice(0, 1));
    },
    [files, multiple, onFilesChange],
  );

  return (
    <div className={className}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(e.dataTransfer.files);
        }}
        className={cn(
          "rounded-lg border-2 border-dashed p-6 text-center transition-colors duration-150",
          dragging
            ? "border-accent bg-accent-soft"
            : "border-line-strong bg-canvas",
        )}
      >
        <UploadCloud
          aria-hidden="true"
          className="mx-auto size-6 text-faint"
        />
        <p className="mt-3 text-body-sm text-body">
          Drag files here, or{" "}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="font-medium text-accent-text underline underline-offset-2 hover:no-underline"
          >
            {label}
          </button>
        </p>
        {hint && <p className="mt-1 text-meta text-muted">{hint}</p>}

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
          className="sr-only-focusable"
          aria-label={label}
        />
      </div>

      {files.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-3 rounded-md border border-line bg-surface px-3 py-2.5"
            >
              <FileText aria-hidden="true" className="size-4 shrink-0 text-faint" />
              <span className="min-w-0 flex-1 truncate text-body-sm text-ink">
                {f.name}
              </span>
              <span className="tabular shrink-0 text-meta text-muted">
                {(f.size / 1024).toFixed(0)} KB
              </span>
              <button
                type="button"
                onClick={() => onFilesChange(files.filter((x) => x.id !== f.id))}
                aria-label={`Remove ${f.name}`}
                className="shrink-0 rounded-sm p-1 text-muted hover:bg-sunken hover:text-danger-text"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Key and value pairs. Used across contracts, profiles and invoices.
 *
 * ## Two layouts, and when the grid is the wrong one
 *
 * `stack` is the original: the term above its value, in one to three columns.
 * It is right when the values are short and of similar length, and wrong in a
 * narrow container — because a CSS grid gives every cell in a row the height of
 * the tallest one. One value that wraps inflates the row beside it, so a list of
 * six short facts in a side panel reads as loose and unevenly spaced when only
 * one of the six is actually long. That is what it looked like in the leave
 * approval panel.
 *
 * `rows` is the shape the rest of the app had already settled on by hand — see
 * the summary lists in `people/new`, `hiring/requisitions/new` and the payment
 * check panel: term left, value right, a hairline between, and each fact taking
 * exactly the height it needs. Use it in drawers and anywhere else narrow.
 * `columns` does not apply to it.
 */
export function DescriptionList({
  items,
  columns = 2,
  layout = "stack",
  className,
}: {
  items: { term: string; value: React.ReactNode }[];
  columns?: 1 | 2 | 3;
  layout?: "stack" | "rows";
  className?: string;
}) {
  const cols = {
    1: "sm:grid-cols-1",
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-3",
  } as const;

  if (layout === "rows") {
    return (
      <dl className={cn("divide-y divide-line", className)}>
        {items.map((item) => (
          <div
            key={item.term}
            className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
          >
            <dt className="shrink-0 text-meta text-muted">{item.term}</dt>
            <dd className="min-w-0 text-right text-body-sm text-ink">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-4", cols[columns], className)}>
      {items.map((item) => (
        <div key={item.term} className="min-w-0">
          <dt className="text-meta font-medium text-muted">{item.term}</dt>
          <dd className="mt-1 text-body-sm text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* -------------------------------------------------------------------------- */

/** A short list of satisfied requirements. Pairs a tick with a text label. */
export function CheckList({
  items,
  className,
}: {
  items: string[];
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-col gap-2", className)}>
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5">
          <Check
            aria-hidden="true"
            strokeWidth={3}
            className="mt-0.5 size-3.5 shrink-0 text-success-text"
          />
          <span className="text-body-sm leading-relaxed text-body">
            {item}
          </span>
        </li>
      ))}
    </ul>
  );
}
