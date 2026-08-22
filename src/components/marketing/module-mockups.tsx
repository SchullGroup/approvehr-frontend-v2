import { cn } from "@/lib/cn";
import { Bar, DayFrame, Dot } from "./mockups";
import type { ModuleId } from "@/lib/marketing/modules";

/*
 * One mockup per capability, so a module page reads as a walkthrough rather
 * than a list beside the same picture repeated.
 *
 * They share a fixed height so alternating rows line up down the page, and
 * they are reductions rather than screenshots: enough structure to recognise
 * the screen, not so much that the eye starts reading instead of scanning.
 * Every one is aria-hidden — the capability copy beside it carries the meaning.
 */

const SHELL = "h-[248px] w-full p-4 flex flex-col";

/* ------------------------------------------------------------- Shared bits */

function Head({
  title,
  chip,
  chipTone = "neutral",
}: {
  title: string;
  chip?: string;
  chipTone?: "neutral" | "green" | "amber" | "blue" | "red";
}) {
  const tones = {
    neutral: "bg-slate/8 text-slate/60",
    green: "bg-wash-green text-success-text",
    amber: "bg-wash-amber text-warning-text",
    blue: "bg-wash-blue text-info-text",
    red: "bg-wash-rose text-danger-text",
  };
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <span className="text-meta font-medium uppercase tracking-[0.08em] text-slate/40">
        {title}
      </span>
      {chip && (
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-meta font-medium",
            tones[chipTone],
          )}
        >
          {chip}
        </span>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  tone,
  strong = false,
}: {
  label: string;
  value?: string;
  tone?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      {tone && <span className={cn("size-1.5 shrink-0 rounded-full", tone)} />}
      <span className="min-w-0 flex-1 truncate text-meta text-slate/60">
        {label}
      </span>
      {value && (
        <span
          className={cn(
            "shrink-0 text-meta tabular-nums",
            strong ? "font-medium text-slate" : "text-slate/50",
          )}
        >
          {value}
        </span>
      )}
    </div>
  );
}

function Person({
  initials,
  name,
  meta,
  tint = "bg-accent",
  right,
}: {
  initials: string;
  name: string;
  meta?: string;
  tint?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full text-meta font-semibold text-white",
          tint,
        )}
      >
        {initials}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-meta font-medium text-slate">
          {name}
        </span>
        {meta && (
          <span className="block truncate text-meta text-slate/45">
            {meta}
          </span>
        )}
      </span>
      {right}
    </div>
  );
}

function Tick({ on = true }: { on?: boolean }) {
  return (
    <span
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-full text-meta",
        on ? "bg-success text-slate" : "border border-slate/20 text-transparent",
      )}
    >
      ✓
    </span>
  );
}

/* ================================================================= CORE HR */

function EmployeeRecord() {
  return (
    <DayFrame className={SHELL}>
      <Head title="Employee record" chip="Active" chipTone="green" />
      <Person
        initials="AO"
        name="Chioma Aduba"
        meta="Engineering Manager · AHR-0142"
      />
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate/8 pt-3">
        {[
          ["Pension PIN", "PEN1004829"],
          ["Bank", "GTBank ····4471"],
          ["Tax state", "Lagos"],
          ["Started", "14 Mar 2022"],
        ].map(([k, v]) => (
          <div key={k}>
            <p className="text-meta uppercase tracking-wide text-slate/35">
              {k}
            </p>
            <p className="mt-0.5 truncate text-meta text-slate/75">{v}</p>
          </div>
        ))}
      </div>
      <div className="mt-auto flex gap-1.5 border-t border-slate/8 pt-2.5">
        {["Profile", "Documents", "Pay", "Leave"].map((t, i) => (
          <span
            key={t}
            className={cn(
              "rounded-md px-2 py-1 text-meta",
              i === 0 ? "bg-slate text-white" : "bg-slate/6 text-slate/55",
            )}
          >
            {t}
          </span>
        ))}
      </div>
    </DayFrame>
  );
}

function SelfServiceChange() {
  return (
    <DayFrame className={SHELL}>
      <Head title="Change request" chip="Awaiting HR" chipTone="amber" />
      <p className="text-meta font-medium text-slate">
        Bank account update
      </p>
      <p className="mt-0.5 text-meta text-slate/45">
        Raised by Obinna Ezeh · today
      </p>

      <div className="mt-3 flex flex-col gap-2">
        <div className="rounded-lg border border-slate/8 p-2">
          <p className="text-meta uppercase tracking-wide text-slate/35">
            Current
          </p>
          <p className="mt-0.5 text-meta text-slate/60 line-through">
            Zenith ····8820
          </p>
        </div>
        <div className="rounded-lg border border-success-line bg-wash-green p-2">
          <p className="text-meta uppercase tracking-wide text-success-text/70">
            Requested
          </p>
          <p className="mt-0.5 text-meta font-medium text-success-text">
            GTBank ····4471
          </p>
        </div>
      </div>

      <div className="mt-auto flex gap-1.5">
        <span className="flex-1 rounded-md bg-success px-2 py-1.5 text-center text-meta font-medium text-slate">
          Approve
        </span>
        <span className="rounded-md border border-slate/12 px-2 py-1.5 text-meta text-slate/55">
          Decline
        </span>
      </div>
    </DayFrame>
  );
}

function OrgChart() {
  return (
    <DayFrame className={SHELL}>
      <Head title="Org structure" chip="264 people" />
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <span className="rounded-lg bg-slate px-3 py-1.5 text-meta font-medium text-white">
          Chief Executive
        </span>
        <span className="h-3 w-px bg-slate/15" />
        <div className="flex w-full items-start justify-center gap-2">
          {[
            { label: "Engineering", n: 86, tint: "bg-accent" },
            { label: "Finance", n: 28, tint: "bg-success-strong" },
            { label: "Operations", n: 54, tint: "bg-warning" },
          ].map((d) => (
            <div key={d.label} className="flex flex-1 flex-col items-center gap-1.5">
              <span className="h-3 w-px bg-slate/15" />
              <span className="w-full rounded-md border border-slate/10 bg-white px-1.5 py-1 text-center">
                <span className="block truncate text-meta font-medium text-slate">
                  {d.label}
                </span>
                <span className="mt-0.5 flex items-center justify-center gap-1">
                  <span className={cn("size-1 rounded-full", d.tint)} />
                  <span className="text-meta tabular-nums text-slate/45">
                    {d.n}
                  </span>
                </span>
              </span>
              <span className="flex gap-0.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <span key={i} className="size-3 rounded-full bg-slate/10" />
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </DayFrame>
  );
}

function LetterTemplate() {
  return (
    <DayFrame className={SHELL}>
      <Head title="Generate letter" chip="Template" chipTone="blue" />
      <div className="rounded-lg border border-slate/8 bg-slate/2 p-3">
        <Bar w="46%" tone="strong" className="h-1.5" />
        <div className="mt-2.5 flex flex-col gap-1.5">
          <Bar w="92%" className="h-1" />
          <p className="text-meta leading-relaxed text-slate/60">
            This confirms that{" "}
            <span className="rounded bg-wash-indigo px-1 font-medium text-accent">
              {"{{full_name}}"}
            </span>{" "}
            has been employed as{" "}
            <span className="rounded bg-wash-indigo px-1 font-medium text-accent">
              {"{{job_title}}"}
            </span>{" "}
            since{" "}
            <span className="rounded bg-wash-indigo px-1 font-medium text-accent">
              {"{{start_date}}"}
            </span>
            .
          </p>
          <Bar w="64%" className="h-1" />
        </div>
      </div>
      <div className="mt-auto flex items-center gap-2 border-t border-slate/8 pt-2.5">
        <span className="rounded-md bg-slate px-2.5 py-1.5 text-meta font-medium text-white">
          Generate for 1
        </span>
        <span className="text-meta text-slate/45">
          Fields fill from the record
        </span>
      </div>
    </DayFrame>
  );
}

/* ================================================================= PAYROLL */

function DeductionBreakdown() {
  return (
    <DayFrame className={SHELL}>
      <Head title="Chioma Aduba · August" />
      {/* Figures come from the same engine the product runs — see
          scripts/verify-payroll.ts. Do not hand-edit them. */}
      <Row label="Gross" value="₦1,850,000" strong />
      <div className="my-1 h-px bg-slate/8" />
      <Row label="Pension (8%)" value="−₦148,000" tone="bg-info" />
      <Row label="PAYE" value="−₦291,247" tone="bg-warning" />
      <Row label="NHF (2.5% of basic)" value="−₦27,750" tone="bg-slate/30" />
      <Row label="Staff loan" value="−₦75,000" tone="bg-danger" />
      <div className="my-1 h-px bg-slate/8" />
      <Row label="Net pay" value="₦1,308,003" strong />
      <div className="mt-auto rounded-lg bg-wash-green p-2">
        <p className="text-meta leading-snug text-success-text">
          Pension and NHF come off before consolidated relief — the order most
          spreadsheets get wrong. Employer pension of ₦185,000 sits on top of
          gross, not inside it.
        </p>
      </div>
    </DayFrame>
  );
}

function FilingSchedule() {
  return (
    <DayFrame className={SHELL}>
      <Head title="August remittances" chip="3 of 4 filed" chipTone="amber" />
      <div className="flex flex-col gap-2">
        {[
          ["PAYE — Lagos IRS", "₦14,203,880", true],
          ["PAYE — Ogun IRS", "₦1,940,220", true],
          ["Pension — 4 PFAs", "₦8,140,200", true],
          ["NHF — FMBN", "₦2,325,110", false],
        ].map(([label, amount, done]) => (
          <div key={label as string} className="flex items-center gap-2.5">
            <Tick on={done as boolean} />
            <span className="min-w-0 flex-1 truncate text-meta text-slate/65">
              {label as string}
            </span>
            <span className="text-meta font-medium tabular-nums text-slate">
              {amount as string}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-auto flex items-center gap-2 border-t border-slate/8 pt-2.5">
        <span className="rounded-md bg-slate px-2.5 py-1.5 text-meta font-medium text-white">
          Download schedules
        </span>
        <span className="text-meta text-slate/45">Split per body</span>
      </div>
    </DayFrame>
  );
}

function ApprovalChain() {
  return (
    <DayFrame className={SHELL}>
      <Head title="Approval trail" chip="Awaiting CFO" chipTone="amber" />
      <div className="flex flex-col gap-2.5">
        {[
          { n: "Folake Adisa", r: "Prepared", done: true, tint: "bg-accent" },
          { n: "Zainab Yusuf", r: "Reviewed", done: true, tint: "bg-success-strong" },
          { n: "Segun Adeyemi", r: "Approves", done: false, tint: "bg-slate/25" },
        ].map((s, i) => (
          <div key={s.n} className="relative flex items-center gap-2.5">
            {i < 2 && (
              <span className="absolute left-[13px] top-7 h-2.5 w-px bg-slate/12" />
            )}
            <Person
              initials={s.n.split(" ").map((p) => p[0]).join("")}
              name={s.n}
              meta={s.r}
              tint={s.tint}
              right={<Tick on={s.done} />}
            />
          </div>
        ))}
      </div>
      <div className="mt-auto rounded-lg border border-slate/10 bg-slate/3 p-2">
        <p className="text-meta leading-snug text-slate/60">
          The payment file is only generated after the final approval. Every
          step is timestamped.
        </p>
      </div>
    </DayFrame>
  );
}

function LoanSchedule() {
  return (
    <DayFrame className={SHELL}>
      <Head title="Staff loan" chip="4 of 12 repaid" chipTone="blue" />
      <div className="flex items-baseline justify-between">
        <span className="text-[1.125rem] font-medium tabular-nums text-slate">
          ₦900,000
        </span>
        <span className="text-meta text-slate/45">₦75,000 / month</span>
      </div>
      <div className="mt-2.5 flex gap-[3px]">
        {Array.from({ length: 12 }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-6 flex-1 rounded-[3px]",
              i < 4 ? "bg-success" : i === 4 ? "bg-success/40" : "bg-slate/10",
            )}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-col gap-0.5 border-t border-slate/8 pt-2.5">
        <Row label="Repaid" value="₦300,000" />
        <Row label="Outstanding" value="₦600,000" strong />
        <Row label="Final deduction" value="Jul 2027" />
      </div>
      <div className="mt-auto rounded-lg bg-wash-green p-2">
        <p className="text-meta leading-snug text-success-text">
          Deducted automatically on each run. No separate tracker.
        </p>
      </div>
    </DayFrame>
  );
}

function Payslip() {
  return (
    <DayFrame className={SHELL}>
      <Head title="Payslip · August 2026" chip="Sent" chipTone="green" />
      <div className="rounded-lg border border-slate/8 p-2.5">
        <div className="flex items-center justify-between">
          <Bar w="52px" tone="strong" className="h-1.5" />
          <span className="text-meta text-slate/40">AHR-0142</span>
        </div>
        <div className="mt-2 flex flex-col gap-0.5">
          <Row label="Basic" value="₦1,110,000" />
          <Row label="Housing" value="₦462,500" />
          <Row label="Transport" value="₦277,500" />
        </div>
        <div className="mt-1.5 border-t border-slate/8 pt-1.5">
          <Row label="Net pay" value="₦1,167,850" strong />
        </div>
      </div>
      <div className="mt-auto flex items-center gap-1.5">
        <span className="rounded-md bg-slate/6 px-2 py-1 text-meta text-slate/55">
          Download PDF
        </span>
        <span className="rounded-md bg-slate/6 px-2 py-1 text-meta text-slate/55">
          Email
        </span>
        <span className="ml-auto text-meta text-slate/40">
          Itemised by law
        </span>
      </div>
    </DayFrame>
  );
}

/* ================================================================== HIRING */

function RequisitionApproval() {
  return (
    <DayFrame className={SHELL}>
      <Head title="ENG-114" chip="Pending approval" chipTone="amber" />
      <p className="text-meta font-medium text-slate">
        Senior Backend Engineer
      </p>
      <p className="mt-0.5 text-meta text-slate/45">
        Engineering · Lagos · 2 openings
      </p>
      <div className="mt-3 flex flex-col gap-0.5 rounded-lg bg-slate/3 p-2.5">
        <Row label="Band" value="₦1.2m – ₦1.8m" strong />
        <Row label="Annual cost" value="₦36.0m" />
        <Row label="Target start" value="15 Sep" />
      </div>
      <div className="mt-auto flex items-center gap-2">
        <span className="flex-1 rounded-md bg-success px-2 py-1.5 text-center text-meta font-medium text-slate">
          Approve and publish
        </span>
      </div>
      <p className="mt-1.5 text-meta text-slate/40">
        Nothing is posted until the budget holder approves.
      </p>
    </DayFrame>
  );
}

function StageConfig() {
  return (
    <DayFrame className={SHELL}>
      <Head title="Pipeline stages" chip="4 of 5 on" chipTone="blue" />
      <div className="flex flex-col gap-1.5">
        {[
          ["Sourcing", true, true],
          ["Shortlisting", true, false],
          ["Pre-screening", false, false],
          ["Interview", true, false],
          ["Selection", true, true],
        ].map(([label, on, locked]) => (
          <div
            key={label as string}
            className={cn(
              "flex items-center gap-2.5 rounded-lg border px-2.5 py-1.5",
              on ? "border-accent-line bg-wash-indigo" : "border-slate/8",
            )}
          >
            <span
              className={cn(
                "flex h-3.5 w-6 items-center rounded-full px-0.5 transition-colors",
                on ? "justify-end bg-success-strong" : "bg-slate/20",
              )}
            >
              <span className="size-2.5 rounded-full bg-white" />
            </span>
            <span className="flex-1 text-meta text-slate/70">
              {label as string}
            </span>
            {(locked as boolean) && (
              <span className="text-meta uppercase tracking-wide text-slate/35">
                Required
              </span>
            )}
          </div>
        ))}
      </div>
    </DayFrame>
  );
}

function ScreeningAnswers() {
  return (
    <DayFrame className={SHELL}>
      <Head title="Screening" chip="1 flag" chipTone="red" />
      <div className="flex flex-col gap-2">
        {[
          ["Right to work in Nigeria?", "Yes", true],
          ["Notice period?", "8 weeks", null],
          ["Salary expectation?", "₦2,100,000", false],
        ].map(([q, a, pass]) => (
          <div
            key={q as string}
            className={cn(
              "rounded-lg border p-2",
              pass === false
                ? "border-danger-line bg-wash-rose"
                : "border-slate/8",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-meta text-slate/55">{q as string}</p>
              {pass !== null && (
                <span className="shrink-0 text-meta uppercase tracking-wide text-slate/40">
                  Knockout
                </span>
              )}
            </div>
            <p
              className={cn(
                "mt-0.5 text-meta font-medium",
                pass === false ? "text-danger-text" : "text-slate",
              )}
            >
              {a as string}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-auto text-meta leading-snug text-slate/45">
        Above the ₦1.8m band ceiling — flagged before anyone books a call.
      </p>
    </DayFrame>
  );
}

function Scorecard() {
  return (
    <DayFrame className={SHELL}>
      <Head title="Scorecard" chip="Strong yes" chipTone="green" />
      <Person
        initials="CN"
        name="Obinna Ezeh"
        meta="Technical · 90 mins"
        tint="bg-success-strong"
      />
      <div className="mt-3 flex flex-col gap-2">
        {[
          ["System design", 5],
          ["Code quality", 5],
          ["Debugging", 4],
        ].map(([label, score]) => (
          <div key={label as string}>
            <div className="mb-1 flex justify-between">
              <span className="text-meta text-slate/55">
                {label as string}
              </span>
              <span className="text-meta tabular-nums text-slate/45">
                {score as number} / 5
              </span>
            </div>
            <span className="flex gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1.5 flex-1 rounded-full",
                    i < (score as number) ? "bg-warning" : "bg-slate/10",
                  )}
                />
              ))}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-auto border-t border-slate/8 pt-2 text-meta leading-snug text-slate/50">
        Cannot leave Interview until every scorecard is submitted.
      </p>
    </DayFrame>
  );
}

function OfferStatus() {
  return (
    <DayFrame className={SHELL}>
      <Head title="Offer" chip="Accepted" chipTone="green" />
      <Person initials="ZY" name="Zainab Yusuf" meta="Senior Backend Engineer" />
      <div className="mt-3 flex flex-col gap-0.5 rounded-lg bg-slate/3 p-2.5">
        <Row label="Gross monthly" value="₦1,750,000" strong />
        <Row label="Within band" value="Yes" />
        <Row label="Start date" value="15 Sep 2026" />
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        {[
          ["Approved by hiring manager", true],
          ["Sent to candidate", true],
          ["Signed", true],
        ].map(([label, done]) => (
          <div key={label as string} className="flex items-center gap-2">
            <Tick on={done as boolean} />
            <span className="text-meta text-slate/60">
              {label as string}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-auto text-meta text-slate/45">
        Accepted offers create the employee record automatically.
      </p>
    </DayFrame>
  );
}

/* ==================================================================== TIME */

function ClockIn() {
  return (
    <DayFrame className={SHELL}>
      <Head title="Today" chip="Clocked in" chipTone="green" />
      <div className="flex flex-col items-center justify-center rounded-xl bg-slate/3 py-4">
        <span className="text-[1.5rem] font-medium tabular-nums leading-none text-slate">
          07:42:15
        </span>
        <span className="mt-1.5 text-meta text-slate/45">
          Since 09:00 · Lekki office
        </span>
      </div>
      <div className="mt-3 flex flex-col gap-0.5">
        <Row label="Clock in" value="09:00" tone="bg-success" />
        <Row label="Break" value="45 mins" tone="bg-warning" />
        <Row label="Expected out" value="17:45" tone="bg-slate/25" />
      </div>
      <div className="mt-auto flex gap-1.5">
        <span className="flex-1 rounded-md bg-slate px-2 py-1.5 text-center text-meta font-medium text-white">
          Clock out
        </span>
      </div>
    </DayFrame>
  );
}

function LeavePolicy() {
  return (
    <DayFrame className={SHELL}>
      <Head title="Annual leave policy" chip="Active" chipTone="green" />
      <div className="flex flex-col gap-2">
        {[
          ["Entitlement", "20 days / year"],
          ["Accrues", "Monthly, 1.67 days"],
          ["Carry over", "Max 5 days"],
          ["Expires", "31 March"],
        ].map(([k, v]) => (
          <div
            key={k}
            className="flex items-center justify-between rounded-lg border border-slate/8 px-2.5 py-1.5"
          >
            <span className="text-meta text-slate/55">{k}</span>
            <span className="text-meta font-medium text-slate">{v}</span>
          </div>
        ))}
      </div>
      <p className="mt-auto text-meta leading-snug text-slate/45">
        Balances recalculate the moment a rule changes — no reissuing
        spreadsheets.
      </p>
    </DayFrame>
  );
}

function LeaveApproval() {
  return (
    <DayFrame className={SHELL}>
      <Head title="Leave request" chip="With manager" chipTone="amber" />
      <Person initials="NE" name="Kemi Balogun" meta="12–16 Sep · 5 days" />
      <div className="mt-3 rounded-lg border border-slate/8 p-2">
        <p className="text-meta uppercase tracking-wide text-slate/35">
          Who else is off
        </p>
        <div className="mt-1.5 flex flex-col gap-1">
          {[
            ["Obinna Ezeh", "14–15 Sep", "bg-warning"],
            ["No one else", "same team", "bg-success"],
          ].map(([n, d, t]) => (
            <div key={n} className="flex items-center gap-2">
              <span className={cn("size-1.5 rounded-full", t)} />
              <span className="flex-1 text-meta text-slate/60">{n}</span>
              <span className="text-meta text-slate/45">{d}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-auto flex gap-1.5">
        <span className="flex-1 rounded-md bg-success px-2 py-1.5 text-center text-meta font-medium text-slate">
          Approve
        </span>
        <span className="rounded-md border border-slate/12 px-2 py-1.5 text-meta text-slate/55">
          Decline
        </span>
      </div>
    </DayFrame>
  );
}

function Holidays() {
  return (
    <DayFrame className={SHELL}>
      <Head title="Public holidays 2026" chip="Maintained" chipTone="blue" />
      <div className="flex flex-col gap-1.5">
        {[
          ["1 Oct", "Independence Day", false],
          ["25 Dec", "Christmas Day", false],
          ["26 Dec", "Boxing Day", false],
          ["—", "Eid al-Fitr", true],
        ].map(([d, n, tbc]) => (
          <div
            key={n as string}
            className="flex items-center gap-2.5 rounded-lg border border-slate/8 px-2.5 py-1.5"
          >
            <span className="w-10 shrink-0 text-meta tabular-nums text-slate/45">
              {d as string}
            </span>
            <span className="flex-1 truncate text-meta text-slate/70">
              {n as string}
            </span>
            {(tbc as boolean) && (
              <span className="rounded-full bg-wash-amber px-1.5 py-0.5 text-meta text-warning-text">
                Awaiting proclamation
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="mt-auto text-meta leading-snug text-slate/45">
        We add short-notice federal declarations for you and recalculate
        affected leave.
      </p>
    </DayFrame>
  );
}

/* ============================================================= PERFORMANCE */

function GoalCascade() {
  return (
    <DayFrame className={SHELL}>
      <Head title="Goal alignment" chip="Q3" chipTone="blue" />
      <div className="rounded-lg bg-slate px-2.5 py-1.5">
        <p className="text-meta uppercase tracking-wide text-white/45">
          Company
        </p>
        <p className="text-meta font-medium text-white">
          Reach ₦2bn processed payroll
        </p>
      </div>
      <div className="mt-2 ml-3 flex flex-col gap-1.5 border-l border-slate/12 pl-3">
        {[
          ["Engineering", "Ship multi-entity payroll", 72],
          ["Sales", "40 new mid-market logos", 48],
        ].map(([team, goal, pct]) => (
          <div key={team as string} className="rounded-lg border border-slate/8 p-2">
            <p className="text-meta uppercase tracking-wide text-slate/35">
              {team as string}
            </p>
            <p className="text-meta font-medium text-slate">
              {goal as string}
            </p>
            <span className="mt-1 block h-1 overflow-hidden rounded-full bg-slate/10">
              <span
                className="block h-full rounded-full bg-[#7c5cd6]"
                style={{ width: `${pct as number}%` }}
              />
            </span>
          </div>
        ))}
      </div>
      <p className="mt-auto text-meta text-slate/45">
        Every objective traces up to what it serves.
      </p>
    </DayFrame>
  );
}

function ReviewCycle() {
  return (
    <DayFrame className={SHELL}>
      <Head title="H2 review cycle" chip="In progress" chipTone="amber" />
      <div className="flex flex-col gap-2">
        {[
          ["Self review", "Closed", 100],
          ["Manager review", "Due 24 Aug", 68],
          ["Calibration", "Not started", 0],
          ["Published", "—", 0],
        ].map(([stage, when, pct]) => (
          <div key={stage as string}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-meta text-slate/60">
                {stage as string}
              </span>
              <span className="text-meta text-slate/40">
                {when as string}
              </span>
            </div>
            <span className="block h-1.5 overflow-hidden rounded-full bg-slate/8">
              <span
                className={cn(
                  "block h-full rounded-full",
                  (pct as number) === 100 ? "bg-success" : "bg-[#7c5cd6]",
                )}
                style={{ width: `${pct as number}%` }}
              />
            </span>
          </div>
        ))}
      </div>
      <p className="mt-auto text-meta text-slate/45">
        Reminders go out on schedule without you chasing.
      </p>
    </DayFrame>
  );
}

function CompetencyScores() {
  return (
    <DayFrame className={SHELL}>
      <Head title="Competency scores" chip="4.2 / 5" chipTone="green" />
      <div className="flex flex-col gap-2.5">
        {[
          ["Delivery", 88, "40%"],
          ["Ownership", 72, "30%"],
          ["Collaboration", 94, "20%"],
          ["Craft", 64, "10%"],
        ].map(([label, pct, weight]) => (
          <div key={label as string}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-meta text-slate/60">
                {label as string}
              </span>
              <span className="text-meta rounded-full bg-slate/6 px-1.5 text-slate/45">
                weight {weight as string}
              </span>
            </div>
            <span className="block h-1.5 overflow-hidden rounded-full bg-slate/8">
              <span
                className="block h-full rounded-full bg-[#7c5cd6]"
                style={{ width: `${pct as number}%` }}
              />
            </span>
          </div>
        ))}
      </div>
      <p className="mt-auto text-meta text-slate/45">
        Weighted per role, so scores compare across a department.
      </p>
    </DayFrame>
  );
}

function Calibration() {
  const dist = [4, 11, 38, 28, 9];
  return (
    <DayFrame className={SHELL}>
      <Head title="Rating distribution" chip="Before publish" chipTone="amber" />
      <div className="flex flex-1 items-end gap-2 pb-2">
        {dist.map((n, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
            <span className="text-meta tabular-nums text-slate/45">
              {n}
            </span>
            <span
              className={cn(
                "w-full rounded-t-md",
                i === 2 ? "bg-[#7c5cd6]" : "bg-[#7c5cd6]/35",
              )}
              style={{ height: `${(n / 38) * 84}px` }}
            />
            <span className="text-meta text-slate/45">{i + 1}</span>
          </div>
        ))}
      </div>
      <p className="mt-auto border-t border-slate/8 pt-2 text-meta leading-snug text-slate/50">
        One manager rating everyone a 5 shows here, before anything is
        published.
      </p>
    </DayFrame>
  );
}

/* ==================================================================== DESK */

function TicketThread() {
  return (
    <DayFrame className={SHELL}>
      <Head title="HR-2841" chip="In progress" chipTone="blue" />
      <p className="text-meta font-medium text-slate">
        Payslip missing for July
      </p>
      <p className="mt-0.5 text-meta text-slate/45">
        Payroll · raised 2 days ago
      </p>
      <div className="mt-3 flex flex-col gap-2">
        <div className="rounded-lg rounded-tl-none bg-slate/5 p-2">
          <p className="text-meta text-slate/60">
            I cannot find my July payslip in the portal.
          </p>
        </div>
        <div className="ml-6 rounded-lg rounded-tr-none bg-wash-indigo p-2">
          <p className="text-meta text-accent">
            Re-issued and emailed to you just now.
          </p>
        </div>
      </div>
      <div className="mt-auto flex items-center gap-2 border-t border-slate/8 pt-2">
        <span className="flex -space-x-1">
          {["bg-accent", "bg-success-strong"].map((c) => (
            <span key={c} className={cn("size-4 rounded-full ring-2 ring-white", c)} />
          ))}
        </span>
        <span className="text-meta text-slate/45">
          Assigned to Zainab Yusuf
        </span>
      </div>
    </DayFrame>
  );
}

function SlaBoard() {
  return (
    <DayFrame className={SHELL}>
      <Head title="Response targets" chip="1 breaching" chipTone="red" />
      <div className="flex flex-col gap-1.5">
        {[
          ["Payroll query", "4 hrs", "2h left", "bg-success"],
          ["Leave dispute", "1 day", "5h left", "bg-warning"],
          ["Contract request", "2 days", "Overdue 3h", "bg-danger"],
          ["General", "3 days", "2d left", "bg-success"],
        ].map(([cat, target, left, tone]) => (
          <div
            key={cat as string}
            className="flex items-center gap-2.5 rounded-lg border border-slate/8 px-2.5 py-1.5"
          >
            <Dot className={tone as string} />
            <span className="min-w-0 flex-1 truncate text-meta text-slate/65">
              {cat as string}
            </span>
            <span className="text-meta text-slate/35">
              {target as string}
            </span>
            <span
              className={cn(
                "w-16 text-right text-meta tabular-nums",
                (tone as string) === "bg-danger"
                  ? "font-medium text-danger-text"
                  : "text-slate/50",
              )}
            >
              {left as string}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-auto text-meta text-slate/45">
        You see a breach before the employee has to chase.
      </p>
    </DayFrame>
  );
}

function KnowledgeBase() {
  return (
    <DayFrame className={SHELL}>
      <Head title="Knowledge base" chip="Deflecting 38%" chipTone="green" />
      <div className="flex flex-col gap-1.5">
        {[
          ["How do I read my payslip?", "412 views"],
          ["Applying for annual leave", "288 views"],
          ["Changing your pension PFA", "173 views"],
          ["Requesting a confirmation letter", "96 views"],
        ].map(([title, views]) => (
          <div
            key={title as string}
            className="flex items-center gap-2.5 rounded-lg border border-slate/8 px-2.5 py-1.5"
          >
            <span className="min-w-0 flex-1 truncate text-meta text-slate/70">
              {title as string}
            </span>
            <span className="shrink-0 text-meta tabular-nums text-slate/40">
              {views as string}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-auto text-meta leading-snug text-slate/45">
        Answers published from resolved tickets, so the queue shrinks as
        headcount grows.
      </p>
    </DayFrame>
  );
}

/* ================================================================ Registry */

type Mockup = () => React.ReactElement;

/**
 * Indexed by module, then by capability position. The module page walks its
 * own `capabilities` array and pulls the matching illustration, so adding a
 * capability without art degrades to text rather than breaking the layout.
 */
export const CAPABILITY_MOCKUPS: Record<ModuleId, Mockup[]> = {
  "core-hr": [EmployeeRecord, SelfServiceChange, OrgChart, LetterTemplate],
  payroll: [
    DeductionBreakdown,
    FilingSchedule,
    ApprovalChain,
    LoanSchedule,
    Payslip,
  ],
  hiring: [
    RequisitionApproval,
    StageConfig,
    ScreeningAnswers,
    Scorecard,
    OfferStatus,
  ],
  time: [ClockIn, LeavePolicy, LeaveApproval, Holidays],
  performance: [GoalCascade, ReviewCycle, CompetencyScores, Calibration],
  desk: [TicketThread, SlaBoard, KnowledgeBase],
};
