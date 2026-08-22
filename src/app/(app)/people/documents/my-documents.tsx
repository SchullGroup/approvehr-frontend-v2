"use client";

import { useState } from "react";
import { FileText, Plus, UserRound } from "lucide-react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Spinner,
  useToast,
} from "@/components/ui";
import type { ApiDocumentRequest } from "@/lib/api/documents";
import { useMyDocuments } from "@/lib/store/documents";
import { AddDocumentModal, AttachDocumentModal } from "./dialogs";
import { DocumentRow, RequestRow } from "./document-rows";

/**
 * My own documents, for `/profile` and for `/documents`.
 *
 * Exported from the documents directory rather than written again inside the
 * profile screen, so there is one component that knows what a personnel file
 * looks like to the person it is about. Same reasoning as `MyLoans`.
 *
 * ## What somebody wants to know about their own file
 *
 * "What are they asking me for" first, because that is the only part with
 * anything to do in it. "What do they hold about me" second — it is worth
 * seeing, and most people have never been shown it.
 *
 * `GET /documents/me/requests` never takes an employee id, so there is nothing
 * in this screen to tamper with, and reading your own file is deliberately not
 * audited: logging somebody opening their own passport scan answers no question
 * anybody asks. Both decisions are the API's; this is just the interface that
 * matches them.
 */
export function MyDocuments({
  className,
  /**
   * False on `/documents`, where the page header has already said the same
   * thing — a card titled "My documents" directly under an `h1` reading "My
   * documents" is the kind of duplication that makes a screen look unfinished.
   * The add button moves inside the body rather than disappearing with it.
   */
  heading = true,
}: {
  className?: string;
  heading?: boolean;
}) {
  const mine = useMyDocuments();
  const toast = useToast();

  const [attaching, setAttaching] = useState<ApiDocumentRequest | null>(null);
  const [adding, setAdding] = useState(false);

  const addButton =
    mine.editable && mine.linked ? (
      <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
        <Plus aria-hidden="true" className="size-4" />
        Add one
      </Button>
    ) : undefined;

  return (
    <>
      <Card className={className}>
        {heading && (
          <CardHeader
            title="My documents"
            description="What the company holds about you, and what it is asking you for."
            level={3}
            {...(addButton ? { action: addButton } : {})}
          />
        )}
        <CardBody className="flex flex-col gap-6">
          {!heading && addButton && (
            <div className="flex justify-end">{addButton}</div>
          )}
          {mine.loading ? (
            <div className="flex items-center gap-2 text-body-sm text-muted">
              <Spinner size="sm" />
              Loading
            </div>
          ) : !mine.linked ? (
            <EmptyState
              compact
              icon={<UserRound aria-hidden="true" />}
              title="Not linked to a staff record"
              description="This sign-in has no personnel file yet. Ask an administrator to link it."
            />
          ) : (
            <>
              {mine.error && (
                <p role="alert" className="text-body-sm text-danger-text">
                  {mine.error.message}
                </p>
              )}

              {/* The half with something to do in it, first. */}
              {mine.outstanding.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h4 className="text-body-sm font-semibold text-ink">
                    {mine.outstanding.length === 1
                      ? "1 document to send"
                      : `${mine.outstanding.length} documents to send`}
                  </h4>
                  {mine.outstanding.map((request) => (
                    <RequestRow
                      key={request.id}
                      request={request}
                      actions={
                        mine.editable ? (
                          <Button
                            variant="accent"
                            size="sm"
                            onClick={() => setAttaching(request)}
                          >
                            Attach it
                          </Button>
                        ) : undefined
                      }
                    />
                  ))}
                  {!mine.editable && (
                    <p className="text-body-sm text-muted">
                      Attaching needs the API — a reference kept in this browser
                      is on nobody&rsquo;s record.
                    </p>
                  )}
                </section>
              )}

              <section className="flex flex-col gap-2">
                <h4 className="text-body-sm font-semibold text-ink">On file</h4>
                {mine.documents.length === 0 ? (
                  <EmptyState
                    compact
                    icon={<FileText aria-hidden="true" />}
                    title="Nothing on file yet"
                    description="Your contract and ID will show here once they are added."
                  />
                ) : (
                  mine.documents.map((document) => (
                    <DocumentRow key={document.id} document={document} />
                  ))
                )}
              </section>

              {mine.settled.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h4 className="text-body-sm font-semibold text-ink">
                    Already answered
                  </h4>
                  {mine.settled.map((request) => (
                    <RequestRow key={request.id} request={request} />
                  ))}
                </section>
              )}
            </>
          )}
        </CardBody>
      </Card>

      {attaching && (
        <AttachDocumentModal
          request={attaching}
          onFile={mine.documents}
          subject="self"
          onClose={() => setAttaching(null)}
          onAttach={async (body) => {
            await mine.attach(attaching.id, body);
            setAttaching(null);
            toast.push({ title: "Sent", tone: "success" });
          }}
        />
      )}

      {adding && (
        <AddDocumentModal
          whose="your"
          onClose={() => setAdding(false)}
          onAdd={async (body) => {
            await mine.add(body);
            setAdding(false);
            toast.push({ title: "Added to your file", tone: "success" });
          }}
        />
      )}
    </>
  );
}
