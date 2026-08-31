"use client";

import { useState } from "react";
import { Link2, UserPlus } from "lucide-react";
import {
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Modal,
  Picker,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { koboFromDecimal } from "@/lib/api/payroll";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import {
  useUnlinkedAccounts,
  type UnlinkedAccountsState,
} from "@/lib/store/invites";
import { fullName } from "@/lib/types";

/**
 * The panel this hub was missing: accounts that can sign in and belong to
 * nobody as far as the Employee List is concerned.
 *
 * `bulkSendByEmail` deliberately creates these — a `User` with `employeeId:
 * null` is real and correct for somebody who is not staff — but nothing ever
 * prompted HR to say which of the rest genuinely *are*, so they just looked
 * like missing people. This is the guided version of the one-off tool on an
 * employee's own record page (`link-existing-account.tsx`): that one starts
 * from the Employee and picks a `User`; this starts from the `User` and picks
 * or creates the Employee.
 *
 * Rendered only when the caller holds `MANAGE_ROLES` and the list is
 * non-empty — see `roles-screen.tsx`. `canManage` gates the fetch itself,
 * not just the render, the same reasoning `useRepairs` documents: skip the
 * request rather than collect a predictable 403 from a page nobody without
 * the permission should have reached this far into. An empty card saying
 * "nothing to link" would be one more thing on a settings page that never
 * needed to be there.
 */
export function UnlinkedAccountsPanel({ canManage }: { canManage: boolean }) {
  const state = useUnlinkedAccounts(canManage);
  const [target, setTarget] = useState<{
    userId: string;
    name: string;
    email: string;
    mode: "link" | "create";
  } | null>(null);

  if (
    !canManage ||
    !state.connected ||
    state.loading ||
    state.accounts.length === 0
  ) {
    return null;
  }

  return (
    <Card>
      <CardHeader
        title="Accounts with no personnel record"
        level={3}
        description={
          state.accounts.length === 1
            ? "One account can sign in, and nobody knows whose it is until you say."
            : `${state.accounts.length} accounts can sign in, and nobody knows whose these are until you say.`
        }
      />
      <CardBody className="flex flex-col divide-y divide-line">
        {state.accounts.map((account) => (
          <div
            key={account.userId}
            className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
          >
            <div className="min-w-0">
              <p className="truncate text-body-sm font-medium text-ink">
                {account.name}
              </p>
              <p className="truncate text-meta text-muted">{account.email}</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setTarget({
                    userId: account.userId,
                    name: account.name,
                    email: account.email,
                    mode: "link",
                  })
                }
              >
                <Link2 aria-hidden="true" className="size-3.5" />
                Link to an existing record
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setTarget({
                    userId: account.userId,
                    name: account.name,
                    email: account.email,
                    mode: "create",
                  })
                }
              >
                <UserPlus aria-hidden="true" className="size-3.5" />
                Create a new record
              </Button>
            </div>
          </div>
        ))}
      </CardBody>

      {target?.mode === "link" && (
        <LinkToExisting
          account={target}
          state={state}
          onClose={() => setTarget(null)}
        />
      )}
      {target?.mode === "create" && (
        <CreateRecord
          account={target}
          state={state}
          onClose={() => setTarget(null)}
        />
      )}
    </Card>
  );
}

/** The picker side — same directory-wide picker `send-invite.tsx` uses. */
function LinkToExisting({
  account,
  state,
  onClose,
}: {
  account: { userId: string; name: string; email: string };
  state: UnlinkedAccountsState;
  onClose: () => void;
}) {
  const toast = useToast();
  const directory = useEmployeeDirectory({ pageSize: 200 });
  const [employeeId, setEmployeeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!employeeId) return;
    setBusy(true);
    setError(null);
    try {
      const linked = await state.link(account.userId, employeeId);
      toast.push({
        title: `${linked.name}'s sign-in is now ${linked.employeeName}`,
        tone: "success",
      });
      onClose();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "That did not link. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Link ${account.name} to a record`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={busy}
            disabled={!employeeId}
            onClick={() => void submit()}
          >
            Link it
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Callout tone="danger">{error}</Callout>}
        <Field
          label="Personnel record"
          required
          help={`${account.name} (${account.email}) will see this record's documents, leave and payslips as their own.`}
        >
          <Picker
            value={employeeId}
            onChange={setEmployeeId}
            placeholder={directory.loading ? "Loading…" : "Choose somebody"}
            loading={directory.loading}
            options={directory.employees.map((e) => ({
              value: e.id,
              label: fullName(e),
              hint: e.jobTitle,
            }))}
          />
        </Field>
      </div>
    </Modal>
  );
}

/** The create side — the minimal fields the single-employee form itself
 *  refuses to save without. Nothing here asks for pension, tax or bank
 *  details: those stay behind their own feature flags on the record once it
 *  exists, exactly as they would for anybody added through `/people/new`. */
function CreateRecord({
  account,
  state,
  onClose,
}: {
  account: { userId: string; name: string; email: string };
  state: UnlinkedAccountsState;
  onClose: () => void;
}) {
  const toast = useToast();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [grossMonthly, setGrossMonthly] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    firstName.trim() !== "" &&
    lastName.trim() !== "" &&
    jobTitle.trim() !== "" &&
    startDate !== "";

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const linked = await state.createEmployee(account.userId, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        jobTitle: jobTitle.trim(),
        startDate,
        ...(grossMonthly.trim()
          ? { grossMonthlyKobo: koboFromDecimal(grossMonthly.trim()) }
          : {}),
      });
      toast.push({
        title: `${linked.employeeName} created and linked to ${account.email}`,
        tone: "success",
      });
      onClose();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "That did not save. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Create a record for ${account.email}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={busy}
            disabled={!canSubmit}
            onClick={() => void submit()}
          >
            Create and link
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Callout tone="danger">{error}</Callout>}
        <p className="text-body-sm leading-relaxed text-muted">
          The work email stays {account.email} — that is what this account signs
          in with, and this form does not change it.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" required>
            <Input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </Field>
          <Field label="Last name" required>
            <Input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Job title" required>
          <Input
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date" required>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </Field>
          <Field
            label="Monthly gross"
            optional
            help="Can be agreed later if it is not settled yet."
          >
            <Input
              type="number"
              min={0}
              value={grossMonthly}
              onChange={(e) => setGrossMonthly(e.target.value)}
              placeholder="₦"
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
