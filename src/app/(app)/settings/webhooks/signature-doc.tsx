"use client";

import { Card, CardBody, CardHeader } from "@/components/ui";
import { retryWindowLabel } from "@/lib/api/webhooks";
import type { CatalogueView } from "@/lib/store/webhooks";
import { CodeBlock, CopyButton, PayloadBlock } from "./code";

/**
 * How to verify a delivery, for the person writing the receiving end.
 *
 * ## Every word here comes from the API
 *
 * The construction, the four steps, the header names, the tolerance and the
 * worked example are all fields on `GET /webhooks/events`, which the API
 * computes from the same function that signs a real delivery. Nothing on this
 * page is retyped, so the documentation cannot drift from the code — which is
 * the usual way webhook documentation goes wrong.
 *
 * ## The worked example is the useful part
 *
 * A receiver whose own HMAC of `signedString` matches `signature` has correct
 * verification code and is simply hashing the wrong bytes — almost always a
 * re-serialised body rather than the raw one. That single comparison is the
 * fastest route out of "the signature is wrong", so it is a copyable block
 * rather than prose.
 *
 * In demo mode there is no API to compute it, and a hand-written digest would be
 * a wrong digest somebody could implement against. So it is absent and says so.
 */
export function SignatureDoc({ catalogue }: { catalogue: CatalogueView }) {
  const { signature, retries, envelope, money } = catalogue;

  return (
    <Card>
      <CardHeader
        title="Verifying a delivery"
        description="For whoever writes the receiving end."
        level={2}
      />
      <CardBody className="flex flex-col gap-6">
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-ink">
            Headers on every request
          </h3>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
            <Header name={signature.headers.signature}>
              {`${signature.version}=`} then the hex digest.
            </Header>
            <Header name={signature.headers.timestamp}>
              Whole seconds since the Unix epoch, as a decimal string.
            </Header>
            <Header name={signature.headers.event}>
              The event name, for example <code>leave.approved</code>.
            </Header>
            <Header name={signature.headers.delivery}>
              The delivery id. Reused on every retry, so treat it as the
              idempotency key.
            </Header>
          </dl>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-ink">
            The signature, in one line
          </h3>
          <CodeBlock>{signature.construction}</CodeBlock>
          <p className="text-[0.875rem] text-body">
            {signature.algorithm}. The key is your signing secret exactly as
            shown, <code className="font-mono text-[0.75rem]">whsec_</code>{" "}
            prefix included, as UTF-8 bytes.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-ink">In this order</h3>
          <ol className="flex flex-col gap-2">
            {signature.steps.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-sunken text-[0.75rem] font-semibold text-ink"
                >
                  {index + 1}
                </span>
                <span className="text-[0.875rem] leading-relaxed text-body">
                  {step}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-ink">A worked example</h3>
          {signature.example ? (
            <>
              <p className="text-[0.875rem] text-body">
                If your own digest of the signed string matches the signature
                below, your verification code is right and you are hashing the
                wrong bytes — almost always a re-serialised body instead of the
                raw one.
              </p>
              <Example label="Secret" value={signature.example.secret} />
              <Example label="Timestamp" value={signature.example.timestamp} />
              <Example
                label="Signed string"
                value={signature.example.signedString}
              />
              <Example label="Signature" value={signature.example.signature} />
            </>
          ) : (
            <p className="text-[0.875rem] text-body">
              The example signature is computed by the server on request. Connect
              the API to see one you can check your code against.
            </p>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-ink">
            The body you will receive
          </h3>
          <PayloadBlock value={envelope} copyLabel="Copy envelope" />
          <p className="text-[0.875rem] text-body">{money}</p>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-ink">
            If your server does not answer
          </h3>
          <ul className="flex flex-col gap-1.5 text-[0.875rem] leading-relaxed text-body">
            <li>
              {retries.attempts} attempts per event, spread over{" "}
              {retryWindowLabel(retries.backoffMinutes)}.
            </li>
            <li>
              Each attempt waits {Math.round(retries.timeoutMs / 1000)} seconds
              for a response, then counts as a failure.
            </li>
            <li>
              After {retries.switchedOffAfter} events fail every attempt, the
              endpoint is switched off and whoever manages settings gets a notice.
              Test sends never count.
            </li>
            <li>{retries.idempotency}</li>
            <li>
              Redirects are not followed. Point the endpoint at the final URL.
            </li>
          </ul>
        </section>
      </CardBody>
    </Card>
  );
}

function Header({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="font-mono text-[0.75rem] text-ink">{name}</dt>
      <dd className="text-[0.875rem] text-body sm:mt-0">{children}</dd>
    </>
  );
}

function Example({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.875rem] font-medium text-ink">{label}</p>
        <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} />
      </div>
      <CodeBlock className="whitespace-pre-wrap break-all">{value}</CodeBlock>
    </div>
  );
}
