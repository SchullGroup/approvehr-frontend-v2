"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  Button,
  Callout,
  Checkbox,
  Input,
  Modal,
  Select,
  Spinner,
} from "@/components/ui";
import type { BulkInviteResult } from "@/lib/api/invites";

export type InviteCandidate = {
  employeeId: string;
  name: string;
  jobTitle: string | null;
};

export type InviteRoleOption = { id: string; name: string };

/* A plain shape check, not the real gate — the API's own `.email()` answers
   that. This exists so a typo is caught before a request, not because the
   client is trusted to be right. */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Giving a batch of staff a login, so they can clock themselves in.
 *
 * ## Why this exists on the attendance screen and not the directory
 *
 * A login is not a record field — it is an account, created by
 * `invitesApi.bulkSend`, that puts a real email in a real inbox. The moment
 * that decision matters to most owners is exactly this one: "which of my
 * people need to clock in themselves, versus staff I only run payroll for."
 * The directory has no such moment, so it has no such button.
 *
 * ## One email per person, not one value for everybody
 *
 * `AssignPeopleDialog` — the department/team precedent this is modelled on —
 * applies one value to everybody selected, which is right for "put these nine
 * in Sales" and wrong here: an invitation needs *this* person's actual
 * address, and there is no default that could be correct twice. So selecting
 * somebody reveals their own input rather than adding them to a shared list.
 *
 * ## Every result is shown, nothing is guessed at in advance
 *
 * The candidate list is not pre-filtered against "already has an account" —
 * that would need a second request per person before this one even opens.
 * `bulkSend` already checks each row and reports failures by name with the
 * API's own reason, the same discipline `imports` uses for a duplicate row.
 * So a person already invited is not hidden; they are just the ones named in
 * `failed` after the attempt, which is more informative than silence.
 */
export function InviteStaffDialog({
  candidates,
  roles,
  defaultRoleId,
  busy,
  result,
  banner,
  onClose,
  onSend,
}: {
  candidates: InviteCandidate[] | null;
  roles: InviteRoleOption[];
  defaultRoleId: string | null;
  busy: boolean;
  result: BulkInviteResult | null;
  /** A whole-batch refusal — a duplicate address across two rows, a network
   *  failure — as against a per-person one, which `result.failed` carries. */
  banner?: string | null;
  onClose: () => void;
  onSend: (people: { employeeId: string; email: string }[], roleId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [emails, setEmails] = useState<Record<string, string>>({});
  /**
   * `null` means "the caller has not picked one" — never frozen at mount.
   *
   * `roles` and `defaultRoleId` both arrive from an async fetch the parent
   * starts *after* this dialog is already open, so a `useState` seeded from
   * them at mount time would seed from the empty list that exists before the
   * fetch resolves and never re-seed once the real roles arrive — the parent
   * re-renders this same mounted instance with new props, but an
   * initializer only runs once. Deriving the effective value fresh every
   * render is what lets it track `defaultRoleId` once it lands, right up
   * until the caller actually chooses something for themselves.
   */
  const [roleIdChoice, setRoleIdChoice] = useState<string | null>(null);
  const roleId = roleIdChoice ?? defaultRoleId ?? roles[0]?.id ?? "";

  const list = useMemo(() => candidates ?? [], [candidates]);
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return list;
    return list.filter(
      (person) =>
        person.name.toLowerCase().includes(term) ||
        (person.jobTitle ?? "").toLowerCase().includes(term),
    );
  }, [list, query]);

  function setEmail(employeeId: string, value: string) {
    setEmails((current) => ({ ...current, [employeeId]: value }));
  }

  function remove(employeeId: string) {
    setEmails((current) => {
      const next = { ...current };
      delete next[employeeId];
      return next;
    });
  }

  const entries = Object.entries(emails);
  const ready = entries.filter(([, email]) => LOOKS_LIKE_EMAIL.test(email.trim()));
  const invalid = entries.some(
    ([, email]) => email.trim().length > 0 && !LOOKS_LIKE_EMAIL.test(email.trim()),
  );

  function submit() {
    onSend(
      ready.map(([employeeId, email]) => ({ employeeId, email: email.trim() })),
      roleId,
    );
  }

  /* Once a result comes back, the dialog stops being a form and becomes a
     report — the same shape the import flow uses for a partial success. */
  if (result) {
    return (
      <Modal
        open
        onClose={onClose}
        title="Invitations sent"
        size="lg"
        footer={<Button onClick={onClose}>Done</Button>}
      >
        <div className="flex flex-col gap-4">
          {result.sent.length > 0 && (
            <Callout tone="success" title={`${result.sent.length} invited`}>
              {result.sent.map((s) => `${s.firstName} ${s.lastName}`).join(", ")}
              {". They can set a password from the link in their email and clock in as soon as they do."}
            </Callout>
          )}
          {result.failed.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-body-sm font-medium text-ink">
                {result.failed.length} could not be invited
              </p>
              <ul className="flex flex-col gap-1.5">
                {result.failed.map((f) => (
                  <li
                    key={f.employeeId}
                    className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-body-sm"
                  >
                    <span className="font-medium text-ink">{f.name}</span>
                    <span className="text-body">{" — " + f.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Set up staff logins"
      description="Staff with a login can clock themselves in and out. Most roles do not need one — pick the ones who do."
      size="lg"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-body-sm text-muted">
            {ready.length === 0
              ? "Nobody chosen yet"
              : `${ready.length} ${ready.length === 1 ? "person" : "people"} will be invited`}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="accent"
              loading={busy}
              disabled={ready.length === 0 || busy || !roleId}
              onClick={submit}
            >
              Send {ready.length > 0 ? ready.length : ""} invitation
              {ready.length === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {banner && (
          <p
            role="status"
            className="rounded-md border border-danger-line bg-danger-soft px-3.5 py-2.5 text-body-sm text-ink"
          >
            {banner}
          </p>
        )}

        {roles.length > 0 && (
          <div className="flex items-center gap-3">
            <label className="text-body-sm font-medium text-ink" htmlFor="invite-role">
              Sign in as
            </label>
            <Select
              id="invite-role"
              value={roleId}
              onChange={(e) => setRoleIdChoice(e.target.value)}
              className="max-w-xs"
            >
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </Select>
          </div>
        )}

        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          />
          <Input
            value={query}
            placeholder="Search by name or job title"
            className="pl-9"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        {candidates === null ? (
          <div className="flex items-center gap-2 py-6 text-body-sm text-muted">
            <Spinner size="sm" />
            Loading who does not have a login yet
          </div>
        ) : list.length === 0 ? (
          <p className="text-body-sm text-body">
            Everybody already has a login, or nobody is on file yet.
          </p>
        ) : visible.length === 0 ? (
          <p className="text-body-sm text-body">
            Nobody matches &ldquo;{query.trim()}&rdquo;.
          </p>
        ) : (
          <ul className="flex max-h-[22rem] flex-col divide-y divide-line overflow-y-auto rounded-md border border-line">
            {visible.map((person) => {
              const picked = person.employeeId in emails;
              const email = emails[person.employeeId] ?? "";
              const badFormat =
                email.trim().length > 0 && !LOOKS_LIKE_EMAIL.test(email.trim());
              return (
                <li
                  key={person.employeeId}
                  className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
                >
                  <Checkbox
                    label={person.name}
                    {...(person.jobTitle ? { description: person.jobTitle } : {})}
                    checked={picked}
                    disabled={busy}
                    onChange={() =>
                      picked ? remove(person.employeeId) : setEmail(person.employeeId, "")
                    }
                  />
                  {picked && (
                    <Input
                      type="email"
                      value={email}
                      autoFocus
                      placeholder="their.name@company.com"
                      disabled={busy}
                      aria-invalid={badFormat}
                      className="w-64"
                      onChange={(e) => setEmail(person.employeeId, e.target.value)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {invalid && (
          <p className="text-body-sm text-danger-text">
            One of those addresses is not complete yet.
          </p>
        )}

        <p className="text-body-sm text-muted">
          Can&rsquo;t find somebody?{" "}
          <a
            href={`/people/new?from=${encodeURIComponent("/people/attendance")}`}
            className="text-accent-text hover:underline underline-offset-4"
          >
            Add them to the company first
          </a>
          , then come back here.
        </p>
      </div>
    </Modal>
  );
}
