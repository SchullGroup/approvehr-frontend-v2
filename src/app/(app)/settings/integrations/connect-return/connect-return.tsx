"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardBody, Spinner, TextLink } from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import { workTrackersApi } from "@/lib/api/work-trackers";

/**
 * Where Trello sends the browser after consent.
 *
 * Trello does not redirect to the API with a code like the other four tools;
 * it appends a finished token to this page's address as a **fragment**
 * (`#token=…`), which a browser never sends to any server. So this page reads
 * it, wipes it from the address bar and history at once — a token left in
 * the URL is a token in somebody's screenshot — posts it with the signed
 * `state` from the query string, and follows the API's answer to the same
 * `/settings/integrations?workTracker=…` the other tools land on.
 */
export function ConnectReturn() {
  const [failed, setFailed] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const fragment = new URLSearchParams(
      window.location.hash.replace(/^#/, ""),
    );
    const state =
      new URLSearchParams(window.location.search).get("state") ?? "";
    const token = fragment.get("token") || undefined;
    const error = fragment.get("error") || undefined;
    window.history.replaceState(null, "", window.location.pathname);

    /* Opened without what Trello appends (UAT 23 Nov, CRAWL-4): asking the API
       with nothing to finish only earned "Some fields are not valid". */
    const incomplete = !state || (!token && !error);

    void (async () => {
      if (incomplete) {
        setFailed(
          "This link is incomplete, so there is nothing to finish. Start the connection again from Integrations.",
        );
        return;
      }
      try {
        const { redirect } = await workTrackersApi.completeToken({
          state,
          ...(token ? { token } : {}),
          ...(error ? { error } : {}),
        });
        window.location.replace(redirect);
      } catch (cause) {
        setFailed(
          cause instanceof ApiError
            ? cause.message
            : "Something went wrong finishing the connection.",
        );
      }
    })();
  }, []);

  return (
    <>
      <PageHeader
        title="Connecting"
        breadcrumb={[
          { href: "/settings", label: "Settings" },
          { href: "/settings/integrations", label: "Integrations" },
        ]}
      />
      <PageBody>
        <Card>
          <CardBody className="flex items-center gap-3 text-body-sm text-body">
            {failed ? (
              <p>
                {failed}{" "}
                <TextLink href="/settings/integrations">
                  Back to integrations
                </TextLink>
              </p>
            ) : (
              <>
                <Spinner size="sm" />
                Finishing the connection…
              </>
            )}
          </CardBody>
        </Card>
      </PageBody>
    </>
  );
}
