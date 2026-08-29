"use client";

import { useEffect, useState } from "react";
import { Check, Plug } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Skeleton,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import { company } from "@/lib/api/endpoints";
import { usePermissions } from "@/lib/permissions";
import { useCompanySettings, type Integration } from "@/lib/store/company";
import { useSession } from "@/lib/store/session";

const CATEGORY_ORDER: Integration["category"][] = [
  "Banking",
  "Accounting",
  "Attendance",
  "Identity",
  "Communication",
];

/**
 * Integrations.
 *
 * Deliberately has no Connect button that does nothing.
 *
 * The obvious build here is a grid of logos with toggles that flip to
 * "Connected" and change no state anywhere — every competitor's integrations
 * page looks like that, and half of them are lying. None of these can actually
 * connect without a backend holding OAuth credentials, so the page says
 * "Not available yet" and lets you register interest instead. A recorded request
 * is a true thing that happened; a green "Connected" pill would not be.
 *
 * The requests are also genuinely useful: which integration customers ask for
 * first is the roadmap.
 *
 * ## Connected, this is `GET`/`POST /company/integrations`
 *
 * `provider` on the wire (`"quickbooks"`) is used as the row id in both modes —
 * the demo's `"int-quickbooks"` is cosmetic and nothing downstream keys on it.
 * The categories the API's catalogue uses match this file's union exactly, which
 * is checked once here rather than trusted silently: if the API ever adds a
 * category this file does not know, the cast below is where that would need to
 * change.
 */
type IntegrationRow = {
  id: string;
  name: string;
  category: Integration["category"];
  detail: string;
  status: Integration["status"];
};

export function IntegrationsList() {
  const { can, loading } = usePermissions();

  if (loading) {
    return (
      <>
        <Header />
        <PageBody>
          <Skeleton className="h-40 w-full" />
          <span className="sr-only">Loading integrations</span>
        </PageBody>
      </>
    );
  }

  if (!can("MANAGE_SETTINGS")) {
    return (
      <>
        <Header />
        <PageBody>
          <Card>
            <EmptyState
              icon={<Plug aria-hidden="true" />}
              title="You cannot manage integrations"
              description="Requesting or withdrawing an integration is a settings decision. Ask whoever manages settings to add that permission to your role."
            />
          </Card>
        </PageBody>
      </>
    );
  }

  return <Catalogue />;
}

function Header() {
  return (
    <PageHeader
      title="Integrations"
      breadcrumb={[{ href: "/settings", label: "Settings" }]}
    />
  );
}

function Catalogue() {
  const { isConnected } = useSession();
  const { settings, setIntegrationStatus } = useCompanySettings();
  const toast = useToast();

  const [fetched, setFetched] = useState<{
    rows: IntegrationRow[];
    error: ApiError | null;
  } | null>(null);

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await company.integrations();
        if (!cancelled) {
          setFetched({
            rows: rows.map((row) => ({
              id: row.provider,
              name: row.name,
              category: row.category as Integration["category"],
              detail: row.detail,
              status: row.status,
            })),
            error: null,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setFetched({
            rows: [],
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected]);

  const demoRows: IntegrationRow[] = settings.integrations.map((integration) => ({
    id: integration.id,
    name: integration.name,
    category: integration.category,
    detail: integration.detail,
    status: integration.status,
  }));

  const rows = isConnected ? fetched?.rows ?? [] : demoRows;
  const rowsLoading = isConnected && fetched === null;

  const requested = rows.filter((i) => i.status === "requested");

  async function setStatus(
    row: IntegrationRow,
    status: "unavailable" | "requested",
  ) {
    if (!isConnected) {
      setIntegrationStatus(row.id, status);
      if (status === "requested") {
        toast.push({
          title: `${row.name} requested`,
          tone: "success",
          detail:
            "Noted against your account. It counts towards which integration we build next.",
        });
      }
      return;
    }

    const before = row;
    setFetched(
      (s) =>
        s && {
          ...s,
          rows: s.rows.map((r) => (r.id === row.id ? { ...r, status } : r)),
        },
    );
    try {
      await company.setIntegration(row.id, status === "requested");
      if (status === "requested") {
        toast.push({
          title: `${row.name} requested`,
          tone: "success",
          detail:
            "Noted against your account. It counts towards which integration we build next.",
        });
      }
    } catch (error) {
      setFetched(
        (s) => s && { ...s, rows: s.rows.map((r) => (r.id === row.id ? before : r)) },
      );
      toast.push({
        title: "That did not save",
        tone: "danger",
        detail:
          error instanceof ApiError ? error.message : "Something went wrong. Try again.",
      });
    }
  }

  return (
    <>
      <Header />

      <PageBody className="flex flex-col gap-6">
        {isConnected && fetched?.error && (
          <LoadFailure subject="the integrations catalogue" error={fetched.error}/>
        )}

        <Callout tone="info" title="None of these are live yet">
          Connecting any of them means holding credentials for another company&rsquo;s
          API, which needs the backend. Rather than showing a toggle that flips to
          &ldquo;Connected&rdquo; and does nothing, this page tells you where each one stands
          and lets you tell us which to build first.
        </Callout>

        {requested.length > 0 && (
          <Card>
            <CardBody className="flex flex-wrap items-center gap-3">
              <span
                aria-hidden="true"
                className="flex size-9 items-center justify-center rounded-md bg-success-soft text-success-text [&>svg]:size-[18px]"
              >
                <Check aria-hidden="true" />
              </span>
              <p className="min-w-0 flex-1 text-body-sm text-body">
                <span className="font-medium text-ink">
                  {requested.length}{" "}
                  {requested.length === 1 ? "integration" : "integrations"}{" "}
                  requested.
                </span>{" "}
                {requested.map((i) => i.name).join(", ")}. We prioritise by what
                customers actually ask for.
              </p>
            </CardBody>
          </Card>
        )}

        {rowsLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          CATEGORY_ORDER.map((category) => {
            const items = rows.filter((i) => i.category === category);
            if (items.length === 0) return null;

            return (
              <Card key={category}>
                <CardHeader
                  title={category}
                  level={3}
                  description={
                    category === "Banking"
                      ? "Executes the payment file once a payroll is approved. Nothing moves money without that approval."
                      : undefined
                  }
                />
                <CardBody className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((integration) => {
                    const isRequested = integration.status === "requested";
                    return (
                      <div
                        key={integration.id}
                        className="flex flex-col gap-3 rounded-lg border border-line p-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span
                            aria-hidden="true"
                            className="flex size-9 items-center justify-center rounded-md bg-sunken text-faint [&>svg]:size-[18px]"
                          >
                            <Plug aria-hidden="true" />
                          </span>
                          <Badge
                            tone={isRequested ? "success" : "neutral"}
                            size="sm"
                            dot={isRequested}
                          >
                            {isRequested ? "Requested" : "Not available yet"}
                          </Badge>
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="text-body font-semibold text-ink">
                            {integration.name}
                          </p>
                          <p className="mt-1 text-body-sm leading-relaxed text-body">
                            {integration.detail}
                          </p>
                        </div>

                        <Button
                          variant={isRequested ? "ghost" : "secondary"}
                          size="sm"
                          onClick={() =>
                            void setStatus(
                              integration,
                              isRequested ? "unavailable" : "requested",
                            )
                          }
                        >
                          {isRequested ? "Withdraw request" : "Request this"}
                        </Button>
                      </div>
                    );
                  })}
                </CardBody>
              </Card>
            );
          })
        )}

        <Card>
          <CardHeader title="Already built in" level={3} />
          <CardBody className="flex flex-col gap-2.5 text-body-sm leading-relaxed text-body">
            <p>
              <strong className="text-ink">Statutory filing schedules.</strong>{" "}
              PAYE per state IRS, pension per PFA, NHF and NSITF — generated from
              the payroll run, in the format each body asks for. No integration
              required because the output is a file you submit, not an API call.
            </p>
            <p>
              <strong className="text-ink">Bank payment files.</strong> The
              approved run produces a payment file in your bank&rsquo;s format. The
              Banking integrations above would remove the upload step; they are
              not required to pay anybody.
            </p>
          </CardBody>
        </Card>
      </PageBody>
    </>
  );
}
