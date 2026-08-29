"use client";

import { sourceNote } from "@/lib/demo";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Archive, Landmark, Plus, RotateCcw, Star } from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  Spinner,
  Stat,
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
import type { ApiBankAccount } from "@/lib/api/payments";
import { usePermissions } from "@/lib/permissions";
import { useBankAccounts } from "@/lib/store/payments";
import { longDate } from "../../payroll/payments/format";
import { AccountForm } from "./account-form";

/**
 * The company's own bank accounts — where salary money leaves from.
 *
 * ## Exactly one primary, always
 *
 * Setting a new one **demotes** the old one in the same breath. There is never a
 * moment with two, and there is no way to turn the primary flag off: a company
 * with accounts but no primary cannot build a payment batch, and a screen that
 * quietly leaves them there is a support call. So the control is "Salaries come
 * from here" on another account, not a switch on this one.
 *
 * ## Nothing is deleted
 *
 * Archiving hides an account. Past payment batches still point at it and have to
 * keep resolving, which is why the API has no delete and this screen has no
 * delete button.
 *
 * ## The refusals are the feature
 *
 * Changing an account number or switching an account off while a batch that has
 * not gone out still points at it is refused by name — that is the exact shape a
 * payroll diversion takes. The messages come from the API and are shown as they
 * are written; they name the batches.
 */
export function BankAccountsScreen() {
  const { can, loading: permissionsLoading } = usePermissions();
  /* Wherever this was reached from — the payroll run wizard's own preflight
     checklist links here with it — beats always landing back on the generic
     Settings index when that is not where the visit started. */
  const from = useSearchParams().get("from");
  const [showArchived, setShowArchived] = useState(false);
  const accounts = useBankAccounts(showArchived);
  const toast = useToast();

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ApiBankAccount | null>(null);
  const [promoting, setPromoting] = useState<ApiBankAccount | null>(null);
  const [archiving, setArchiving] = useState<ApiBankAccount | null>(null);
  const [busy, setBusy] = useState(false);

  if (permissionsLoading) {
    return (
      <PageBody className="flex items-center justify-center py-24">
        <Spinner />
      </PageBody>
    );
  }

  if (!can("MANAGE_SETTINGS")) {
    return (
      <>
        <PageHeader title="Bank accounts" />
        <PageBody>
          <Card>
            <EmptyState
              icon={<Landmark aria-hidden="true" />}
              title="Bank accounts are not part of your access"
              description="Where salary money leaves from is a settings decision. Ask whoever manages settings if you need it."
              action={
                <ButtonLink href={from ?? "/settings"}>
                  {from ? "Back" : "Back to settings"}
                </ButtonLink>
              }
            />
          </Card>
        </PageBody>
      </>
    );
  }

  /** Every mutation reports its own failure. The API's wording is the point. */
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      toast.push({ title: success, tone: "success" });
      return true;
    } catch (error) {
      toast.push({
        title: "That did not work",
        tone: "danger",
        detail:
          error instanceof ApiError ? error.message : "Something went wrong. Try again.",
      });
      return false;
    } finally {
      setBusy(false);
    }
  }

  const primary = accounts.accounts.find((account) => account.isPrimary);

  return (
    <>
      <PageHeader
        title="Bank accounts"
        breadcrumb={[
          from
            ? { href: from, label: "Payroll" }
            : { href: "/settings", label: "Settings" },
        ]}
        meta={
          sourceNote(accounts.live) && (
            <Badge tone="warning" size="sm" dot>
              {sourceNote(accounts.live)}
            </Badge>
          )
        }
        action={
          <Button variant="accent" size="sm" onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" className="size-4" />
            Add an account
          </Button>
        }
      />

      <PageBody className="flex flex-col gap-6">
        {accounts.error && (
          <LoadFailure subject="the accounts" error={accounts.error}  onRetry={accounts.reload}/>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Accounts in use" value={String(accounts.counts.active)} />
          <Stat
            label="Salaries come from"
            value={
              primary ? (
                <span className="text-body font-medium text-ink">
                  {primary.bankName}
                </span>
              ) : (
                <span className="text-body font-medium text-muted">Not set</span>
              )
            }
            hint={primary?.accountNumberMasked}
          />
          <Stat label="Archived" value={String(accounts.counts.archived)} />
        </div>

        {!primary && accounts.accounts.length > 0 && (
          <Card>
            <CardBody className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-body-sm text-ink">
                No account is set for salaries to come from, so a payment batch
                cannot be built.
              </p>
              <Button
                variant="accent"
                size="sm"
                onClick={() => setPromoting(accounts.accounts[0] ?? null)}
              >
                Use {accounts.accounts[0]?.bankName}
              </Button>
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader
            title="Accounts"
            description="One account is where salaries come from. The rest are on file."
            action={
              <Checkbox
                label="Show archived"
                checked={showArchived}
                onChange={(e) => {
                  const next = e.target.checked;
                  setShowArchived(next);
                }}
              />
            }
          />

          {accounts.loading ? (
            <CardBody className="flex justify-center py-10">
              <Spinner />
            </CardBody>
          ) : accounts.accounts.length === 0 ? (
            <EmptyState
              icon={<Landmark aria-hidden="true" />}
              title="No bank accounts yet"
              description="Add the account salaries come out of. The first one you add becomes the one payment batches use."
              action={
                <Button variant="accent" onClick={() => setAdding(true)}>
                  <Plus aria-hidden="true" className="size-4" />
                  Add an account
                </Button>
              }
            />
          ) : (
            <TableWrap
              className="rounded-none border-0"
              caption="The company's bank accounts"
            >
              <THead>
                <TH>Bank</TH>
                <TH>Name on the account</TH>
                <TH>Number</TH>
                <TH>Used for</TH>
                <TH>Added</TH>
                <TH align="right">
                  <span className="sr-only">Actions</span>
                </TH>
              </THead>
              <TBody>
                {accounts.accounts.map((account) => (
                  <TR key={account.id} className={account.archived ? "opacity-60" : ""}>
                    <TDPrimary
                      title={account.bankName}
                      subtitle={account.accountType ?? undefined}
                    />
                    <TD>{account.accountName}</TD>
                    <TD className="tabular">{account.accountNumberMasked}</TD>
                    <TD>
                      <span className="flex flex-wrap items-center gap-1.5">
                        {account.isPrimary && (
                          <Badge
                            tone="accent"
                            size="sm"
                            icon={<Star aria-hidden="true" />}
                          >
                            Salaries
                          </Badge>
                        )}
                        {!account.active && !account.archived && (
                          <Badge tone="warning" size="sm" dot>
                            Switched off
                          </Badge>
                        )}
                        {account.archived && (
                          <Badge tone="neutral" size="sm">
                            Archived
                          </Badge>
                        )}
                        {!account.isPrimary && account.active && !account.archived && (
                          <span className="text-body-sm text-muted">On file</span>
                        )}
                      </span>
                    </TD>
                    <TD className="text-body-sm text-muted">
                      {longDate(account.addedOn)}
                    </TD>
                    <TD align="right">
                      <div className="flex justify-end gap-1.5">
                        {/* An archived account carries no actions. There is no
                            endpoint that un-archives one — it stays on file so
                            past batches keep resolving, and that is all. */}
                        {account.archived ? (
                          <span className="text-body-sm text-muted">
                            Kept for past batches
                          </span>
                        ) : (
                          <>
                            {!account.active && (
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                  void run(
                                    () => accounts.update(account.id, { active: true }),
                                    `${account.bankName} switched back on`,
                                  )
                                }
                              >
                                <RotateCcw aria-hidden="true" className="size-3.5" />
                                Switch on
                              </Button>
                            )}
                            {!account.isPrimary && account.active && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setPromoting(account)}
                              >
                                Salaries come from here
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditing(account)}
                            >
                              Edit
                            </Button>
                            {/* Archiving the salary account is refused while
                                there is another one to promote, so the control
                                is not offered there — the way to do it is to
                                make another account the salary account first,
                                which is the button beside this one. */}
                            {(!account.isPrimary || accounts.counts.active === 1) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setArchiving(account)}
                                aria-label={`Archive ${account.bankName} ${account.accountNumberMasked}`}
                              >
                                <Archive aria-hidden="true" className="size-3.5" />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          )}
        </Card>

        <p className="text-body-sm text-muted">
          Every change here is recorded in the{" "}
          <Link
            href="/settings/audit"
            className="text-accent-text hover:underline underline-offset-4"
          >
            audit trail
          </Link>{" "}
          and whoever can release money is told. Account numbers are never written
          into the trail.
        </p>
      </PageBody>

      {adding && (
        <AccountForm
          hasPrimary={Boolean(primary)}
          onClose={() => setAdding(false)}
          onSave={async (body) => {
            const ok = await run(
              () => accounts.create(body),
              `${body.bankName} added`,
            );
            if (ok) setAdding(false);
          }}
        />
      )}

      {editing && (
        <AccountForm
          account={editing}
          hasPrimary={Boolean(primary)}
          onClose={() => setEditing(null)}
          onSave={async (body) => {
            const ok = await run(
              () => accounts.update(editing.id, body),
              "Saved",
            );
            if (ok) setEditing(null);
          }}
        />
      )}

      <ConfirmDialog
        open={promoting !== null}
        onClose={() => setPromoting(null)}
        loading={busy}
        tone="primary"
        title="Pay salaries from this account?"
        confirmLabel="Yes, pay from here"
        onConfirm={async () => {
          if (!promoting) return;
          const ok = await run(
            () => accounts.makePrimary(promoting.id),
            `Salaries now come from ${promoting.bankName}`,
          );
          if (ok) setPromoting(null);
        }}
        body={
          promoting ? (
            <span className="flex flex-col gap-2">
              <span>
                New payment batches will come out of {promoting.bankName}{" "}
                {promoting.accountNumberMasked}.
              </span>
              {primary && (
                <span>
                  {primary.bankName} {primary.accountNumberMasked} stops being the
                  salary account. Batches already built keep the account they were
                  built with.
                </span>
              )}
            </span>
          ) : null
        }
      />

      <ConfirmDialog
        open={archiving !== null}
        onClose={() => setArchiving(null)}
        loading={busy}
        tone="danger"
        title={`Archive ${archiving?.bankName ?? ""}?`}
        confirmLabel="Archive it"
        onConfirm={async () => {
          if (!archiving) return;
          const ok = await run(
            () => accounts.archive(archiving.id),
            `${archiving.bankName} archived`,
          );
          if (ok) setArchiving(null);
        }}
        body="Hidden, not deleted — past payment batches still point at it."
      />
    </>
  );
}
