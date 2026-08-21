"use client";

import { useState } from "react";
import { CheckCircle2, Send, XCircle } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Select,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { ApiTestResult } from "@/lib/api/webhooks";
import type { CatalogueView } from "@/lib/store/webhooks";
import { useWebhookActions } from "@/lib/store/webhooks";
import { CodeBlock, CopyButton, PayloadBlock } from "../code";

/**
 * Send one sample and show everything.
 *
 * ## Why this is the top of the page
 *
 * The whole difficulty of webhooks is not knowing why the other end is silent.
 * A test that reports "sent" and nothing else leaves you exactly where you
 * started, so this shows the status code, the time it took, their response body,
 * the exact bytes we sent, and the string the signature was computed over.
 *
 * The signed string is the one nobody else prints and the one that ends most
 * arguments: if the receiver's own HMAC of that string matches our header, their
 * verification code is correct and they are hashing a re-serialised body.
 *
 * ## It works on a switched-off endpoint
 *
 * Deliberately, on the API side. A webhook that switched itself off is exactly
 * when somebody needs to know whether their fix worked, and a test send never
 * counts towards the failures that switch one off — so pressing this cannot
 * break the integration.
 */
export function TestPanel({
  webhookId,
  catalogue,
  events,
  editable,
  onSent,
}: {
  webhookId: string;
  catalogue: CatalogueView | null;
  /** What this endpoint actually subscribes to, so the picker can group. */
  events: string[];
  editable: boolean;
  /** The test writes a delivery row, so the log below has to reload. */
  onSent: () => void;
}) {
  const { sendTest } = useWebhookActions();
  const [event, setEvent] = useState("webhook.test");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<ApiTestResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const send = async () => {
    setSending(true);
    setFailure(null);
    try {
      const outcome = await sendTest(webhookId, event);
      setResult(outcome);
      onSent();
    } catch (error) {
      setResult(null);
      setFailure(
        error instanceof ApiError
          ? error.message
          : "Something went wrong before we could send anything.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Send a test"
        description="One signed sample, and everything that came back."
        level={2}
      />
      <CardBody className="flex flex-col gap-5">
        {editable ? (
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Which sample" className="min-w-[16rem] flex-1">
              <Select value={event} onChange={(e) => setEvent(e.target.value)}>
                {catalogue ? (
                  <>
                    <Group
                      label="This endpoint listens for these"
                      names={catalogue.events
                        .map((option) => option.name)
                        .filter((name) => events.includes(name))}
                    />
                    <Group
                      label="Other samples — sent once, changes nothing"
                      names={catalogue.events
                        .map((option) => option.name)
                        .filter((name) => !events.includes(name))}
                    />
                  </>
                ) : (
                  <option value="webhook.test">webhook.test</option>
                )}
              </Select>
            </Field>
            <Button
              variant="accent"
              loading={sending}
              onClick={() => void send()}
            >
              <Send aria-hidden="true" className="size-4" />
              Send test event
            </Button>
          </div>
        ) : (
          <p className="text-[0.875rem] text-body">
            Sending needs the API — nothing in this browser can post to your
            server.
          </p>
        )}

        {failure && (
          <p className="flex items-start gap-2 text-[0.875rem] text-danger-text">
            <XCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{failure}</span>
          </p>
        )}

        {result && <TestResult result={result} />}
      </CardBody>
    </Card>
  );
}

/**
 * One `optgroup`, or nothing.
 *
 * An empty `optgroup` renders as a stray heading in every browser, so a group
 * with no members does not render at all — which happens the moment somebody
 * subscribes to every event in the catalogue.
 */
function Group({ label, names }: { label: string; names: string[] }) {
  if (names.length === 0) return null;
  return (
    <optgroup label={label}>
      {names.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </optgroup>
  );
}

/* ------------------------------------------------------------------ result */

function TestResult({ result }: { result: ApiTestResult }) {
  return (
    <div className="flex flex-col gap-5 border-t border-line pt-5">
      <div className="flex flex-wrap items-center gap-3">
        {result.ok ? (
          <Badge tone="success" icon={<CheckCircle2 aria-hidden="true" />}>
            Delivered
          </Badge>
        ) : (
          <Badge tone="danger" icon={<XCircle aria-hidden="true" />}>
            Not delivered
          </Badge>
        )}
        <span className="text-sm text-ink">
          {result.statusCode === null
            ? "No response"
            : `HTTP ${result.statusCode}`}{" "}
          <span className="text-muted">in {timing(result.durationMs)}</span>
        </span>
      </div>

      {result.error && (
        <p className="rounded-md border border-danger-line bg-danger-soft p-3 text-[0.875rem] text-danger-text">
          {result.error}
          {result.error.startsWith("No answer within") &&
            ` We wait ${Math.round(result.timeoutMs / 1000)} seconds and no longer.`}
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-ink">What came back</h3>
        {result.responseBody ? (
          <CodeBlock className="whitespace-pre-wrap break-all">
            {result.responseBody}
          </CodeBlock>
        ) : (
          <p className="text-[0.875rem] text-body">
            {result.statusCode === null
              ? "Nothing — the request never reached a server."
              : "An empty body, which is the right answer for a webhook receiver."}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-ink">What we sent</h3>
        <div className="flex flex-col gap-1">
          <p className="font-mono text-[0.75rem] break-all text-ink">
            {result.sent.method} {result.sent.url}
          </p>
          <CodeBlock>
            {Object.entries(result.sent.headers)
              .map(([name, value]) => `${name}: ${value}`)
              .join("\n")}
          </CodeBlock>
        </div>

        <PayloadBlock
          title="Body, exactly as sent"
          value={safeParse(result.sent.body)}
          copyLabel="Copy body"
        />

        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[0.875rem] font-medium text-ink">
              The string the signature covers
            </p>
            <CopyButton value={result.sent.signedString} label="Copy string" />
          </div>
          <CodeBlock className="whitespace-pre-wrap break-all">
            {result.sent.signedString}
          </CodeBlock>
          <p className="text-[0.875rem] text-body">
            HMAC this with your secret. If it matches the signature header, your
            code is right and you are hashing the wrong bytes.
          </p>
        </div>
      </section>
    </div>
  );
}

/** `412 ms`, then `1.2 s`. Ten seconds is the ceiling, so two digits is plenty. */
function timing(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/**
 * The body is a JSON string on the wire, and `PayloadBlock` wants the value.
 *
 * Parsing it back is safe here — it is our own serialisation — and it is what
 * lets the money fields underneath be found and converted. If it ever is not
 * JSON, the raw string is shown rather than nothing.
 */
function safeParse(body: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}
