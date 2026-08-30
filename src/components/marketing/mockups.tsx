import { cn } from "@/lib/cn";

/*
 * Simplified renderings of real screens. Drawn in markup rather than exported
 * as images so they stay sharp, respond to hover, weigh nothing, and — most
 * usefully — cannot go stale against a redesign the way a screenshot does.
 *
 * They are deliberately reduced: enough structure to be recognisable as the
 * product, not so much detail that the eye starts reading rather than
 * scanning. Everything decorative is aria-hidden; the surrounding copy carries
 * the meaning.
 */

/* --------------------------------------------------------------- Primitives */

export function Bar({
  w,
  tone = "line",
  className,
}: {
  w: string;
  tone?: "line" | "strong" | "dark" | "dim";
  className?: string;
}) {
  const tones = {
    line: "bg-slate/10",
    strong: "bg-slate/20",
    dark: "bg-white/14",
    dim: "bg-white/8",
  };
  return (
    <span
      className={cn("block h-2 rounded-full", tones[tone], className)}
      style={{ width: w }}
    />
  );
}

export function Dot({ className }: { className?: string }) {
  return <span className={cn("size-2 rounded-full", className)} />;
}

/** Window chrome shared by the dark mockups. */
function NightFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "overflow-hidden rounded-2xl bg-night shadow-[0_24px_48px_-12px_rgb(20_18_15/0.28)]",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-night-line px-4 py-3">
        <Dot className="bg-white/16" />
        <Dot className="bg-white/16" />
        <Dot className="bg-white/16" />
      </div>
      {children}
    </div>
  );
}

/** Light card frame for the washed module tiles. */
function DayFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "overflow-hidden rounded-xl border border-slate/8 bg-white shadow-[0_8px_20px_-8px_rgb(20_18_15/0.14)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ Payroll */

/** The hero mockup. A payroll run mid-approval. */
export function PayrollMockup({ className }: { className?: string }) {
  const rows = [
    { name: "Chioma Aduba", amount: "₦1,850,000", delta: true },
    { name: "Obinna Ezeh", amount: "₦1,650,000", delta: false },
    { name: "Kemi Balogun", amount: "₦1,420,000", delta: true },
    { name: "Zainab Yusuf", amount: "₦980,000", delta: false },
  ];

  return (
    <NightFrame className={className}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-meta text-white/40">
              August payroll
            </p>
            <p className="mt-1.5 text-[1.75rem] font-medium tracking-tight text-white">
              ₦93,004,500
            </p>
          </div>
          <span className="rounded-full bg-success/20 px-2.5 py-1 text-meta font-medium text-success">
            Ready to approve
          </span>
        </div>

        {/* Deduction split */}
        <div className="mt-4 flex h-1.5 overflow-hidden rounded-full">
          <span className="h-full bg-success" style={{ width: "73%" }} />
          <span className="h-full bg-warning" style={{ width: "16%" }} />
          <span className="h-full bg-info" style={{ width: "8%" }} />
          <span className="h-full bg-white/20" style={{ width: "3%" }} />
        </div>
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-meta text-white/50">
          <span className="flex items-center gap-1.5">
            <Dot className="bg-success" /> Net pay
          </span>
          <span className="flex items-center gap-1.5">
            <Dot className="bg-warning" /> PAYE
          </span>
          <span className="flex items-center gap-1.5">
            <Dot className="bg-info" /> Pension
          </span>
          <span className="flex items-center gap-1.5">
            <Dot className="bg-white/30" /> NHF
          </span>
        </div>

        <div className="mt-5 flex flex-col gap-2.5">
          {rows.map((r) => (
            <div key={r.name} className="flex items-center gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/8 text-meta font-medium text-white/70">
                {r.name
                  .split(" ")
                  .map((p) => p[0])
                  .join("")}
              </span>
              <span className="min-w-0 flex-1 truncate text-meta text-white/70">
                {r.name}
              </span>
              <span className="text-meta font-medium tabular-nums text-white">
                {r.amount}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-night-line px-5 py-3.5">
        <span className="rounded-full bg-success px-3.5 py-1.5 text-meta font-medium text-slate">
          Approve run
        </span>
        <span className="rounded-full border border-white/14 px-3.5 py-1.5 text-meta text-white/70">
          Review
        </span>
      </div>
    </NightFrame>
  );
}

/* ------------------------------------------------------------------- Hiring */

/**
 * On hover a candidate card travels from Screening into Interview, and the
 * column counts follow it. The animation is the sentence the card is making —
 * "move candidates through a pipeline" — rather than decoration.
 */
export function PipelineMockup({ className }: { className?: string }) {
  const columns = [
    { label: "Sourced", tone: "bg-slate/25", cards: 2 },
    { label: "Screening", tone: "bg-info", cards: 2 },
    { label: "Interview", tone: "bg-warning", cards: 1 },
    { label: "Offer", tone: "bg-success-strong", cards: 1 },
  ];

  return (
    <DayFrame className={cn("p-3", className)}>
      <div className="flex gap-2">
        {columns.map((col, ci) => (
          <div key={col.label} className="flex-1 rounded-lg bg-slate/3 p-2">
            <div className="mb-2 flex items-center gap-1.5">
              <span className={cn("size-1.5 rounded-full", col.tone)} />
              <span className="truncate text-meta font-medium text-slate/70">
                {col.label}
              </span>
            </div>
            <div className="relative flex flex-col gap-1.5">
              {Array.from({ length: col.cards }).map((_, i) => (
                <MiniCard key={i} />
              ))}

              {/* The travelling card: leaves Screening, lands in Interview. */}
              {ci === 1 && (
                <div className="transition-all duration-500 ease-[var(--ease-out-soft)] group-hover:-translate-y-1 group-hover:opacity-0">
                  <MiniCard highlight />
                </div>
              )}
              {ci === 2 && (
                <div className="translate-y-1 opacity-0 transition-all delay-200 duration-500 ease-[var(--ease-out-soft)] group-hover:translate-y-0 group-hover:opacity-100">
                  <MiniCard highlight />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </DayFrame>
  );
}

function MiniCard({ highlight = false }: { highlight?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-md border bg-white p-1.5 shadow-[0_1px_2px_rgb(20_18_15/0.04)]",
        highlight ? "border-warning" : "border-slate/8",
      )}
    >
      <div className="flex items-center gap-1">
        <span
          className={cn(
            "size-3 shrink-0 rounded-full",
            highlight ? "bg-warning" : "bg-slate/12",
          )}
        />
        <Bar w="70%" className="h-1" />
      </div>
      <Bar w="46%" className="mt-1 h-1" />
    </div>
  );
}

/* ------------------------------------------------- Payroll, light variant */

/**
 * The light payroll card. Every module tile carries a mockup so the grid rows
 * are even — a card without one left a hole the width of the viewport.
 * On hover the run moves from "ready" to approved.
 */
export function PayrollCardMockup({ className }: { className?: string }) {
  return (
    <DayFrame className={cn("p-3.5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-meta text-slate/40">
            August payroll
          </p>
          <p className="mt-0.5 text-body-lg font-medium tabular-nums text-slate">
            ₦93,004,500
          </p>
        </div>
        <span className="relative h-5 w-24 shrink-0">
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-wash-amber text-meta font-medium text-warning-text transition-opacity duration-300 group-hover:opacity-0">
            Ready to approve
          </span>
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-success text-meta font-medium text-slate opacity-0 transition-opacity delay-200 duration-300 group-hover:opacity-100">
            ✓ Approved
          </span>
        </span>
      </div>

      {/* Deduction split fills across on hover. */}
      <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-slate/8">
        {[
          ["bg-success-strong", "73%"],
          ["bg-warning", "16%"],
          ["bg-info", "8%"],
        ].map(([tone, w]) => (
          <span
            key={tone}
            className={cn("h-full transition-[width] duration-700 ease-[var(--ease-out-soft)]", tone)}
            style={{ width: w }}
          />
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-1.5">
        {[
          ["Net pay", "₦68.4m"],
          ["PAYE", "₦14.2m"],
          ["Pension", "₦8.1m"],
        ].map(([label, amount], i) => (
          <div
            key={label}
            className="flex items-center justify-between transition-transform duration-300 ease-[var(--ease-out-soft)] group-hover:translate-x-0.5"
            style={{ transitionDelay: `${i * 60}ms` }}
          >
            <span className="text-meta text-slate/55">{label}</span>
            <span className="text-meta font-medium tabular-nums text-slate">
              {amount}
            </span>
          </div>
        ))}
      </div>
    </DayFrame>
  );
}

/* -------------------------------------------------------------------- Leave */

export function LeaveMockup({ className }: { className?: string }) {
  /* A fortnight strip: two people, some days booked. */
  const booked = new Set([3, 4, 5, 10, 11]);
  const booked2 = new Set([8, 9, 10]);

  return (
    <DayFrame className={cn("p-3.5", className)}>
      <div className="mb-2.5 flex items-center justify-between">
        <Bar w="72px" tone="strong" className="h-1.5" />
        <span className="rounded-full bg-wash-green px-2 py-0.5 text-meta font-medium text-success-text">
          2 pending
        </span>
      </div>

      {/* On hover the pending block (row 2) turns approved-green, one day at a
          time — the request being granted, not just a static calendar. */}
      <div className="flex flex-col gap-2">
        {[booked, booked2].map((set, row) => (
          <div key={row} className="flex items-center gap-2">
            <span className="size-5 shrink-0 rounded-full bg-slate/10" />
            <div className="flex flex-1 gap-[3px]">
              {Array.from({ length: 14 }).map((_, i) => {
                const on = set.has(i);
                const weekend = i % 7 === 5 || i % 7 === 6;
                const pending = row === 1 && on;
                return (
                  <span
                    key={i}
                    className={cn(
                      "h-5 flex-1 rounded-[3px] transition-colors duration-300 ease-[var(--ease-out-soft)]",
                      on
                        ? row === 0
                          ? "bg-success"
                          : "bg-info/60 group-hover:bg-success"
                        : weekend
                          ? "bg-slate/6"
                          : "bg-slate/10",
                    )}
                    style={
                      pending
                        ? { transitionDelay: `${(i - 8) * 90}ms` }
                        : undefined
                    }
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-slate/8 pt-2.5">
        <span className="relative h-3 w-20">
          <span className="absolute inset-0 flex items-center text-meta text-slate/45 transition-opacity duration-300 group-hover:opacity-0">
            2 pending
          </span>
          <span className="absolute inset-0 flex items-center text-meta font-medium text-success-text opacity-0 transition-opacity delay-300 duration-300 group-hover:opacity-100">
            Approved
          </span>
        </span>
        <span className="text-meta font-medium tabular-nums text-slate/60">
          12.5 days left
        </span>
      </div>
    </DayFrame>
  );
}

/* -------------------------------------------------------------------- Record */

export function RecordMockup({ className }: { className?: string }) {
  return (
    <DayFrame className={cn("p-3.5", className)}>
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-full bg-accent text-meta font-semibold text-white">
          AO
        </span>
        <div className="min-w-0 flex-1">
          <Bar w="86px" tone="strong" className="h-1.5" />
          <Bar w="58px" className="mt-1.5 h-1" />
        </div>
        <span className="rounded-full bg-wash-green px-2 py-0.5 text-meta font-medium text-success-text">
          Active
        </span>
      </div>

      {/* Fields populate left to right on hover — the record completing. */}
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-slate/8 pt-3">
        {[
          "Employee ID",
          "Department",
          "Pension PIN",
          "Start date",
          "Manager",
          "Location",
        ].map((label, i) => (
          <div key={label}>
            <p className="text-meta text-slate/35">
              {label}
            </p>
            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate/6">
              <span
                className="block h-full w-0 rounded-full bg-slate/20 transition-[width] duration-500 ease-[var(--ease-out-soft)]"
                style={{
                  ["--w" as string]: label.length > 9 ? "80%" : "62%",
                  transitionDelay: `${i * 70}ms`,
                }}
                data-score
              />
            </span>
          </div>
        ))}
      </div>
    </DayFrame>
  );
}

/* --------------------------------------------------------------- Performance */

export function ReviewMockup({ className }: { className?: string }) {
  const scores = [
    { label: "Delivery", pct: 88 },
    { label: "Ownership", pct: 72 },
    { label: "Collaboration", pct: 94 },
    { label: "Craft", pct: 64 },
  ];

  return (
    <DayFrame className={cn("p-3.5", className)}>
      <div className="mb-3 flex items-center justify-between">
        <Bar w="88px" tone="strong" className="h-1.5" />
        <span className="text-meta font-medium tabular-nums text-slate/55">
          4.2 / 5
        </span>
      </div>

      {/* Scores grow in from zero on hover — the review being scored. */}
      <div className="flex flex-col gap-2.5">
        {scores.map((s, i) => (
          <div key={s.label}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-meta text-slate/55">{s.label}</span>
            </div>
            <span className="block h-1.5 overflow-hidden rounded-full bg-slate/8">
              <span
                className="block h-full w-0 rounded-full bg-[#7c5cd6] transition-[width] duration-700 ease-[var(--ease-out-soft)]"
                style={{
                  ["--w" as string]: `${s.pct}%`,
                  transitionDelay: `${i * 90}ms`,
                }}
                data-score
              />
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-1.5 border-t border-slate/8 pt-2.5">
        <span className="flex -space-x-1">
          {["bg-accent", "bg-success-strong", "bg-warning"].map((c, i) => (
            <span
              key={i}
              className={cn("size-4 rounded-full ring-2 ring-white", c)}
            />
          ))}
        </span>
        <span className="text-meta text-slate/50">3 reviewers submitted</span>
      </div>
    </DayFrame>
  );
}

/* --------------------------------------------------------------------- Desk */

export function DeskMockup({ className }: { className?: string }) {
  const tickets = [
    { tone: "bg-danger", label: "Breaching" },
    { tone: "bg-warning", label: "Due today" },
    { tone: "bg-success-strong", label: "Resolved" },
  ];

  return (
    <DayFrame className={cn("p-3.5", className)}>
      <div className="mb-2.5 flex items-center justify-between">
        <Bar w="64px" tone="strong" className="h-1.5" />
        <Bar w="28px" className="h-1" />
      </div>
      {/* On hover the queue clears: each ticket resolves in turn, top-down. */}
      <div className="flex flex-col gap-1.5">
        {tickets.map((t, i) => (
          <div
            key={t.label}
            className="flex items-center gap-2 rounded-lg border border-slate/8 p-2 transition-colors duration-300 ease-[var(--ease-out-soft)] group-hover:border-success-line group-hover:bg-wash-green"
            style={{ transitionDelay: `${i * 120}ms` }}
          >
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full transition-colors duration-300 group-hover:bg-success-strong",
                t.tone,
              )}
              style={{ transitionDelay: `${i * 120}ms` }}
            />
            <div className="min-w-0 flex-1">
              <Bar w="72%" className="h-1" />
              <Bar w="44%" className="mt-1 h-1" />
            </div>
            <span className="relative h-3 w-14 shrink-0">
              <span
                className="absolute inset-0 flex items-center justify-end text-meta text-slate/45 transition-opacity duration-300 group-hover:opacity-0"
                style={{ transitionDelay: `${i * 120}ms` }}
              >
                {t.label}
              </span>
              <span
                className="absolute inset-0 flex items-center justify-end text-meta font-medium text-success-text opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                style={{ transitionDelay: `${i * 120 + 150}ms` }}
              >
                Resolved
              </span>
            </span>
          </div>
        ))}
      </div>
    </DayFrame>
  );
}

/* ------------------------------------------------------- Statutory schedule */

/** Used in the Nigeria section. A filing schedule, ticked off. */
export function StatutoryMockup({ className }: { className?: string }) {
  const rows = [
    { label: "PAYE — Lagos IRS", value: "₦14,203,880", done: true },
    { label: "Pension — 4 PFAs", value: "₦8,140,200", done: true },
    { label: "NHF — FMBN", value: "₦2,325,110", done: true },
    { label: "NSITF", value: "₦930,045", done: false },
  ];

  return (
    <NightFrame className={className}>
      <div className="p-5">
        <p className="text-meta text-white/40">
          August remittances
        </p>
        <div className="mt-4 flex flex-col gap-3">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-3">
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full text-meta",
                  r.done ? "bg-success text-slate" : "border border-white/20 text-white/40",
                )}
              >
                {r.done ? "✓" : ""}
              </span>
              <span className="min-w-0 flex-1 truncate text-meta text-white/70">
                {r.label}
              </span>
              <span className="text-meta font-medium tabular-nums text-white">
                {r.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </NightFrame>
  );
}

export { NightFrame, DayFrame };
