"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Spinner,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { dayLabel, useMyPolicies } from "@/lib/store/conduct";
import { PolicyDrawer } from "./policy-drawer";

/**
 * What I have to accept, with Accept beside each.
 *
 * Exported from the handbook directory rather than written again inside
 * `/profile`, so there is one component that knows what a policy looks like to
 * the person being asked to accept it. The profile composes it; it does not
 * reimplement it.
 *
 * ## This is the highest-traffic thing in the module
 *
 * Everybody in the company lands here after a publish, most of them once, on a
 * phone. So it is a list and a button and nothing else: no explanation of what
 * acceptance means, no progress ring, no tabs. The outstanding items come first
 * and the accepted ones collapse to a line, because the second group is a
 * receipt and the first is a job.
 *
 * ## Re-asking says which version they did accept
 *
 * A section republished with new wording comes back onto this list carrying
 * `previouslyAcceptedVersion`. Without it the row reads as though the person
 * never bothered — with it, it reads as the truth: they accepted version 1 and
 * the words have changed.
 *
 * ## What a click is worth
 *
 * A click plus an IP address is not a signature, and this component does not
 * imply otherwise. If a customer ever needs a real one, `acknowledgePolicy` on
 * the API is the single adapter point and nothing here changes.
 */
export function MyPolicies({ className }: { className?: string }) {
  const mine = useMyPolicies();
  const toast = useToast();
  const [opening, setOpening] = useState<{ id: string; title: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const accept = async (id: string, title: string) => {
    setBusy(id);
    try {
      await mine.accept(id);
      toast.push({ title: `${title} accepted`, tone: "success" });
      setOpening(null);
    } catch (error) {
      toast.push({
        title: "That did not save",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setBusy(null);
    }
  };

  const nothingAtAll =
    mine.counts.outstanding === 0 &&
    mine.counts.accepted === 0 &&
    mine.counts.reference === 0;

  /* No handbook is not a to-do. A card saying "nothing to accept" on a profile
     page is one more thing to read past. */
  if (!mine.loading && nothingAtAll) return null;

  return (
    <>
      <Card className={className}>
        <CardHeader
          title="Company handbook"
          level={3}
          description={
            mine.counts.outstanding > 0
              ? `${mine.counts.outstanding} ${
                  mine.counts.outstanding === 1 ? "section needs" : "sections need"
                } your acceptance.`
              : "Nothing waiting on you."
          }
          action={
            mine.counts.outstanding === 0 && mine.counts.accepted > 0 ? (
              <Badge tone="success" size="sm" icon={<Check aria-hidden="true" />}>
                Up to date
              </Badge>
            ) : undefined
          }
        />

        <CardBody className="flex flex-col gap-4">
          {mine.loading ? (
            <div className="flex items-center gap-2 text-body-sm text-muted">
              <Spinner size="sm" />
              Loading
            </div>
          ) : mine.error ? (
            <p className="text-body-sm text-body">{mine.error.message}</p>
          ) : (
            <>
              {mine.outstanding.map((policy) => (
                <div
                  key={policy.id}
                  className="flex flex-wrap items-center gap-3 rounded-md border border-warning-line bg-warning-soft p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-body-sm font-medium text-ink">
                      {policy.title}
                    </p>
                    <p className="mt-0.5 text-body-sm text-body">
                      {policy.previouslyAcceptedVersion !== null ? (
                        <>
                          You accepted version {policy.previouslyAcceptedVersion}.
                          The wording has changed.
                        </>
                      ) : (
                        <>
                          Version {policy.version}
                          {policy.publishedAt && (
                            <> · {dayLabel(policy.publishedAt.slice(0, 10))}</>
                          )}
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex w-full gap-2 sm:w-auto sm:shrink-0">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setOpening({ id: policy.id, title: policy.title })
                      }
                    >
                      Read it
                    </Button>
                    <Button
                      variant="approve"
                      size="sm"
                      disabled={busy === policy.id}
                      onClick={() => void accept(policy.id, policy.title)}
                    >
                      {busy === policy.id ? "Saving…" : "Accept"}
                    </Button>
                  </div>
                </div>
              ))}

              {mine.reference.length > 0 && (
                <ul className="flex flex-col gap-1.5">
                  {mine.reference.map((policy) => (
                    <li
                      key={policy.id}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <span className="text-body-sm text-body">
                        {policy.title}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setOpening({ id: policy.id, title: policy.title })
                        }
                      >
                        Read it
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              {mine.accepted.length > 0 && (
                <details className="group">
                  <summary className="cursor-pointer list-none text-body-sm text-muted hover:text-ink">
                    {mine.accepted.length} accepted{" "}
                    <span className="text-faint group-open:hidden">· show</span>
                    <span className="hidden text-faint group-open:inline">
                      · hide
                    </span>
                  </summary>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {mine.accepted.map((policy) => (
                      <li
                        key={policy.id}
                        className="flex flex-wrap items-center justify-between gap-2"
                      >
                        <span className="text-body-sm text-body">
                          {policy.title}{" "}
                          <span className="text-muted">v{policy.version}</span>
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="text-meta text-muted">
                            accepted {dayLabel(policy.acceptedAt.slice(0, 10))}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setOpening({ id: policy.id, title: policy.title })
                            }
                          >
                            Read it
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {!mine.onTheRecord && (
                <p className="text-meta text-muted">
                  Demo: an acceptance here stays in this browser.
                </p>
              )}
            </>
          )}
        </CardBody>
      </Card>

      {opening && (
        <PolicyDrawer
          key={opening.id}
          policyId={opening.id}
          title={opening.title}
          onClose={() => setOpening(null)}
          footer={
            mine.outstanding.some((p) => p.id === opening.id) ? (
              <div className="flex w-full justify-end">
                <Button
                  variant="approve"
                  disabled={busy === opening.id}
                  onClick={() => void accept(opening.id, opening.title)}
                >
                  {busy === opening.id ? "Saving…" : "Accept"}
                </Button>
              </div>
            ) : undefined
          }
        />
      )}
    </>
  );
}
