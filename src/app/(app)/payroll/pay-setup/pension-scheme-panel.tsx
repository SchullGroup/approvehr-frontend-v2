"use client";

import { useState } from "react";
import {
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Input,
  Spinner,
  Switch,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { employees as employeesApi } from "@/lib/api/endpoints";
import {
  useEmployeeDirectory,
  useEmployeeMutations,
} from "@/lib/store/employees-api";
import { usePayrollSettings } from "@/lib/payroll/use-settings";

/**
 * Who is in the pension scheme — a switch per person, in one place.
 *
 * Pension is a company-wide setting, and some people are not in the scheme.
 * Taking them out here is the whole job: nothing is deducted from them, the
 * company adds no employer contribution, and payroll stops asking for their
 * pension PIN, so there is no pile of warnings for people who will never have
 * one. The same switch sits on each person's record; this is the list view of
 * it for a company with many.
 */
export function PensionSchemePanel({ canEdit }: { canEdit: boolean }) {
  const { settings, loading: settingsLoading } = usePayrollSettings();
  const [query, setQuery] = useState("");
  const directory = useEmployeeDirectory({
    pageSize: 200,
    status: "active",
    ...(query.trim() ? { q: query.trim() } : {}),
  });
  const { update } = useEmployeeMutations();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const people = directory.employees;
  const outCount = people.filter((p) => p.pensionExempt === true).length;

  function message(error: unknown): string {
    return error instanceof ApiError || error instanceof Error
      ? error.message
      : "Could not save that.";
  }

  async function setOne(id: string, exempt: boolean) {
    setFailed(null);
    try {
      await update(id, { pensionExempt: exempt });
      directory.reload();
    } catch (error) {
      setFailed(message(error));
    }
  }

  async function setMany(exempt: boolean) {
    if (people.length === 0) return;
    setBusy(true);
    setFailed(null);
    try {
      if (directory.connected) {
        await employeesApi.bulkPensionScheme({
          employeeIds: people.map((p) => p.id),
          exempt,
        });
      } else {
        for (const p of people) await update(p.id, { pensionExempt: exempt });
      }
      directory.reload();
      toast.push({
        title: exempt
          ? "Everyone listed is out of the pension scheme"
          : "Everyone listed is in the pension scheme",
        tone: "success",
      });
    } catch (error) {
      setFailed(message(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Who is in the pension scheme"
        description="Switch someone off and nothing is deducted from them, the company adds no employer contribution, and payroll stops asking for their pension PIN."
        level={3}
      />
      <CardBody>
        {!settingsLoading && !settings.pension.enabled && (
          <Callout tone="info" className="mb-3">
            Pension is switched off for the whole company, so this list changes
            nothing until it is switched on.
          </Callout>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="Find a person"
            placeholder="Find a person"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="max-w-xs"
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={!canEdit || busy || people.length === 0}
            onClick={() => void setMany(false)}
          >
            Everyone in
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!canEdit || busy || people.length === 0}
            onClick={() => void setMany(true)}
          >
            Everyone out
          </Button>
          {directory.loading && <Spinner size="sm" />}
        </div>
        <p className="mt-3 text-body-sm text-muted">
          {people.length === 0
            ? "Nobody to show."
            : `${String(people.length - outCount)} in, ${String(outCount)} out, of ${String(people.length)} shown.`}
        </p>
        <ul className="mt-2 divide-y divide-line">
          {people.map((person) => (
            <li key={person.id} className="py-2">
              <Switch
                label={`${person.firstName} ${person.lastName}`}
                description={person.jobTitle}
                checked={person.pensionExempt !== true}
                disabled={!canEdit || busy}
                onChange={(event) =>
                  void setOne(person.id, !event.target.checked)
                }
              />
            </li>
          ))}
        </ul>
        {!canEdit && (
          <p className="mt-3 text-body-sm text-muted">
            Changing this needs the “Edit records” permission.
          </p>
        )}
        {failed && (
          <Callout tone="danger" className="mt-3">
            {failed}
          </Callout>
        )}
      </CardBody>
    </Card>
  );
}
