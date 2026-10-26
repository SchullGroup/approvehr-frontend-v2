import type { CompanyReport } from "@/lib/api/company-report";
import { PrintDepartments } from "./departments-tab";
import { Findings, MethodText, Strengths } from "./overview";

/**
 * What goes on paper, and nothing that is only for the screen.
 *
 * Hidden on a screen (`hidden print:...`) and shown by the browser's print
 * stylesheet, so it works however a person reaches Print and not only through the
 * button. Both tabs in one flow, then how it was worked out. **No names**: the
 * two named findings and the department panel's list are left out, because a PDF
 * is the report leaving the product and names belong to people who can open the
 * register. Priority actions are plain text, and findings carry no links, because
 * neither leads anywhere from a sheet of paper. The headline, the coverage strip
 * and the list of what was not measured are the same elements the screen shows
 * above, so they print once, not twice.
 *
 * Its own file so a test of the screen can leave it out: jsdom has no stylesheet,
 * so every word here would otherwise be on the page twice.
 */

/** The company's name and the report's, which the screen's own header does not print. */
export function PrintHeading({ companyName }: { companyName: string | null }) {
  return (
    <div className="hidden print:block" data-print-layout="">
      {companyName && (
        <p className="text-body-md font-medium text-ink">{companyName}</p>
      )}
      <p className="text-h3 text-ink">Company reports</p>
    </div>
  );
}

export function PrintBody({ report }: { report: CompanyReport }) {
  const findings = report.findings.filter((finding) => !finding.lines);
  return (
    <div className="hidden flex-col gap-6 print:flex" data-print-layout="">
      <Findings report={{ ...report, findings }} print />
      {report.strengths && report.strengths.length > 0 && (
        <Strengths strengths={report.strengths} />
      )}
      {report.actions.length > 0 && (
        <section className="flex flex-col gap-1">
          <h2 className="text-h4 text-ink">Priority actions</h2>
          <ul className="list-disc pl-5 text-body-sm text-body">
            {report.actions.map((action) => (
              <li key={action.id}>{action.label}</li>
            ))}
          </ul>
        </section>
      )}
      <PrintDepartments report={report} />
      <section className="flex flex-col gap-2">
        <h2 className="text-h4 text-ink">Method and privacy</h2>
        <MethodText />
      </section>
      <p className="text-meta text-muted">
        Use this as a guide, not a verdict. This printed report carries no
        names.
      </p>
    </div>
  );
}
