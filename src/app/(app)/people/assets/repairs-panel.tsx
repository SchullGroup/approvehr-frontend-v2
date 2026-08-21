"use client";

import { Wrench } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Money,
  SegmentedControl,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
} from "@/components/ui";
import { dayLabel, daysSince, type Repair } from "@/lib/store/assets";

export type RepairFilter = "open" | "completed" | "all";

/**
 * The workshop.
 *
 * ## Why this is a tab and not a filter on the register
 *
 * "In for repair" is on the register's filter row and answers "which laptops are
 * out of action". This answers a different question — what is outstanding with
 * which vendor, and what has it cost — and it has its own rows, because two
 * repairs on one laptop are two jobs.
 *
 * ## Finishing one is a button, not a form
 *
 * Marking a job done is the common case and it takes one click. Finishing the
 * last open job on something nobody is holding puts it back in the store on its
 * own; if somebody is holding it, or it has been written off, it stays where it
 * is. Both of those are the API's rules, not this screen's, so there is nothing
 * here to keep in step.
 */
export function RepairsPanel({
  repairs,
  loading,
  canEdit,
  filter,
  onFilterChange,
  onFinish,
}: {
  repairs: Repair[];
  loading: boolean;
  canEdit: boolean;
  filter: RepairFilter;
  onFilterChange: (value: RepairFilter) => void;
  onFinish: (repair: Repair) => void;
}) {
  return (
    <Card>
      <CardHeader
        title="Repairs"
        description="Still-open jobs first, whatever else is on the list."
        action={
          <SegmentedControl<RepairFilter>
            label="Filter repairs"
            value={filter}
            onChange={onFilterChange}
            options={[
              { value: "open", label: "Still in" },
              { value: "completed", label: "Done" },
              { value: "all", label: "All" },
            ]}
          />
        }
      />

      {repairs.length === 0 ? (
        <EmptyState
          icon={<Wrench aria-hidden="true" />}
          title={loading ? "Loading…" : "Nothing in the workshop"}
          description={
            loading
              ? "Reading the repair records."
              : "Log a repair from a piece of equipment and it appears here."
          }
        />
      ) : (
        <TableWrap className="rounded-none border-0" caption="Repairs">
          <THead>
            <TH>What is being fixed</TH>
            <TH>Which one</TH>
            <TH>Went in</TH>
            <TH>Who is fixing it</TH>
            <TH align="right">Cost</TH>
            <TH align="right">
              <span className="sr-only">Actions</span>
            </TH>
          </THead>
          <TBody>
            {repairs.map((repair) => (
              <TR key={repair.id}>
                <TDPrimary
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      {repair.description}
                      {repair.open && (
                        <Badge tone="info" size="sm" dot>
                          Still in
                        </Badge>
                      )}
                    </span>
                  }
                />
                <TD className="text-body-sm">
                  <span className="block text-ink">{repair.itemName ?? "—"}</span>
                  <span className="tabular block text-meta text-muted">
                    {repair.tag ?? ""}
                  </span>
                </TD>
                <TD className="whitespace-nowrap text-body-sm">
                  <span className="block text-body">
                    {dayLabel(repair.startedOn)}
                  </span>
                  <span className="block text-meta text-muted">
                    {repair.completedOn
                      ? `out ${dayLabel(repair.completedOn)}`
                      : `${daysSince(repair.startedOn)} days`}
                  </span>
                </TD>
                <TD className="text-body-sm text-body">
                  {repair.vendor ?? "—"}
                </TD>
                <TD align="right">
                  {repair.cost === null ? (
                    <span className="text-body-sm text-faint">—</span>
                  ) : (
                    <Money amount={repair.cost} size="sm" />
                  )}
                </TD>
                <TD align="right">
                  {repair.open && canEdit && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onFinish(repair)}
                    >
                      It is fixed
                    </Button>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </TableWrap>
      )}
    </Card>
  );
}
