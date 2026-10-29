"use client";

import { useEffect, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  EmptyState,
  Spinner,
  TextLink,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import { employees, type ApiRequiredOverview } from "@/lib/api/endpoints";
import { useCan } from "@/lib/permissions";
import { useSession } from "@/lib/store/session";

/**
 * Which personal details staff must fill in, and who still has gaps.
 *
 * Staff fill in some details and leave others. Ticking one here makes it
 * required: My profile marks it, will not save while it is blank, and the
 * dashboard reminds the person until it is filled in. Nothing else in the app
 * is blocked. Only the personal details staff fill in themselves can be
 * required; bank, pension and tax numbers have payroll's own check.
 */
export function RequiredDetailsScreen() {
  const canManage = useCan("MANAGE_SETTINGS");
  const { isConnected } = useSession();
  const toast = useToast();
  const [overview, setOverview] = useState<ApiRequiredOverview | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!canManage || !isConnected) return;
    const controller = new AbortController();
    employees
      .requiredDetails(controller.signal)
      .then((result) => {
        setOverview(result);
        setChosen(result.required.map((r) => r.field));
        setFailure(null);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError")
          return;
        setFailure(caught);
      });
    return () => controller.abort();
  }, [canManage, isConnected, nonce]);

  const header = (
    <PageHeader
      title="Required details"
      breadcrumb={[{ href: "/settings", label: "Settings" }]}
    />
  );

  if (!canManage) {
    return (
      <>
        {header}
        <PageBody>
          <Card>
            <EmptyState
              icon={<ClipboardCheck aria-hidden="true" />}
              title="Choosing required details is not part of your access"
              description="It applies to everybody in the company, so it needs the settings permission."
            />
          </Card>
        </PageBody>
      </>
    );
  }

  const saved = overview?.required.map((r) => r.field) ?? [];
  const dirty =
    chosen !== null &&
    (chosen.length !== saved.length || chosen.some((f) => !saved.includes(f)));

  async function save() {
    if (!chosen) return;
    setBusy(true);
    try {
      const result = await employees.setRequiredDetails(chosen);
      setOverview(result);
      setChosen(result.required.map((r) => r.field));
      toast.push({
        title: "Saved",
        tone: "success",
        detail:
          result.required.length === 0
            ? "Nothing is required now."
            : `${result.outstanding.length} of ${result.staff} staff still have something to fill in. They will see a reminder on their dashboard.`,
      });
    } catch (caught) {
      toast.push({
        title: "That did not save",
        tone: "danger",
        detail:
          caught instanceof ApiError
            ? caught.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {header}
      <PageBody className="flex flex-col gap-5">
        <LoadFailure
          subject="the required details"
          error={failure}
          onRetry={() => setNonce((n) => n + 1)}
        />

        {!overview || !chosen ? (
          !failure && (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          )
        ) : (
          <>
            <Card>
              <CardHeader
                level={2}
                title="What staff must fill in"
                description="Ticked details are marked on My profile, cannot be left blank there, and are asked for on the dashboard until filled in. Nothing else is blocked."
              />
              <CardBody className="flex flex-col gap-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  {overview.options.map((option) => (
                    <Checkbox
                      key={option.field}
                      label={option.label}
                      checked={chosen.includes(option.field)}
                      onChange={(event) => {
                        const on = event.target.checked;
                        setChosen((current) =>
                          on
                            ? [...(current ?? []), option.field]
                            : (current ?? []).filter((f) => f !== option.field),
                        );
                      }}
                    />
                  ))}
                </div>
                <p className="text-meta text-muted">
                  Bank, pension and tax numbers are not here: payroll already
                  checks those before a run. See{" "}
                  <TextLink href="/people/incomplete">
                    incomplete records
                  </TextLink>
                  .
                </p>
                <div>
                  <Button
                    variant="accent"
                    size="sm"
                    loading={busy}
                    disabled={!dirty || busy}
                    onClick={() => void save()}
                  >
                    Save
                  </Button>
                </div>
              </CardBody>
            </Card>

            {overview.required.length > 0 && (
              <Card>
                <CardHeader
                  level={2}
                  title="Who still has gaps"
                  description={
                    overview.outstanding.length === 0
                      ? `All ${overview.staff} current staff have filled in everything required.`
                      : `${overview.outstanding.length} of ${overview.staff} current staff. A detail sent for HR's approval counts as filled in.`
                  }
                />
                {overview.outstanding.length > 0 && (
                  <CardBody className="p-0">
                    <ul className="divide-y divide-line">
                      {overview.outstanding.map((person) => (
                        <li
                          key={person.employeeId}
                          className="flex flex-wrap items-center justify-between gap-2 px-5 py-3"
                        >
                          <span className="min-w-0">
                            <TextLink href={`/people/${person.employeeId}`}>
                              {person.name}
                            </TextLink>
                            <span className="ml-2 text-meta text-muted">
                              {person.employeeNo}
                            </span>
                          </span>
                          <span className="flex flex-wrap gap-1.5">
                            {person.missing.map((m) => (
                              <Badge key={m.field} tone="warning" size="sm">
                                {m.label}
                              </Badge>
                            ))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardBody>
                )}
              </Card>
            )}
          </>
        )}
      </PageBody>
    </>
  );
}
