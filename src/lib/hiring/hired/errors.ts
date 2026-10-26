import { ApiError } from "@/lib/api/client";

/**
 * An employee who already has this person's email.
 *
 * The Hired list does not know this until somebody tries to make the record: the
 * answer comes back with the attempt. It is never merged. A person looks at who it is
 * and chooses to link the hire to them, or sorts it out first.
 */
export type ExistingEmployee = {
  employeeId: string;
  name: string;
  /** Their staff number, when the API gave it. */
  employeeNo: string | null;
  email: string | null;
  /** The record has been archived: linking to it is refused until it is restored. */
  archived: boolean;
};

/**
 * Making the record was refused because an employee with this email already exists.
 *
 * An `ApiError` in every way (the status, the code and the API's own sentence are
 * kept), carrying who it is so the screen can offer to link instead of just saying no.
 */
export class EmployeeExistsError extends ApiError {
  constructor(
    message: string,
    readonly existing: ExistingEmployee,
  ) {
    super(409, "conflict", message, {
      reason: "employee_exists",
      employeeId: existing.employeeId,
    });
    this.name = "EmployeeExistsError";
  }
}

/** The existing employee behind a refusal, when the refusal was about one. */
export function existingEmployeeOf(
  error: unknown,
  email: string | null,
): ExistingEmployee | null {
  if (error instanceof EmployeeExistsError) return error.existing;
  if (!(error instanceof ApiError)) return null;
  const details = error.details;
  if (!details || Array.isArray(details)) return null;
  if (details["reason"] !== "employee_exists") return null;
  const id = details["employeeId"];
  if (typeof id !== "string") return null;
  const name = details["employeeName"];
  const no = details["employeeNo"];
  return {
    employeeId: id,
    name: typeof name === "string" && name.trim() !== "" ? name : "An employee",
    employeeNo: typeof no === "string" ? no : null,
    email,
    archived: details["archived"] === true,
  };
}
