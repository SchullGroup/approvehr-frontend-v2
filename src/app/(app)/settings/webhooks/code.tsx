"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button, formatMoney } from "@/components/ui";
import { asJson, koboFields } from "@/lib/api/webhooks";

/**
 * The bits of this module that are literally bytes on a wire.
 *
 * ## Why these blocks are monospace when nothing else in the product is
 *
 * `globals.css` says no monospace family is defined, by design — and for a
 * payroll product read by business owners that is right. This screen is the
 * exception and the reason is specific: a 64-character hex digest, a raw JSON
 * body and a header value are things somebody compares **character by
 * character** against what their own server computed. In a proportional font,
 * `1` and `l` and `0` and `O` stop being distinguishable, and the whole point of
 * showing the signed string is to let a person spot the one byte that differs.
 * So these three components use the browser's monospace stack and nothing else
 * in the app does.
 *
 * Every block scrolls inside itself. A payroll payload has long lines and the
 * page must not scroll sideways.
 */

const MONO =
  "font-mono text-meta leading-relaxed whitespace-pre " +
  "text-body [tab-size:2]";

/* ------------------------------------------------------------------- copying */

/**
 * Copy one string.
 *
 * Reports failure rather than swallowing it: `navigator.clipboard` is not
 * available over plain http, and a Copy button that silently does nothing is
 * worse than one that says to select the text instead.
 */
export function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [result, setResult] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (result === "idle") return;
    const timer = window.setTimeout(() => setResult("idle"), 2500);
    return () => window.clearTimeout(timer);
  }, [result]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setResult("copied");
    } catch {
      setResult("failed");
    }
  };

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Button variant="secondary" size="sm" onClick={() => void copy()}>
        {result === "copied" ? (
          <Check aria-hidden="true" className="size-4" />
        ) : (
          <Copy aria-hidden="true" className="size-4" />
        )}
        {result === "copied" ? "Copied" : label}
      </Button>
      <span aria-live="polite" className="text-meta text-danger-text">
        {result === "failed" ? "Select the text and copy it by hand." : ""}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------- blocks */

/** One scrollable monospace block. Use for a header value or a signed string. */
export function CodeBlock({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-sunken">
      <pre className={cn(MONO, "p-3", className)}>{children}</pre>
    </div>
  );
}

/** A short value on one line — a URL, a digest, a header. Wraps rather than clips. */
export function CodeInline({ children }: { children: string }) {
  return (
    <span className="font-mono text-meta break-all text-ink">{children}</span>
  );
}

/**
 * A JSON payload, with its money spelled out underneath.
 *
 * The JSON is printed **verbatim**, because it is what a receiver will parse and
 * reformatting a `…Kobo` field into naira here would document a wire format the
 * API does not speak. The naira figures sit beside it instead — full precision
 * and thousands separators, never abbreviated, because these are the figures
 * somebody reconciles against a bank statement.
 */
export function PayloadBlock({
  value,
  title,
  copyLabel = "Copy JSON",
}: {
  value: unknown;
  title?: string;
  copyLabel?: string;
}) {
  const json = asJson(value);
  const money = koboFields(value);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {title && (
          <p className="text-body-sm font-medium text-ink">{title}</p>
        )}
        <CopyButton value={json} label={copyLabel} />
      </div>

      <CodeBlock>{json}</CodeBlock>

      {money.length > 0 && (
        <dl className="flex flex-col gap-1 rounded-md border border-line bg-canvas p-3">
          <p className="text-meta font-semibold text-muted">
            Amounts are whole kobo
          </p>
          {money.map((field) => (
            <div
              key={field.path}
              className="flex flex-wrap items-baseline justify-between gap-x-3"
            >
              <dt className="font-mono text-meta text-body">{field.path}</dt>
              <dd className="text-body-sm tabular text-ink">
                {field.kobo.toLocaleString("en-NG")} ={" "}
                {formatMoney(field.naira, "NGN", { decimals: true })}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
