"use client";

import { Bell, Mail, TriangleAlert } from "lucide-react";
import {
  Badge,
  Callout,
  Card,
  CardBody,
  CardHeader,
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
import { useCompanySettings } from "@/lib/store/company";

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
 */
const PROTECTED = ["n-record-change", "n-statutory-due"];

export function NotificationSettings() {
  const { settings, setNotification } = useCompanySettings();
  const toast = useToast();

  const rules = settings.notifications;
  const silenced = rules.filter((r) => !r.email && !r.inApp);
  const protectedOff = rules.filter(
    (r) => PROTECTED.includes(r.id) && !r.email && !r.inApp,
  );

  return (
    <>
      <PageHeader
        title="Notifications"
        breadcrumb={[{ href: "/settings", label: "Settings" }]}
      />

      <PageBody className="flex flex-col gap-6">
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
          <TableWrap className="rounded-none border-0">
            <THead>
              <TH>Event</TH>
              <TH>Recipients</TH>
              <TH align="center">Email</TH>
              <TH align="center">In app</TH>
            </THead>
            <TBody>
              {rules.map((rule) => {
                const isProtected = PROTECTED.includes(rule.id);
                const silent = !rule.email && !rule.inApp;
                return (
                  <TR key={rule.id}>
                    <TDPrimary
                      title={
                        <span className="flex flex-wrap items-center gap-2">
                          {rule.event}
                          {isProtected && (
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
                      subtitle={rule.detail}
                    />
                    <TD className="text-muted">{rule.recipients}</TD>
                    <TD align="center">
                      <span className="inline-flex justify-center">
                        <Switch
                          checked={rule.email}
                          label=""
                          aria-label={`Email for ${rule.event}`}
                          onChange={(e) => {
                            const on = e.target.checked;
                            setNotification(rule.id, { email: on });
                            if (!on && isProtected && !rule.inApp) {
                              toast.push({
                                title: `${rule.event} is now silent`,
                                tone: "danger",
                                detail:
                                  "This one exists to catch fraud and missed deadlines. Consider leaving in-app on.",
                              });
                            }
                          }}
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
                            setNotification(rule.id, { inApp: e.target.checked })
                          }
                        />
                      </span>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </TableWrap>
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
