import { cn } from "@/lib/cn";

/*
 * Tables scroll inside their own box so the page body never scrolls
 * horizontally. Numeric cells inherit tabular figures from globals.css.
 */

export function TableWrap({
  className,
  caption,
  children,
}: {
  className?: string;
  /** Describes the table for screen readers. Visually hidden by default. */
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "scroll-x rounded-lg border border-line bg-surface",
        className,
      )}
    >
      <table className="w-full border-collapse text-body-sm">
        {caption && <caption className="sr-only-focusable">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="border-b border-line bg-canvas">
      <tr>{children}</tr>
    </thead>
  );
}

export function TH({
  className,
  align = "left",
  scope = "col",
  children,
}: {
  className?: string;
  align?: "left" | "right" | "center";
  scope?: "col" | "row";
  children?: React.ReactNode;
}) {
  return (
    <th
      scope={scope}
      className={cn(
        "px-4 py-3 text-meta font-semibold tracking-wide text-muted whitespace-nowrap",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-line">{children}</tbody>;
}

export function TR({
  className,
  interactive = false,
  children,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean }) {
  return (
    <tr
      className={cn(
        "transition-colors duration-100",
        interactive && "hover:bg-canvas cursor-pointer",
        className,
      )}
      {...props}
    >
      {children}
    </tr>
  );
}

export function TD({
  className,
  align = "left",
  children,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & {
  align?: "left" | "right" | "center";
}) {
  return (
    <td
      className={cn(
        "px-4 py-3 align-middle text-body",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
      {...props}
    >
      {children}
    </td>
  );
}

/** Primary identifying cell. Renders as a row header for screen readers. */
export function TDPrimary({
  title,
  subtitle,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="row"
      className={cn("px-4 py-3 text-left align-middle font-normal", className)}
    >
      <span className="block text-body-sm font-medium text-ink">{title}</span>
      {subtitle && (
        <span className="mt-0.5 block text-meta text-muted">
          {subtitle}
        </span>
      )}
    </th>
  );
}
