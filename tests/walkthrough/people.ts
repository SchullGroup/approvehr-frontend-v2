import { randomBytes } from "node:crypto";

/**
 * The fictional people of the walkthrough, one per role.
 *
 * Shared by the journeys and by the stage servers, because the Atlassian
 * stand-in assigns tickets by **email** and the work-tracker matches a ticket's
 * assignee to a person by email: if the two files disagreed, the "my Jira
 * tickets" step would find nobody and the walkthrough would have to say so.
 *
 * Every address is on a reserved `.example` domain (RFC 2606), so nothing sent to
 * one can reach a real inbox even if the mail sink were bypassed. Passwords are
 * not here: they are made at run time and never written down.
 */
export type Person = { name: string; email: string; jobTitle: string };

export const PEOPLE = {
  owner: {
    name: "Folasade Ajayi",
    email: "folasade.ajayi@walkthrough.example",
    jobTitle: "Managing Director",
  },
  hrManager: {
    name: "Chiamaka Obi",
    email: "chiamaka.obi@walkthrough.example",
    jobTitle: "HR Manager",
  },
  hiringManager: {
    name: "Tunde Adebayo",
    email: "tunde.adebayo@walkthrough.example",
    jobTitle: "Head of Engineering",
  },
  interviewer: {
    name: "Ifeoma Nnamdi",
    email: "ifeoma.nnamdi@walkthrough.example",
    jobTitle: "Staff Engineer",
  },
  approver: {
    name: "Babajide Lawal",
    email: "babajide.lawal@walkthrough.example",
    jobTitle: "Finance Director",
  },
  projectLead: {
    name: "Ngozi Umeh",
    email: "ngozi.umeh@walkthrough.example",
    jobTitle: "Product Lead",
  },
  projectMember: {
    name: "Sani Garba",
    email: "sani.garba@walkthrough.example",
    jobTitle: "Software Engineer",
  },
  employee: {
    name: "Adaora Eze",
    email: "adaora.eze@walkthrough.example",
    jobTitle: "Operations Associate",
  },
  applicant: {
    name: "Kelechi Anozie",
    email: "kelechi.anozie@applicant.example",
    jobTitle: "Applicant",
  },
} as const satisfies Record<string, Person>;

export type RoleKey = keyof typeof PEOPLE;

/**
 * A throwaway password for a role, made when first asked for and the same for the
 * rest of the run, so the step that creates an account and the step that signs in
 * to it agree.
 *
 * Made from random bytes at run time. It is never written to the timeline, a
 * caption, a log or a file: the only place it exists is this process's memory and
 * the masked field it is typed into. It satisfies the product's strict password
 * rule (upper, lower, digit, symbol, long), because the Owner's account is held to
 * it and every other role is simply easier to treat alike.
 */
const issued = new Map<RoleKey, string>();

export function passwordFor(role: RoleKey): string {
  const existing = issued.get(role);
  if (existing !== undefined) return existing;
  const made = `Wk-${randomBytes(6).toString("hex")}-9Z!`;
  issued.set(role, made);
  return made;
}
