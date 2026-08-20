"use client";

import { useState } from "react";
import { AlertTriangle, FileText, Plus, Search, Users } from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
  SegmentedControl,
  Spinner,
  Stat,
  useToast,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import type { ApiComplianceRow, ApiDocumentRequest } from "@/lib/api/documents";
import { useCan } from "@/lib/permissions";
import {
  complianceSentence,
  firstNameOf,
  useDocumentRegister,
  useExpiringDocuments,
} from "@/lib/store/documents";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import { AskForDocumentModal, RemindModal, WaiveModal } from "./dialogs";
import { RequestRow } from "./document-rows";
import { EmployeeFileDrawer } from "./employee-file";

/**
 * The HR side of documents: what is on file, and what is outstanding.
 *
 * ## Why the compliance list is at the top
 *
 * "Adaeze's work permit is due in 12 days" is the most valuable sentence on
 * this screen, and it is worth more than the register beneath it — an expired
 * permit is a problem that surfaces when somebody official asks, and the only
 * defence is a list a person looked at before then. So it leads, it is phrased
 * as a sentence rather than a table cell, and every row carries the button that
 * deals with it.
 *
 * The list also says, in one line from the API, what it does **not** yet cover:
 * a document's own renewal date is not recorded anywhere, so today this is what
 * has been asked for and not received. That line comes from the response, not
 * from here, so it cannot drift from what the query actually did.
 *
 * ## The chase button
 *
 * There is no remind endpoint. Creating a request notifies the person once;
 * asking again has no route, so nothing here claims to send one — Remind writes
 * the message and hands it over. See `chaseMessage` in
 * `lib/store/documents.ts` for the seam.
 */
export function DocumentsScreen() {
  const canEdit = useCan("EDIT_RECORDS");

  const [windowDays, setWindowDays] = useState<"7" | "30" | "90">("30");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"dueOn" | "name">("dueOn");
  const [limit, setLimit] = useState(25);

  const expiring = useExpiringDocuments(Number(windowDays));
  const register = useDocumentRegister({
    status: "OPEN",
    pageSize: limit,
    sort,
    ...(q.trim() ? { q: q.trim() } : {}),
  });
  const { employees } = useEmployeeDirectory({ pageSize: 200 });
  const toast = useToast();

  const [asking, setAsking] = useState<{
    employeeId?: string;
    name?: string;
  } | null>(null);
  const [reminding, setReminding] = useState<{
    employeeName: string;
    name: string;
    dueOn: string | null;
    daysLeft: number | null;
  } | null>(null);
  const [waiving, setWaiving] = useState<ApiDocumentRequest | null>(null);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [peopleQuery, setPeopleQuery] = useState("");

  /* The nav is filtered by permission, so this is close to unreachable — but a
     typed URL must not render an empty register that looks like "nothing
     outstanding". It points at the one documents screen everybody can open. */
  if (!canEdit) {
    return (
      <>
        <PageHeader title="Documents" />
        <PageBody>
          <EmptyState
            icon={<FileText aria-hidden="true" />}
            title="This is the HR register"
            description="Your own documents, and anything the company is asking you for, are on your documents page."
            action={<ButtonLink href="/documents">My documents</ButtonLink>}
          />
        </PageBody>
      </>
    );
  }

  const people = employees.map((employee) => ({
    id: employee.id,
    name: `${employee.firstName} ${employee.lastName}`,
  }));

  const matchedPeople = people
    .filter((person) =>
      peopleQuery.trim()
        ? person.name.toLowerCase().includes(peopleQuery.trim().toLowerCase())
        : true,
    )
    .slice(0, 8);

  const reloadAll = () => {
    void register.reload();
    void expiring.reload();
  };

  return (
    <>
      <PageHeader
        title="Documents"
        description="What you hold on file, and what you are still waiting for."
        meta={
          register.editable ? undefined : (
            <Badge tone="warning" size="sm">
              Demo · read-only
            </Badge>
          )
        }
        action={
          register.editable ? (
            <Button variant="accent" size="sm" onClick={() => setAsking({})}>
              <Plus aria-hidden="true" className="size-4" />
              Ask for a document
            </Button>
          ) : undefined
        }
      />

      <PageBody className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Late"
            value={String(expiring.counts.overdue)}
            {...(expiring.counts.overdue > 0
              ? { trend: { direction: "down" as const, label: "Past the date" } }
              : {})}
          />
          <Stat
            label={`Due in ${expiring.windowDays} days`}
            value={String(expiring.counts.dueSoon)}
          />
          <Stat
            label="People who owe you"
            value={String(register.peopleWaitingOn)}
            hint="with something outstanding"
          />
          <Stat label="Documents outstanding" value={String(register.total)} />
        </div>

        {/* The part worth the whole screen. */}
        <Card>
          <CardHeader
            title="Needs chasing"
            description={expiring.note ?? undefined}
            action={
              <SegmentedControl
                label="How far ahead to look"
                value={windowDays}
                onChange={setWindowDays}
                options={[
                  { value: "7", label: "7 days" },
                  { value: "30", label: "30 days" },
                  { value: "90", label: "90 days" },
                ]}
              />
            }
          />
          {expiring.error ? (
            <CardBody>
              <p role="alert" className="text-[0.875rem] text-danger-text">
                {expiring.error.message}
              </p>
            </CardBody>
          ) : expiring.loading ? (
            <CardBody>
              <span className="flex items-center gap-2 text-[0.875rem] text-muted">
                <Spinner size="sm" />
                Reading the list
              </span>
            </CardBody>
          ) : expiring.rows.length === 0 ? (
            <EmptyState
              compact
              icon={<AlertTriangle aria-hidden="true" />}
              title={`Nothing due in the next ${expiring.windowDays} days`}
              description="Anything late or close to its date shows here."
            />
          ) : (
            <CardBody className="flex flex-col gap-2">
              {expiring.rows.map((row) => (
                <ComplianceLine
                  key={`${row.kind}-${row.requestId ?? row.documentId ?? row.employeeId}`}
                  row={row}
                  editable={register.editable}
                  onRemind={() =>
                    setReminding({
                      employeeName: row.employeeName,
                      name: row.name,
                      dueOn: row.dueOn,
                      daysLeft: row.daysLeft,
                    })
                  }
                  onAskAgain={() =>
                    setAsking({ employeeId: row.employeeId, name: row.name })
                  }
                  onOpenFile={() => setOpenFile(row.employeeId)}
                />
              ))}
            </CardBody>
          )}
        </Card>

        {/* Everything outstanding, including the undated ones the list above
            cannot show. */}
        <Card>
          <CardHeader
            title="Waiting on people"
            description={
              register.peopleWaitingOn === 1
                ? "1 person owes you a document."
                : `${register.peopleWaitingOn} people owe you documents.`
            }
            action={
              <SegmentedControl
                label="Order"
                value={sort}
                onChange={setSort}
                options={[
                  { value: "dueOn", label: "By date" },
                  { value: "name", label: "By document" },
                ]}
              />
            }
          />
          <CardBody className="flex flex-col gap-3">
            <Field label="Search by document" hideLabel>
              <Input
                value={q}
                placeholder="Search by document — work permit, certificate"
                icon={<Search aria-hidden="true" />}
                onChange={(e) => {
                  const next = e.target.value;
                  setQ(next);
                }}
              />
            </Field>

            {register.error ? (
              <p role="alert" className="text-[0.875rem] text-danger-text">
                {register.error.message}
              </p>
            ) : register.loading && register.requests.length === 0 ? (
              <span className="flex items-center gap-2 text-[0.875rem] text-muted">
                <Spinner size="sm" />
                Loading
              </span>
            ) : register.requests.length === 0 ? (
              <EmptyState
                compact
                icon={<FileText aria-hidden="true" />}
                title="Nobody owes you anything"
                description="Ask somebody for a document and it appears here until it arrives."
              />
            ) : (
              <>
                {register.requests.map((request) => (
                  <RequestRow
                    key={request.id}
                    request={request}
                    showPerson
                    actions={
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            setReminding({
                              employeeName: request.employeeName,
                              name: request.name,
                              dueOn: request.dueOn,
                              daysLeft: request.daysLeft,
                            })
                          }
                        >
                          Remind
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setOpenFile(request.employeeId)}
                        >
                          Open file
                        </Button>
                        {register.editable && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setWaiving(request)}
                          >
                            Drop
                          </Button>
                        )}
                      </>
                    }
                  />
                ))}
                {register.total > register.requests.length && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="self-start"
                    onClick={() => setLimit((current) => current + 25)}
                  >
                    Show more ({register.total - register.requests.length} left)
                  </Button>
                )}
              </>
            )}

            {!register.editable && (
              <p className="text-[0.875rem] text-muted">
                Asking and dropping need the API — the person is notified when you
                ask, and a request kept in this browser reaches nobody.
              </p>
            )}
          </CardBody>
        </Card>

        {/* The other half of the question: what is actually on somebody's file. */}
        <Card>
          <CardHeader
            title="Open somebody’s file"
            description="Their contract, ID and certificates, with anything still missing beside them."
          />
          <CardBody className="flex flex-col gap-3">
            <Field label="Search people" hideLabel>
              <Input
                value={peopleQuery}
                placeholder="Search people"
                icon={<Search aria-hidden="true" />}
                onChange={(e) => {
                  const next = e.target.value;
                  setPeopleQuery(next);
                }}
              />
            </Field>

            {matchedPeople.length === 0 ? (
              <EmptyState
                compact
                icon={<Users aria-hidden="true" />}
                title="Nobody matches that"
              />
            ) : (
              <ul className="flex flex-col gap-1.5">
                {matchedPeople.map((person) => (
                  <li
                    key={person.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-line p-3"
                  >
                    <span className="min-w-0 truncate text-[0.9375rem] text-ink">
                      {person.name}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setOpenFile(person.id)}
                    >
                      Open file
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </PageBody>

      {asking && (
        <AskForDocumentModal
          people={people}
          initial={asking}
          onClose={() => setAsking(null)}
          onAsk={async (body) => {
            const created = await register.ask(body);
            setAsking(null);
            void expiring.reload();
            if (created.notifiedEmployee) {
              toast.push({
                title: `Asked ${firstNameOf(created.employeeName)}`,
                tone: "success",
                detail: "It is in their ApproveHR inbox.",
              });
            } else {
              /* Honest, and actionable: HR would otherwise wait on somebody who
                 was never told. */
              toast.push({
                title: `${firstNameOf(created.employeeName)} has no login yet`,
                tone: "warning",
                detail: "Nothing was sent. Use Remind to get the message to them.",
              });
            }
          }}
        />
      )}

      {reminding && (
        <RemindModal request={reminding} onClose={() => setReminding(null)} />
      )}

      {waiving && (
        <WaiveModal
          request={waiving}
          onClose={() => setWaiving(null)}
          onWaive={async (reason) => {
            await register.waive(waiving.id, reason);
            setWaiving(null);
            void expiring.reload();
            toast.push({ title: "Dropped", tone: "success" });
          }}
        />
      )}

      <EmployeeFileDrawer
        employeeId={openFile}
        onClose={() => setOpenFile(null)}
        onChanged={reloadAll}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * One compliance row, as a sentence.
 *
 * The two `kind`s get different buttons because they are different problems. A
 * document we asked for and did not get needs the person chased. A document
 * whose own date is running out needs a fresh one asked for — which is why
 * `kind: "DOCUMENT"` is handled here already, before the column exists.
 */
function ComplianceLine({
  row,
  editable,
  onRemind,
  onAskAgain,
  onOpenFile,
}: {
  row: ApiComplianceRow;
  editable: boolean;
  onRemind: () => void;
  onAskAgain: () => void;
  onOpenFile: () => void;
}) {
  return (
    <div
      className={
        row.overdue
          ? "flex flex-wrap items-center gap-3 rounded-md border border-danger-line bg-danger-soft/40 p-3"
          : "flex flex-wrap items-center gap-3 rounded-md border border-warning-line bg-warning-soft/40 p-3"
      }
    >
      <div className="min-w-0 flex-1">
        <p className="text-[0.9375rem] font-medium text-ink">
          {complianceSentence(row)}
        </p>
        <p className="mt-0.5 text-[0.875rem] text-muted">
          {row.employeeName} · {row.employeeNo}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-1.5">
        {row.kind === "DOCUMENT" ? (
          editable && (
            <Button variant="accent" size="sm" onClick={onAskAgain}>
              Ask for a new one
            </Button>
          )
        ) : (
          <Button variant="accent" size="sm" onClick={onRemind}>
            Remind
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onOpenFile}>
          Open file
        </Button>
      </div>
    </div>
  );
}
