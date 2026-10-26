"use client";

import { useState } from "react";
import {
  Button,
  Callout,
  Field,
  FieldRow,
  Input,
  Modal,
  Picker,
  RadioCard,
  SegmentedControl,
  Skeleton,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { AccessGateway } from "@/lib/hiring/access/gateway";
import type {
  AccessRole,
  InviteInput,
  InviteOptions,
  InviteResult,
  PickPerson,
} from "@/lib/hiring/access/model";
import { sentenceOf } from "@/lib/hiring/pipeline/errors";

/**
 * Inviting somebody to help hire for one job.
 *
 * ## It says exactly what they will get
 *
 * A collaborator's access is deliberately narrow: this job, and nothing else in the
 * product. What the chosen role can see is listed **in the API's own words**, line by
 * line, before anything is sent, and so is what the email says. The dialog does not
 * paraphrase either: the API is the only thing that knows, and a sentence written here
 * would drift from what really happens (it once claimed "interviews and scorecards,
 * and nothing else" over a role that can read every applicant's CV).
 *
 * ## Staff or somebody new
 *
 * A member of staff who can already sign in is given access at once. Somebody new is
 * sent an invitation by email and can see nothing until they accept it. Either way the
 * role is chosen for this job alone.
 *
 * ## Errors sit under the box they are about
 *
 * The API names the field (`email`, `firstName`, `employeeId`), and the sentence is
 * shown there as the API wrote it.
 */

type Mode = "EMAIL" | "STAFF";

export function InviteDialog({
  open,
  onClose,
  requisitionId,
  gateway,
  options,
  optionsLoading,
  optionsError,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  requisitionId: string;
  gateway: AccessGateway;
  options: InviteOptions | null;
  optionsLoading: boolean;
  optionsError: ApiError | null;
  /** Called with what the API did, once the dialog has done its work. */
  onDone: (result: InviteResult) => void;
}) {
  const [mode, setMode] = useState<Mode>("EMAIL");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [role, setRole] = useState<AccessRole | "">("");
  const [people, setPeople] = useState<PickPerson[] | null>(null);
  const [peopleFailed, setPeopleFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(false);

  /* Each time it opens it starts blank, so one invitation's details are never offered
     for the next. Derived while rendering, not in an effect. */
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setMode("EMAIL");
      setFirst("");
      setLast("");
      setEmail("");
      setEmployeeId("");
      setRole("");
      setProblems({});
      setFailure(null);
      setBusy(false);
      setPeople(null);
      setPeopleFailed(null);
    }
  }

  /** The staff list is read the first time somebody asks to choose from it. */
  function chooseMode(next: Mode) {
    setMode(next);
    setProblems({});
    setFailure(null);
    if (next === "STAFF" && people === null && peopleFailed === null) {
      void gateway
        .people("", new AbortController().signal)
        .then(setPeople)
        .catch((error: unknown) => setPeopleFailed(sentenceOf(error)));
    }
  }

  const roles = options?.roles ?? [];
  const chosen = roles.find((entry) => entry.role === role) ?? null;

  const ready =
    role !== "" &&
    (mode === "EMAIL"
      ? first.trim() !== "" && last.trim() !== "" && email.trim() !== ""
      : employeeId !== "");

  async function send() {
    if (role === "") return;
    const input: InviteInput =
      mode === "EMAIL"
        ? {
            kind: "EMAIL",
            firstName: first.trim(),
            lastName: last.trim(),
            email: email.trim(),
            role,
          }
        : { kind: "STAFF", employeeId, role };
    setBusy(true);
    setProblems({});
    setFailure(null);
    try {
      const result = await gateway.invites.invite(requisitionId, input);
      onDone(result);
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors.length > 0) {
        const found: Record<string, string> = {};
        for (const detail of error.fieldErrors)
          found[detail.field] ??= detail.message;
        setProblems(found);
        /* A field the dialog has no box for (an unknown role) still has to be said. */
        const known = ["firstName", "lastName", "email", "employeeId"];
        const loose = error.fieldErrors.find(
          (detail) => !known.includes(detail.field),
        );
        if (loose) setFailure(loose.message);
      } else {
        setFailure(sentenceOf(error));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Invite somebody to this job"
      description="They are given access to this job only. Choose what they are on it as, and the list below says what that lets them see."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!ready || options === null}
            onClick={() => void send()}
          >
            {mode === "EMAIL" ? "Send invitation" : "Give access"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {optionsLoading && (
          <>
            <Skeleton className="h-24 w-full" />
            <span className="sr-only-focusable">
              Loading what each role can see
            </span>
          </>
        )}
        {optionsError && !options && (
          <p role="alert" className="text-body-sm text-danger-text">
            {optionsError.message}
          </p>
        )}

        {options && (
          <>
            {options.staffAvailable && (
              <SegmentedControl
                label="Who to invite"
                options={[
                  { value: "EMAIL", label: "By email address" },
                  { value: "STAFF", label: "A member of staff" },
                ]}
                value={mode}
                onChange={chooseMode}
              />
            )}

            {mode === "EMAIL" ? (
              <div className="flex flex-col gap-4">
                <FieldRow phone="pair">
                  <Field
                    label="First name"
                    required
                    {...(problems["firstName"]
                      ? { error: problems["firstName"] }
                      : {})}
                  >
                    <Input
                      value={first}
                      autoComplete="off"
                      onChange={(event) => setFirst(event.target.value)}
                    />
                  </Field>
                  <Field
                    label="Last name"
                    required
                    {...(problems["lastName"]
                      ? { error: problems["lastName"] }
                      : {})}
                  >
                    <Input
                      value={last}
                      autoComplete="off"
                      onChange={(event) => setLast(event.target.value)}
                    />
                  </Field>
                </FieldRow>
                <Field
                  label="Email address"
                  required
                  help="Where the invitation goes."
                  {...(problems["email"] ? { error: problems["email"] } : {})}
                >
                  <Input
                    type="email"
                    value={email}
                    autoComplete="off"
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </Field>
              </div>
            ) : (
              <Field
                label="Member of staff"
                required
                {...(problems["employeeId"]
                  ? { error: problems["employeeId"] }
                  : peopleFailed
                    ? { error: peopleFailed }
                    : {})}
              >
                <Picker
                  value={employeeId}
                  onChange={setEmployeeId}
                  placeholder={
                    people === null && peopleFailed === null
                      ? "Loading staff…"
                      : "Choose somebody"
                  }
                  options={(people ?? []).map((person) => ({
                    value: person.id,
                    label: person.name,
                    ...(person.jobTitle ? { hint: person.jobTitle } : {}),
                  }))}
                />
              </Field>
            )}

            <div
              role="radiogroup"
              aria-label="What they are on this job as"
              className="grid gap-3 sm:grid-cols-2"
            >
              {roles.map((entry) => (
                <RadioCard
                  key={entry.role}
                  name="invite-role"
                  label={entry.label}
                  description={entry.description}
                  checked={role === entry.role}
                  onChange={() => setRole(entry.role)}
                />
              ))}
            </div>

            {chosen && (
              <div
                data-testid="what-they-see"
                className="rounded-md border border-line bg-canvas p-3.5"
              >
                <p className="text-body-sm font-semibold text-ink">
                  As {chosen.label.toLowerCase()}, they can see
                </p>
                <ul className="mt-2 list-disc pl-5 text-body-sm text-body">
                  {chosen.sees.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                {chosen.cannot && (
                  <p className="mt-2 text-body-sm text-muted">
                    {chosen.cannot}
                  </p>
                )}
              </div>
            )}

            {mode === "EMAIL" && options.email && (
              <div className="rounded-md border border-line p-3.5 text-body-sm">
                <p className="font-semibold text-ink">The email they get</p>
                <p className="mt-1.5 text-body">
                  <span className="text-muted">Subject: </span>
                  {options.email.subject}
                </p>
                <p className="mt-1 text-body">{options.email.summary}</p>
              </div>
            )}
            {mode === "STAFF" && options.staffNote && (
              <p className="text-body-sm text-muted">{options.staffNote}</p>
            )}
          </>
        )}

        {failure && (
          <Callout tone="danger" title="Not done">
            {failure}
          </Callout>
        )}
      </div>
    </Modal>
  );
}
