"use client";

import Link from "next/link";
import { Disclosure } from "@/components/ui";
import type { ApiComponentPeople } from "@/lib/api/pay-components";

/**
 * Who the HMO is with, and whose member ID is still missing.
 *
 * Only the HMO premium's people list carries `memberNumber` — the API leaves the
 * key off every other component's list — so its presence is how this knows it is
 * looking at the HMO. Absent and null are different: a list with no such key is
 * not claiming that nobody has an ID, so this renders nothing for it.
 *
 * ## Why it counts only people who are on it
 *
 * Somebody who is not on the HMO has no card to enter, so they are not "missing"
 * anything. The count is "of the people who have it".
 *
 * Both fields are optional everywhere, so none of this is a warning: a company
 * that never enters a member ID sees "0 of 29 on file" and nothing in red.
 */
export function HmoDetails({ data }: { data: ApiComponentPeople }) {
  const carriesIds = data.people.some((person) => "memberNumber" in person);
  if (!carriesIds) return null;

  const covered = data.people.filter((person) => person.on);
  const missing = covered.filter((person) => !person.memberNumber);
  const onFile = covered.length - missing.length;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-canvas p-4">
      <dl className="grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-meta text-muted">HMO provider</dt>
          <dd className="mt-0.5 text-body-sm font-medium text-ink">
            {data.provider ? (
              data.provider
            ) : (
              <span className="font-normal text-muted">Not on file</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-meta text-muted">Member IDs</dt>
          <dd className="mt-0.5 text-body-sm font-medium text-ink">
            {covered.length === 0
              ? "Nobody is on it yet"
              : `${onFile} of ${covered.length} on file`}
          </dd>
        </div>
      </dl>

      {missing.length > 0 && (
        <Disclosure
          dense
          level={4}
          title="Still without a member ID"
          meta={
            <span className="tabular text-meta text-muted">
              {missing.length}
            </span>
          }
          hint="Add it on their record, under Pay & statutory. Or import it from a spreadsheet."
        >
          <ul className="flex max-h-56 flex-col divide-y divide-line overflow-y-auto">
            {missing.map((person) => (
              <li
                key={person.employeeId}
                className="flex items-center justify-between gap-3 py-2"
              >
                <span className="text-body-sm text-ink">{person.name}</span>
                <Link
                  href={`/people/${person.employeeId}`}
                  className="text-body-sm text-accent-text underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
                >
                  Open record
                </Link>
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
    </div>
  );
}
