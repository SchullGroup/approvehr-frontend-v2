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
  Callout,
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
import { useStepUp } from "@/components/portal/step-up";
import { paymentsApi } from "@/lib/api/payments";
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
  /* The same hook the payroll wizard uses, and it was always general — the
     comment below used to say the challenge "is not implemented anywhere but
     the payroll wizard", which was true of the *screen* and never of
     `useStepUp`. Nothing had to be extracted; this screen simply had to call
     it. */
  const stepUp = useStepUp();
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
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
      return false;
    } finally {
      setBusy(false);
    }
  }

  /* `ApiError.code`, the API's own word for it — not a status match. A 403
     here is a step-up challenge or a permission refusal and they are different
     situations. */
  const stepUpBlocked =
    accounts.error instanceof ApiError &&
    accounts.error.code === "step_up_required";
  /** The read did not land, so nothing derived from it is a measurement. */
  const unread = Boolean(accounts.error);

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
        /*
         * No "Add an account" here any more.
         *
         * The feedback: *"Under Payroll Settings, the account number is
         * auto-generated by the system, so the manual 'Add' button for account
         * numbers should be removed to avoid confusion/duplicate entries."*
         * Opening a wallet now writes the `BankAccount` salaries are drawn on
         * — see `cd2590b` — so a prominent Add beside a list the system fills
         * in is an invitation to type a second copy of the account a company
         * already has.
         *
         * It is gone from the header, where it read as the thing to do on
         * arrival. The empty state keeps it, and only there: see the note on
         * that action for the company this is the only way in for.
         */
      />

      <PageBody className="flex flex-col gap-6">
        {/*
         * A step-up refusal is not a failure, and must not be dressed as one.
         *
         * `GET /payments/accounts` sits behind `requireStepUp(BANK_DETAILS)`,
         * so a company that ticks "Changing bank details" on
         * /settings/security gets a 403 here — and this screen rendered "The
         * accounts did not load" over it, then four zeros, then an empty
         * state asserting there are none, then an Add button that the same
         * gate refuses. Four wrong claims about a company that may have five
         * accounts on file.
         *
         * It now offers the challenge rather than only describing it.
         * `useStepUp` takes a thunk, catches the refusal, collects the code
         * and retries — so the button below asks for the accounts, and the
         * store's own reload picks them up once the grant exists. Turning the
         * requirement off is still offered, because somebody with no
         * two-factor set up has no way to receive a code and needs the other
         * door.
         */}
        {stepUpBlocked ? (
          <Callout tone="warning" title="This needs a confirmation code">
            Your company asks for a code before bank details can be read or
            changed. Entering one is not built into this screen yet, so the list
            below cannot be shown: nothing here says a company has no accounts,
            only that they cannot be read right now. Turn the requirement off
            under{" "}
            <Link
              href="/settings/security"
              className="text-accent-text underline underline-offset-4"
            >
              Security
            </Link>{" "}
            if nobody here can receive one.
            <div className="mt-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void (async () => {
                    try {
                      await stepUp.run(
                        () => paymentsApi.accounts(showArchived),
                        {
                          action: "BANK_DETAILS",
                        },
                      );
                      /* The grant is what the retry needed, not the payload:
                         the store owns this data and re-asks for it itself. */
                      accounts.reload();
                    } catch {
                      /* Cancelled, or the code was never verified. The callout
                         is still on screen saying what stands in the way, so
                         there is nothing further to report. */
                    }
                  })();
                }}
              >
                Enter a code and show the accounts
              </Button>
            </div>
          </Callout>
        ) : (
          accounts.error && (
            <LoadFailure
              subject="the accounts"
              error={accounts.error}
              onRetry={accounts.reload}
            />
          )
        )}

        {stepUp.dialog}

        <div className="grid gap-4 sm:grid-cols-3">
          {/* Never a measured zero over a read that did not happen. */}
          <Stat
            label="Accounts in use"
            value={unread ? "\u2014" : String(accounts.counts.active)}
            {...(unread ? { hint: "not read" } : {})}
          />
          <Stat
            label="Salaries come from"
            value={
              primary ? (
                <span className="text-body-sm font-medium text-ink">
                  {primary.bankName}
                </span>
              ) : (
                <span className="text-body-sm font-medium text-muted">
                  Not set
                </span>
              )
            }
            hint={primary?.accountNumberMasked}
          />
          <Stat
            label="Archived"
            value={unread ? "\u2014" : String(accounts.counts.archived)}
            {...(unread ? { hint: "not read" } : {})}
          />
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
              title={
                unread
                  ? "The accounts could not be read"
                  : "No bank accounts yet"
              }
              description={
                unread
                  ? "This is not a company with no accounts: it is a list that did not load. Nothing has been added or removed."
                  : "Opening a wallet creates the account salaries are drawn on. Until one is open you can add your own, and the first account here is the one payment batches use."
              }
              /*
               * Kept, deliberately, and this is the one place it survives.
               *
               * The header's Add is gone because the system fills this list in.
               * This one is the opposite case: there is nothing in the list,
               * and **today there is no other way to get anything into it** —
               * a `BankAccount` is written when a wallet is provisioned, and
               * provisioning needs Monnify or 9jaPay credentials that are not
               * set. So every company right now has no payout account, and
               * `createBatch` refuses without one: *"Add the bank account
               * salaries come from before building a payment batch."*
               *
               * Removing this as well would have left no company able to pay
               * anybody, to avoid a duplicate nobody can currently create. It
               * costs one button on a screen that is empty, and it disappears
               * the moment there is an account — which is when the doc's
               * complaint starts applying.
               */
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
                  <TR
                    key={account.id}
                    className={account.archived ? "opacity-60" : ""}
                  >
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
                        {!account.isPrimary &&
                          account.active &&
                          !account.archived && (
                            <span className="text-body-sm text-muted">
                              On file
                            </span>
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
                                    () =>
                                      accounts.update(account.id, {
                                        active: true,
                                      }),
                                    `${account.bankName} switched back on`,
                                  )
                                }
                              >
                                <RotateCcw
                                  aria-hidden="true"
                                  className="size-3.5"
                                />
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
                            {(!account.isPrimary ||
                              accounts.counts.active === 1) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setArchiving(account)}
                                aria-label={`Archive ${account.bankName} ${account.accountNumberMasked}`}
                              >
                                <Archive
                                  aria-hidden="true"
                                  className="size-3.5"
                                />
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
          and whoever can release money is told. Account numbers are never
          written into the trail.
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
                  {primary.bankName} {primary.accountNumberMasked} stops being
                  the salary account. Batches already built keep the account
                  they were built with.
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
        body="Hidden, not deleted: past payment batches still point at it."
      />
    </>
  );
}
