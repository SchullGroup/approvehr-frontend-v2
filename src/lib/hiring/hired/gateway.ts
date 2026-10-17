import type { ExportFile } from "@/lib/hiring/pipeline/gateway";
import type {
  BulkCreateRequest,
  BulkOutcome,
  CreateEmployeeResult,
  DidNotJoinResult,
  ExportOptions,
  ExportRequest,
  HiredFacets,
  HiredPage,
  HiredPerson,
  HiredQuery,
  HiredSettings,
  OnOfferAccepted,
} from "./model";

/**
 * What the Hired list asks of whatever is behind it.
 *
 * Connected, it is the API (`api-gateway.ts`). In a demo it is a book kept in this
 * browser (`demo-gateway.ts`). The list, its dialogs and the settings page are
 * written against this and nothing else, so there is one code path.
 *
 * Every method that can be refused **throws an `ApiError` whose message is the
 * sentence to show**. The API writes those; the demo writes the same ones.
 */
export type HiredGateway = {
  mode: "api" | "demo";

  /** What fills the job, department and source menus. */
  facets(signal: AbortSignal): Promise<HiredFacets>;

  list(query: HiredQuery, signal: AbortSignal): Promise<HiredPage>;

  /**
   * Makes the employee record. Refuses, in words, when the company has no Core HR,
   * the person already is one, or the job has all its people: a refusal is never
   * silently turned into something else.
   */
  createEmployee(person: HiredPerson): Promise<CreateEmployeeResult>;

  /**
   * Points a hire at an employee who already exists. Never a merge: nothing about
   * either record is changed.
   */
  linkEmployee(person: HiredPerson, employeeId: string): Promise<void>;

  /** Says they did not join. The reason is required. */
  didNotJoin(person: HiredPerson, reason: string): Promise<DidNotJoinResult>;

  /**
   * Employee records for many people. Resolves when every one has been settled, so
   * the outcome accounts for everybody asked: done, skipped (nothing to do) or
   * refused, each refusal with the API's sentence.
   *
   * "Everyone matching" is checked against `target.expected`: if the count is no
   * longer true the action does not run, and it throws.
   */
  bulkCreateEmployees(request: BulkCreateRequest): Promise<BulkOutcome>;

  /** What an export may carry for the person asking. */
  exportOptions(signal: AbortSignal): Promise<ExportOptions>;

  /** The file. Logged by the server: who, when and how many, never the contents. */
  exportFile(request: ExportRequest): Promise<ExportFile>;

  settings: {
    get(signal: AbortSignal): Promise<HiredSettings>;
    set(value: OnOfferAccepted): Promise<HiredSettings>;
  };
};
