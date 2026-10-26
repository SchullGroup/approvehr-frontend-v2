"use client";

import { useMemo } from "react";
import type { Person } from "@/components/hiring/people-editor";
import { accountSeat, employeeSeat } from "@/lib/hiring/comms/seats";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import { useLoaded } from "@/lib/use-loaded";
import { useAccessGateway, useAccessVersion } from "./use-access";

/**
 * Everybody who could sit on a panel for one job.
 *
 * Staff, when the company has Core HR, **and** the people invited to this job who have
 * an account and no employee record. A company that has recruitment without Core HR has
 * no staff list at all, so for it the invited accounts are the whole of who could be
 * asked, and a picker that listed only employees would be empty and could not be used.
 *
 * Each person's `id` is a seat key (`seatKey`), so a staff member and an account can
 * never be mistaken for each other, and `splitSeats` turns a list of them back into what
 * a request sends. An account is offered only once they are **on the job's list**, which
 * is also the rule on the server: a panel is not a way onto a job.
 */
export function usePanelPeople(
  requisitionId: string,
  enabled = true,
): { people: Person[]; loading: boolean } {
  const directory = useEmployeeDirectory({ pageSize: 200 });
  const gateway = useAccessGateway();
  const version = useAccessVersion();
  const access = useLoaded(
    `panel-people:${gateway.mode}:${requisitionId}:${String(version)}`,
    enabled,
    (signal) => gateway.get(requisitionId, signal),
  );

  const people = useMemo<Person[]>(() => {
    const staff: Person[] = directory.people.map((person) => ({
      id: employeeSeat(person.id),
      name: person.fullName,
      jobTitle: person.jobTitle,
    }));
    const onDirectory = new Set(directory.people.map((person) => person.id));
    const accounts: Person[] = (access.data?.members ?? [])
      .filter(
        (member) =>
          member.userId !== null &&
          /* Somebody on the staff list is offered as staff, once. */
          !(member.employeeId !== null && onDirectory.has(member.employeeId)),
      )
      .map((member) => ({
        id: accountSeat(member.userId as string),
        name: member.name,
        jobTitle:
          member.status === "INVITED"
            ? "Invited, not signed in yet"
            : "Invited to this job",
      }));
    return [...staff, ...accounts];
  }, [directory.people, access.data]);

  return { people, loading: directory.loading || access.loading };
}
