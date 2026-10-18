import type { InterviewReminders, ReminderSettings } from "./reminders";
import type {
  CancelInput,
  ChangeInput,
  ChangeResult,
  InterviewView,
  InviteExplainer,
  ScheduleInput,
} from "./model";

/**
 * What the interview screens ask of whatever is behind them.
 *
 * Connected, it is the API (`api-gateway.ts`). In a demo it is a book kept in this
 * browser (`demo-gateway.ts`). The record's interview card, the dialogs and the calendar
 * menu are written against this and nothing else, so one code path serves both: a
 * screen cannot quietly behave differently offline.
 *
 * Every method that can be refused **throws an `ApiError` whose message is the sentence
 * to show**. The API writes those; the demo writes the same ones.
 */

/** Who the interview is for, as the record knows them. */
export type InterviewTarget = {
  applicationId: string;
  candidateName: string;
  role: string | null;
  /** The stage they are in, for the interview's own card. */
  stageName: string | null;
  /**
   * The panel the stage already has, as `e:`/`u:` keys, used when nobody is picked
   * for this interview.
   */
  stageSeats: string[];
};

export type CalendarFile = {
  filename: string;
  blob: Blob;
  /** Set when the file is not the server's: a practice copy says so. */
  note: string | null;
};

export type InterviewsGateway = {
  mode: "api" | "demo";

  /** The time right now. A demo has a fixed clock; the API side uses the real one. */
  now(): string;

  /** Who is told what. `null` where the server sends nothing to a panel, so nothing is promised. */
  explainer(signal: AbortSignal): Promise<InviteExplainer | null>;

  /**
   * Whether a cancellation keeps the reason it was given. Where it does not, the dialog
   * does not ask for one: a reason that is typed and thrown away is a promise broken.
   */
  storesCancelReason: boolean;

  schedule(
    target: InterviewTarget,
    input: ScheduleInput,
  ): Promise<ChangeResult>;
  change(interview: InterviewView, input: ChangeInput): Promise<ChangeResult>;
  cancel(interview: InterviewView, input: CancelInput): Promise<ChangeResult>;
  /**
   * "Tell them now": the invitation for an interview that was booked without one, as it
   * now stands. Only ever called because somebody pressed a button that said so.
   */
  notify(interview: InterviewView): Promise<ChangeResult>;
  /** The company's reminder defaults. `null` when this server has none to show. */
  reminderSettings(signal: AbortSignal): Promise<ReminderSettings | null>;
  /** Saves them, and answers with what the server kept. Rejects with the API's sentence. */
  saveReminderSettings(settings: ReminderSettings): Promise<ReminderSettings>;
  /** Turns the reminders for one interview off or back on. */
  setRemindersOff(
    interview: InterviewView,
    off: boolean,
  ): Promise<InterviewReminders>;

  complete(interviewId: string): Promise<void>;
  noShow(interviewId: string): Promise<void>;

  /**
   * The calendar file for an interview. Connected it is the API's audited route; for a
   * practice copy it is made here and labelled so. `who` is whose copy it is: a
   * panelist's holds only what the API gives a panelist.
   */
  calendarFile(
    interview: InterviewView,
    who: "staff" | "panelist",
  ): Promise<CalendarFile>;
};
