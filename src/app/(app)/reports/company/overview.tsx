"use client";

import {
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  Disclosure,
  TextLink,
} from "@/components/ui";
import type {
  CompanyReport,
  NamedLine,
  ReportAxis,
  ReportFinding,
} from "@/lib/api/company-report";

/**
 * The Overview tab: findings, what is working, what to do, and how this was
 * worked out.
 *
 * The three axes are the fixed order and the only encoding. Position and plain
 * words carry them: each finding sits under its axis heading, and its status is
 * written as muted text. There are no coloured pills and no hue that follows an
 * axis (OWI's report uses three; this one deliberately does not), and the one
 * ochre dot is reserved for a finding that blocks something.
 */

const AXES: { id: ReportAxis; label: string; reads: string }[] = [
  { id: "results", label: "Results", reads: "What people delivered." },
  { id: "process", label: "Process", reads: "How the marks were produced." },
  {
    id: "fairness",
    label: "Fairness",
    reads: "Whether the marks can be compared.",
  },
];

export function Overview({ report }: { report: CompanyReport }) {
  return (
    <div className="flex flex-col gap-8">
      <Findings report={report} />
      {report.strengths && report.strengths.length > 0 && (
        <Strengths strengths={report.strengths} />
      )}
      {report.actions.length > 0 && <Actions actions={report.actions} />}
      <Method />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function Findings({
  report,
  print = false,
}: {
  report: CompanyReport;
  /** On paper: no links to act, which lead nowhere from a sheet of paper. */
  print?: boolean;
}) {
  if (report.findings.length === 0) {
    return (
      <Card>
        <CardHeader title="Findings" />
        <CardBody>
          <p className="text-body-sm text-muted">
            None of the checks in this report found anything to flag.
          </p>
        </CardBody>
      </Card>
    );
  }
  return (
    <section aria-label="Findings" className="flex flex-col gap-6">
      {AXES.map((axis) => {
        const findings = report.findings.filter((f) => f.axis === axis.id);
        if (findings.length === 0) return null;
        return (
          <Card key={axis.id} as="section" aria-label={axis.label}>
            <CardHeader level={2} title={axis.label} description={axis.reads} />
            <CardBody className="flex flex-col divide-y divide-line">
              {findings.map((finding) => (
                <FindingBlock
                  key={finding.id}
                  finding={finding}
                  axisLabel={axis.label}
                  print={print}
                />
              ))}
            </CardBody>
          </Card>
        );
      })}
    </section>
  );
}

/**
 * One finding: a sentence with its figure, then the evidence, then what follows
 * if nothing changes (only where a rule of the system backs it), then where to
 * act on it as a plain link.
 *
 * Status is muted text, with a single ochre dot when something is blocked. There
 * is no probability or impact: nothing here has a basis for one.
 */
function FindingBlock({
  finding,
  axisLabel,
  print,
}: {
  finding: ReportFinding;
  axisLabel: string;
  print: boolean;
}) {
  const [source, ...detail] = finding.evidence;
  return (
    <article className="flex flex-col gap-1.5 py-4 first:pt-0 last:pb-0">
      <p className="flex items-center gap-2 text-meta text-muted">
        {finding.status === "blocks" && (
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full bg-warning"
          />
        )}
        <span>{axisLabel}</span>
        <span aria-hidden="true">/</span>
        <span>{finding.statusLabel}</span>
      </p>
      <h3 className="text-body-md font-medium text-ink">{finding.title}.</h3>
      {source && <p className="text-meta text-muted">{source}</p>}
      {detail.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-meta text-muted">
          {detail.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {finding.lines && finding.lines.length > 0 && (
        <NamedLines lines={finding.lines} />
      )}
      {finding.caveats && finding.caveats.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-meta text-muted">
          {finding.caveats.map((caveat) => (
            <li key={caveat}>{caveat}</li>
          ))}
        </ul>
      )}
      {finding.ifNothingChanges && (
        <p className="text-body-sm text-body">
          <span className="font-medium text-ink">If nothing changes.</span>{" "}
          {finding.ifNothingChanges}
        </p>
      )}
      {finding.act && !print && (
        <p className="text-body-sm">
          <TextLink href={finding.act.href}>{finding.act.label}</TextLink>
        </p>
      )}
    </article>
  );
}

/**
 * The named lines of F10 and F11, grouped by department.
 *
 * Sorted by the server by department and then name, and drawn in that order:
 * never by score, and never as one list for the company. Each person carries
 * the one sentence that is the basis for their being here, and the name links to
 * their history so the basis can be checked.
 */
function NamedLines({ lines }: { lines: NamedLine[] }) {
  const groups = new Map<string, NamedLine[]>();
  for (const line of lines) {
    groups.set(line.department, [...(groups.get(line.department) ?? []), line]);
  }
  return (
    <div className="mt-1 flex flex-col gap-3">
      {[...groups.entries()].map(([department, people]) => (
        <div key={department} className="flex flex-col gap-1">
          <p className="text-meta font-medium text-ink">{department}</p>
          <ul className="flex flex-col gap-1">
            {people.map((line) => (
              <li
                key={`${line.employeeId}|${line.basis}`}
                className="text-body-sm text-body"
              >
                <TextLink href={`/performance/history/${line.employeeId}`}>
                  {line.name}
                </TextLink>
                <span className="text-muted">. {line.basis}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function Strengths({
  strengths,
}: {
  strengths: NonNullable<CompanyReport["strengths"]>;
}) {
  return (
    <Card as="section" aria-label="What is working">
      <CardHeader
        level={2}
        title="What is working"
        description="Stated only from what the system itself checked, and only when it is the larger share or complete."
      />
      <CardBody className="flex flex-col divide-y divide-line">
        {strengths.map((strength) => (
          <div
            key={strength.id}
            className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0"
          >
            <p className="text-body-md font-medium text-ink">
              {strength.title}.
            </p>
            <p className="text-meta text-muted">{strength.evidence}</p>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

/**
 * Up to five buttons, blockers first.
 *
 * The server has already left out anything this person may not do, so every
 * button here works. The first is the primary; the rest are secondary.
 */
function Actions({ actions }: { actions: CompanyReport["actions"] }) {
  return (
    <Card as="section" aria-label="Priority actions">
      <CardHeader level={2} title="Priority actions" />
      <CardBody className="flex flex-wrap gap-3">
        {actions.map((action, index) => (
          <ButtonLink
            key={action.id}
            href={action.href}
            variant={index === 0 ? "primary" : "secondary"}
          >
            {action.label}
          </ButtonLink>
        ))}
      </CardBody>
    </Card>
  );
}

/**
 * How this was worked out, and what it does not do.
 *
 * Closed by default: it is reference, and the headline already says it is
 * worked out by fixed rules. It is here so the claim can be checked rather than
 * taken on trust. It says what is left out and why, because a report that does
 * not say what it cannot see invites being read as if it could.
 */
function Method() {
  return (
    <Disclosure title="Method and privacy" level={2}>
      <MethodText />
    </Disclosure>
  );
}

/** The method and privacy copy, on screen behind a disclosure and printed in full. */
export function MethodText() {
  return (
    <div className="flex max-w-3xl flex-col gap-3 text-body-sm text-body">
      <p>
        <span className="font-medium text-ink">What this is.</span> A count of
        what is on record in ApproveHR for the period shown, worked out by fixed
        rules. No model writes any of it. It cannot see anything that was never
        recorded.
      </p>
      <p>
        <span className="font-medium text-ink">What it leaves out.</span> Groups
        of fewer than five people are never averaged or compared, and where
        leaving one out would let another be worked out, that one is left out
        too. Religion and state of origin are not checked. The report lists what
        it did not measure.
      </p>
      <p>
        <span className="font-medium text-ink">Marks.</span> While a period has
        not been published, marks can still move. Marks are not adjusted for how
        each manager rates, which is a question the Fairness check looks at.
      </p>
      <p>
        <span className="font-medium text-ink">Names.</span> Names appear only
        on the two lists that say why a person is there, and in each
        department&apos;s side panel, and only for people who can already open
        the register. No review answers, comments or quotes appear anywhere in
        this report.
      </p>
      <p className="font-medium text-ink">Use it as a guide, not a verdict.</p>
    </div>
  );
}
