"use client";

import { useEffect, useState } from "react";
import { Bell, Mail, TriangleAlert } from "lucide-react";
import {
  Badge,
  Callout,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Skeleton,
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
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import { company } from "@/lib/api/endpoints";
import { usePermissions } from "@/lib/permissions";
import { useCompanySettings } from "@/lib/store/company";
import { useSession } from "@/lib/store/session";

/**
 * Notifications.
 *
 * Every rule here is one somebody would actually want, and two of them are ones
 * you should not turn off:
 *
 * - **Bank details changed** is a fraud control. An employee quietly changing
 *   their account before a run is the classic payroll diversion, and the only
 *   thing standing in front of it is somebody being told. Switching it off is
 *   allowed, because it is the company's decision, but the page argues against
 *   it rather than staying neutral.
 * - **A statutory filing is due** is a penalty control. Missing a remittance
 *   deadline costs money that no amount of inbox tidiness is worth.
 *
 * ## Connected, this is `GET`/`PATCH /company/notifications`
 *
 * The demo's eight rules are hand-written English sentences; the API's rules are
 * event codes (`"leave.requested"`, `"payroll.approved"`) with no separate
 * description field, so a connected read is prettified rather than looked up in
 * a copy table that would go stale the day a company adds its own rule. Which
 * rules exist genuinely differs between the two modes — connected is whatever
 * the organisation's own rows are, not a translation of the demo's eight.
 *
 * `isControlEvent` mirrors `isControl` in `company/service.ts` character for
 * character, so the "this is a control, not a convenience" banner means the same
 * thing connected as it does here. The API also names the same control in the
 * `warning` a `PATCH` returns; that sentence is shown verbatim rather than
 * reconstructed, for the reason `LoadFailure`'s header gives — paraphrasing a
 * server message locally is how the two stop agreeing.
 */
const PROTECTED = ["n-record-change", "n-statutory-due"];

/** `company/service.ts#isControl`, copied rather than imported — this is the
    browser, and the two must keep saying the same thing on purpose, not by
    sharing code across a network boundary. */
const isControlEvent = (event: string): boolean =>
  event.includes("bank") || event.includes("statutory");

/** `"leave.requested"` → `"Leave requested"`. No copy table: a company's own
    event names arrive this way too, and a table only covers the seed's eight. */
function humanizeEvent(event: string): string {
  const spaced = event.replace(/[._]/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** The one shape both sources render through. */
type Rule = {
  id: string;
  event: string;
  detail: string | null;
  email: boolean;
  inApp: boolean;
  recipients: string;
  isProtected: boolean;
};

export function NotificationSettings() {
  const { can, loading } = usePermissions();

  if (loading) {
    return (
      <>
        <Header />
        <PageBody>
          <Skeleton className="h-40 w-full" />
          <span className="sr-only">Loading notification settings</span>
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
              icon={<Bell aria-hidden="true" />}
              title="You cannot manage notifications"
              description="Which alerts the company sends, and to whom, is a settings decision. Ask whoever manages settings to add that permission to your role."
            />
          </Card>
        </PageBody>
      </>
    );
  }

  return <Rules />;
}

function Header() {
  return (
    <PageHeader
      title="Notifications"
      breadcrumb={[{ href: "/settings", label: "Settings" }]}
    />
  );
}

function Rules() {
  const { isConnected } = useSession();
  const { settings, setNotification } = useCompanySettings();
  const toast = useToast();

  const [fetched, setFetched] = useState<{
    rows: Rule[];
    error: ApiError | null;
  } | null>(null);

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await company.notifications();
        if (!cancelled) {
          setFetched({
            rows: rows.map((rule) => ({
              id: rule.id,
              event: humanizeEvent(rule.event),
              detail: null,
              email: rule.email,
              inApp: rule.inApp,
              recipients: rule.recipients ?? "The event's default recipients",
              isProtected: isControlEvent(rule.event),
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

  const demoRules: Rule[] = settings.notifications.map((rule) => ({
    id: rule.id,
    event: rule.event,
    detail: rule.detail,
    email: rule.email,
    inApp: rule.inApp,
    recipients: rule.recipients,
    isProtected: PROTECTED.includes(rule.id),
  }));

  const rules = isConnected ? fetched?.rows ?? [] : demoRules;
  const rulesLoading = isConnected && fetched === null;

  const silenced = rules.filter((r) => !r.email && !r.inApp);
  const protectedOff = rules.filter(
    (r) => r.isProtected && !r.email && !r.inApp,
  );

  async function toggle(
    rule: Rule,
    patch: { email?: boolean; inApp?: boolean },
  ) {
    if (!isConnected) {
      setNotification(rule.id, patch);
      const next = { ...rule, ...patch };
      if (rule.isProtected && !next.email && !next.inApp) {
        toast.push({
          title: `${rule.event} is now silent`,
          tone: "danger",
          detail:
            "This one exists to catch fraud and missed deadlines. Consider leaving in-app on.",
        });
      }
      return;
    }

    const before = rule;
    setFetched(
      (s) =>
        s && {
          ...s,
          rows: s.rows.map((r) => (r.id === rule.id ? { ...r, ...patch } : r)),
        },
    );
    try {
      const result = await company.updateNotification(rule.id, patch);
      setFetched(
        (s) =>
          s && {
            ...s,
            rows: s.rows.map((r) =>
              r.id === rule.id
                ? { ...r, email: result.email, inApp: result.inApp }
                : r,
            ),
          },
      );
      if (result.warning) {
        toast.push({
          title: `${rule.event} is now silent`,
          tone: "danger",
          detail: result.warning,
        });
      }
    } catch (error) {
      /* Revert. A switch that stays flipped after the save failed is a lie
         about what is actually configured. */
      setFetched(
        (s) => s && { ...s, rows: s.rows.map((r) => (r.id === rule.id ? before : r)) },
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
          <LoadFailure subject="your notification settings" error={fetched.error}/>
        )}

        {protectedOff.length > 0 && (
          <Callout
            tone="danger"
            title={`${protectedOff[0].event} is now silent`}
          >
            This one is a control, not a convenience. With it off, a bank account
            can be changed or a remittance deadline can pass and nobody is told.
            Turn it back on unless you have another process covering it.
          </Callout>
        )}

        {silenced.length > 0 && protectedOff.length === 0 && (
          <Callout tone="info" title={`${silenced.length} events are silent`}>
            Nothing is sent for these. They still happen and are still recorded —
            people just have to come looking.
          </Callout>
        )}

        <Card>
          <CardHeader
            title="Events"
            description="Changes save as you make them."
          />
          {rulesLoading ? (
            <CardBody>
              <Skeleton className="h-40 w-full" />
            </CardBody>
          ) : rules.length === 0 ? (
            <CardBody>
              <p className="text-body-sm text-muted">
                No notification rules are set up yet.
              </p>
            </CardBody>
          ) : (
            <TableWrap className="rounded-none border-0">
              <THead>
                <TH>Event</TH>
                <TH>Recipients</TH>
                <TH align="center">Email</TH>
                <TH align="center">In app</TH>
              </THead>
              <TBody>
                {rules.map((rule) => {
                  const silent = !rule.email && !rule.inApp;
                  return (
                    <TR key={rule.id}>
                      <TDPrimary
                        title={
                          <span className="flex flex-wrap items-center gap-2">
                            {rule.event}
                            {rule.isProtected && (
                              <Badge tone="warning" size="sm">
                                Control
                              </Badge>
                            )}
                            {silent && (
                              <Badge tone="neutral" size="sm">
                                Silent
                              </Badge>
                            )}
                          </span>
                        }
                        subtitle={rule.detail ?? undefined}
                      />
                      <TD className="text-muted">{rule.recipients}</TD>
                      <TD align="center">
                        <span className="inline-flex justify-center">
                          <Switch
                            checked={rule.email}
                            label=""
                            aria-label={`Email for ${rule.event}`}
                            onChange={(e) =>
                              void toggle(rule, { email: e.target.checked })
                            }
                          />
                        </span>
                      </TD>
                      <TD align="center">
                        <span className="inline-flex justify-center">
                          <Switch
                            checked={rule.inApp}
                            label=""
                            aria-label={`In-app notification for ${rule.event}`}
                            onChange={(e) =>
                              void toggle(rule, { inApp: e.target.checked })
                            }
                          />
                        </span>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </TableWrap>
          )}
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="How delivery works" level={3} />
            <CardBody className="flex flex-col gap-3 text-body-sm leading-relaxed text-body">
              <p className="flex gap-2.5">
                <Mail
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-faint"
                />
                <span>
                  Email goes to the work address on the employee record. Someone
                  with no email on file gets the in-app notification only, which
                  is one reason the record-completeness meter exists.
                </span>
              </p>
              <p className="flex gap-2.5">
                <Bell
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-faint"
                />
                <span>
                  In-app notifications appear in the bell in the top bar and stay
                  until actioned. Approvals are never cleared by being read.
                </span>
              </p>
              <p className="flex gap-2.5">
                <TriangleAlert
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-faint"
                />
                <span>
                  Sending is not wired up in this prototype — there is no mail
                  server behind it. These are the rules the product will send on,
                  recorded honestly rather than demonstrated with a fake inbox.
                </span>
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Not configurable, on purpose"
              level={3}
              description="Two things always send, whatever is set above."
            />
            <CardBody className="flex flex-col gap-3 text-body-sm leading-relaxed text-body">
              <p>
                <strong className="text-ink">A security event on your own account.</strong>{" "}
                A sign-in from a new device, or a password change. Nobody should
                be able to switch off the alert that tells them they have been
                compromised.
              </p>
              <p>
                <strong className="text-ink">A data breach notification.</strong>{" "}
                The Nigeria Data Protection Act requires it within 72 hours, and
                it is not ours to make optional.
              </p>
            </CardBody>
          </Card>
        </div>
      </PageBody>
    </>
  );
}
