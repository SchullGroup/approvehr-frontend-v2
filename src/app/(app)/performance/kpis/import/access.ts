"use client";

import { useCan, useIsManager } from "@/lib/permissions";
import { useHeadedDepartmentIds } from "@/lib/store/departments";
import { useSession } from "@/lib/store/session";

/**
 * Whether to offer the objectives upload to the signed-in person.
 *
 * Not `IMPORT_DATA`, which is what every other upload asks and which a
 * department head does not hold — the head is exactly who should be uploading
 * their team's quarter. The rule is the API's: anybody who leads somebody
 * (somebody reports to them, or they head a department), plus the records
 * permission and `IMPORT_DATA`. A plain employee raises their own objectives one
 * at a time, so the button is not offered to them.
 *
 * This only decides whether the door is shown. Which rows land is the API's
 * question, row by row, with the uploader's own authority — so a head who uploads
 * a row for somebody in another department sees that row refused with the reason.
 *
 * `useIsManager` and `useHeadedDepartmentIds` are both asked on every render and
 * combined afterwards, never short-circuited: a conditional hook call would move
 * the order of hooks the moment one of them answers.
 */
export function useCanUploadObjectives(): boolean {
  const { isConnected } = useSession();
  const isManager = useIsManager();
  const headed = useHeadedDepartmentIds();
  const records = useCan("EDIT_RECORDS");
  const importer = useCan("IMPORT_DATA");
  /* Offline there is no API to refuse and the flow ends in its own honest
     refusal, the same as every other upload. */
  return !isConnected || isManager || headed.size > 0 || records || importer;
}
