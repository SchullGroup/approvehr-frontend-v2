"use client";

import { Info } from "lucide-react";
import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  ProgressMeter,
  Select,
  Switch,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  useToast,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { EMPLOYEES } from "@/lib/mock/people";
import { useCompanySettings } from "@/lib/store/company";
import { useLeaveBalances } from "@/lib/store/leave-balances";
import { useSession } from "@/lib/store/session";
import { TODAY } from "@/lib/today";
import { remainingDays } from "@/lib/workflows/leave";
import { fullName } from "@/lib/types";
import { HolidaysPanel } from "./holidays-panel";

const ACCRUAL_LABEL = {
  annual_upfront: "Granted in full on 1 January",
  monthly: "Accrues monthly",
  on_completion: "Granted when the event occurs",
} as const;

/**
 * Leave policy.
 *
 * This page is load-bearing, not a preferences screen. `entitled` here is the
 * divisor `leaveBalancesFor` uses, so changing Annual leave from 20 days to 22
 * moves every balance on `/people/leave`, on every employee record, and in the
 * booking dialog's validation — immediately, without a save button, because
 * there is only one number and this is where it lives.
 *
 * The preview panel is there to make that consequence visible before someone
 * changes a figure and wonders what it did.
 */
export function LeavePolicyForm() {
  const { settings, updateLeave, updateLeaveType } = useCompanySettings();
  const leaveBalances = useLeaveBalances();
  const { isConnected } = useSession();
  const toast = useToast();

  /* Demo mode runs on `TODAY`; the real clock would open the calendar on a year
     the seed has nothing in. Same reasoning as `/people/leave`. */
  const calendarYear = Number(
    (isConnected ? new Date().toISOString().slice(0, 10) : TODAY).slice(0, 4),
  );

  const policy = settings.leave;

  /* Company-wide effect of the current policy, so the number above has a
     consequence you can see rather than one you have to imagine. */
  const annual = policy.types.find((t) => t.name === "Annual");
  const balances = EMPLOYEES.map((e) => ({
    employee: e,
    balance: leaveBalances.forType(e.id, "Annual"),
  })).filter((row) => row.balance !== undefined);

  const overdrawn = balances.filter(
    (row) => remainingDays(row.balance!) < 0,
  ).length;

  return (
    <>
      <PageHeader
        title="Leave policies"
        breadcrumb={[{ href: "/settings", label: "Settings" }]}
      />

      <PageBody className="flex flex-col gap-6">
        <Callout tone="info" title="These figures are live">
          Entitlement is the number every balance in the product is measured
          against. Change it here and `/people/leave`, each employee record and
          the booking form all move at once — there is no separate copy to keep
          in step.
        </Callout>

        <Card>
          <CardHeader
            title="Leave types"
            description="Statutory minimums in Nigeria are a floor, not a ceiling — a company may grant more."
          />
          <TableWrap className="rounded-none border-0">
            <THead>
              <TH>Type</TH>
              <TH align="right">Days a year</TH>
              <TH>Accrual</TH>
              <TH align="right">Carry over</TH>
              <TH align="right">Notice</TH>
              <TH>Evidence</TH>
            </THead>
            <TBody>
              {policy.types.map((type) => (
                <TR key={type.name}>
                  <TDPrimary
                    title={type.name}
                    subtitle={ACCRUAL_LABEL[type.accrual]}
                  />
                  <TD align="right">
                    <Input
                      type="number"
                      min={0}
                      max={365}
                      value={type.entitled}
                      className="w-20 text-right"
                      aria-label={`${type.name} days per year`}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        if (!Number.isFinite(next) || next < 0) return;
                        updateLeaveType(type.name, { entitled: next });
                      }}
                    />
                  </TD>
                  <TD>
                    <Select
                      value={type.accrual}
                      aria-label={`${type.name} accrual`}
                      onChange={(e) => {
                        const next = e.target
                          .value as (typeof type)["accrual"];
                        updateLeaveType(type.name, { accrual: next });
                      }}
                    >
                      <option value="annual_upfront">Upfront</option>
                      <option value="monthly">Monthly</option>
                      <option value="on_completion">On event</option>
                    </Select>
                  </TD>
                  <TD align="right">
                    <Input
                      type="number"
                      min={0}
                      max={type.entitled}
                      value={type.carryOverMax}
                      className="w-20 text-right"
                      aria-label={`${type.name} carry-over maximum`}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        if (!Number.isFinite(next) || next < 0) return;
                        updateLeaveType(type.name, { carryOverMax: next });
                      }}
                    />
                  </TD>
                  <TD align="right">
                    <Input
                      type="number"
                      min={0}
                      max={90}
                      value={type.minNoticeDays}
                      className="w-20 text-right"
                      aria-label={`${type.name} minimum notice in days`}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        if (!Number.isFinite(next) || next < 0) return;
                        updateLeaveType(type.name, { minNoticeDays: next });
                      }}
                    />
                  </TD>
                  <TD>
                    <Switch
                      checked={type.requiresEvidence}
                      label={type.requiresEvidence ? "Required" : "Not required"}
                      onChange={(e) =>
                        updateLeaveType(type.name, {
                          requiresEvidence: e.target.checked,
                        })
                      }
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Approval rules" level={3} />
            <CardBody className="flex flex-col gap-5">
              <Field
                label="Allow approval into a negative balance"
                help="Off means an approver cannot push someone past their entitlement. On means they can, and payroll treats the excess as unpaid."
              >
                <Switch
                  checked={policy.allowNegativeBalance}
                  label={policy.allowNegativeBalance ? "Allowed" : "Blocked"}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    updateLeave({ allowNegativeBalance: checked });
                    toast.push({
                      title: checked
                        ? "Negative balances allowed"
                        : "Negative balances blocked",
                      tone: checked ? "info" : "success",
                      detail: checked
                        ? "Approvers can now exceed an entitlement. The excess is unpaid."
                        : "Approvers can no longer exceed an entitlement.",
                    });
                  }}
                />
              </Field>

              <Field
                label="Hold pending days against the remaining figure"
                help="On means an approver sees a balance that already accounts for requests they have not decided yet. Off means they can approve the same days twice."
              >
                <Switch
                  checked={policy.reservePendingDays}
                  label={policy.reservePendingDays ? "Held back" : "Not held back"}
                  onChange={(e) =>
                    updateLeave({ reservePendingDays: e.target.checked })
                  }
                />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="What this policy produces"
              description={`Annual leave at ${annual?.entitled ?? 0} days, across the whole company.`}
              level={3}
            />
            <CardBody className="flex flex-col gap-3.5">
              {overdrawn > 0 && (
                <Callout tone="warning" title={`${overdrawn} people are now over`}>
                  Reducing the entitlement does not cancel leave already
                  approved. These balances are negative until the next accrual
                  year.
                </Callout>
              )}
              {balances.slice(0, 6).map(({ employee, balance }) => {
                const remaining = remainingDays(balance!);
                return (
                  <div key={employee.id}>
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="truncate text-body-sm text-body">
                        {fullName(employee)}
                      </span>
                      <span className="tabular shrink-0 text-meta text-muted">
                        {remaining} of {balance!.entitled} left
                      </span>
                    </div>
                    <ProgressMeter
                      value={Math.min(balance!.taken, balance!.entitled)}
                      max={Math.max(balance!.entitled, 1)}
                      size="sm"
                      tone={remaining < 0 ? "danger" : remaining <= 3 ? "warning" : "accent"}
                    />
                  </div>
                );
              })}
              <p className="mt-1 flex gap-2 text-meta leading-relaxed text-muted">
                <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                Days taken before the tracked period are included, which is why
                nobody starts at a full entitlement.
              </p>
            </CardBody>
          </Card>
        </div>

        {/* Was a paragraph describing a calendar nobody could see or change.
            `GET/POST/PATCH/DELETE /leave/holidays` exist now, so it is the real
            thing. Demo mode edits a seeded copy and says so. */}
        <HolidaysPanel defaultYear={calendarYear} />
      </PageBody>
    </>
  );
}
