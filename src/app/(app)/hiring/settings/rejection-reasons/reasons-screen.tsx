"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  Field,
  Input,
  Skeleton,
  Switch,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { sentenceOf } from "@/lib/hiring/pipeline/errors";
import {
  usePipelineGateway,
  useRejectionReasons,
} from "@/lib/hiring/pipeline/use-pipeline";
import { HiringSettingsShell } from "../settings-shell";

/**
 * The reasons a company turns people down for.
 *
 * Rejecting is always done with one of these, so a year of rejections can be read
 * as a pattern ("forty were over the band") instead of as free text nobody can
 * count. The wording a person was rejected with is kept on their record as it was:
 * renaming or switching off a reason later changes what is offered next, never
 * what was written down before.
 */

export function ReasonsScreen() {
  const gateway = usePipelineGateway();
  const reasons = useRejectionReasons();
  const toast = useToast();
  const [label, setLabel] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function run(what: () => Promise<unknown>, done?: string) {
    setBusy(true);
    setProblem(null);
    try {
      await what();
      reasons.reload();
      if (done) toast.push({ title: done, tone: "success" });
      return true;
    } catch (error) {
      setProblem(sentenceOf(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const switchedOn = reasons.items.filter((reason) => reason.active).length;

  return (
    <HiringSettingsShell
      active="/hiring/settings/rejection-reasons"
      title="Rejection reasons"
      description="One of these is chosen every time somebody is rejected. Switching one off stops it being offered; it stays on the people it was already given to."
    >
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (label.trim() === "") return;
          void run(
            () => gateway.reasons.create(label.trim()),
            `"${label.trim()}" added`,
          ).then((ok) => {
            if (ok) setLabel("");
          });
        }}
      >
        <Field label="New reason" className="min-w-64 flex-1">
          <Input
            value={label}
            maxLength={120}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Did not meet the must-haves"
          />
        </Field>
        <Button
          type="submit"
          variant="accent"
          loading={busy && label !== ""}
          disabled={label.trim() === ""}
        >
          Add reason
        </Button>
      </form>

      {problem && (
        <p role="alert" className="text-body-sm text-danger-text">
          {problem}
        </p>
      )}

      {reasons.loading ? (
        <>
          <Skeleton className="h-28 w-full" />
          <span className="sr-only-focusable">Loading the reasons</span>
        </>
      ) : reasons.error ? (
        <LoadFailure
          subject="the reasons"
          error={reasons.error}
          onRetry={reasons.reload}
        />
      ) : reasons.items.length === 0 ? (
        <Card>
          <EmptyState
            title="No reasons yet"
            description="Add the first one above. Until there is one, nobody can be rejected."
          />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {reasons.items.map((reason) => (
              <li
                key={reason.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
              >
                {renaming === reason.id ? (
                  <form
                    className="flex min-w-64 flex-1 flex-wrap items-center gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void run(
                        () =>
                          gateway.reasons.update(reason.id, {
                            label: draft.trim(),
                          }),
                        "Reason renamed",
                      ).then((ok) => {
                        if (ok) setRenaming(null);
                      });
                    }}
                  >
                    <Input
                      value={draft}
                      maxLength={120}
                      aria-label={`Rename ${reason.label}`}
                      className="min-w-48 flex-1"
                      onChange={(event) => setDraft(event.target.value)}
                    />
                    <Button
                      type="submit"
                      size="sm"
                      variant="secondary"
                      disabled={draft.trim() === "" || busy}
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setRenaming(null)}
                    >
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <>
                    <div className="min-w-48 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-body-sm text-ink">
                        {reason.label}
                        {!reason.active && (
                          <Badge tone="neutral" size="sm">
                            Switched off
                          </Badge>
                        )}
                      </p>
                      {reason.uses !== undefined && (
                        <p className="text-meta text-muted">
                          Given to {reason.uses}{" "}
                          {reason.uses === 1 ? "person" : "people"}
                        </p>
                      )}
                    </div>
                    <Switch
                      label="Offered"
                      className="shrink-0"
                      checked={reason.active}
                      disabled={busy || (reason.active && switchedOn <= 1)}
                      onChange={(event) =>
                        void run(() =>
                          gateway.reasons.update(reason.id, {
                            active: event.target.checked,
                          }),
                        )
                      }
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Rename ${reason.label}`}
                      onClick={() => {
                        setRenaming(reason.id);
                        setDraft(reason.label);
                      }}
                    >
                      <Pencil aria-hidden="true" className="size-3.5" />
                      Rename
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
          {switchedOn <= 1 && (
            <CardBody className="border-t border-line text-meta text-muted">
              One reason has to stay on, or nobody could be rejected.
            </CardBody>
          )}
        </Card>
      )}
    </HiringSettingsShell>
  );
}
