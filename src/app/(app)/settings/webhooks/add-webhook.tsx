"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, KeyRound } from "lucide-react";
import {
  Button,
  ButtonLink,
  Callout,
  Checkbox,
  Field,
  FieldSet,
  Input,
  Modal,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { ApiEventDefinition, ApiWebhookDetail } from "@/lib/api/webhooks";
import type { CatalogueView } from "@/lib/store/webhooks";
import { useWebhookActions } from "@/lib/store/webhooks";
import { CodeBlock, CopyButton, PayloadBlock } from "./code";

/**
 * Adding an endpoint: a URL, and which events.
 *
 * ## Two groups, because one of them will be quiet
 *
 * The catalogue says whether anything in the product actually raises each event.
 * Most do not yet. Listing all twelve as equals would have somebody build a
 * receiver for `leave.approved`, test it with the Test button, and then wait
 * forever — so the events nothing raises sit under their own heading that says
 * so. They are still choosable, because subscribing early is reasonable and the
 * API allows it.
 *
 * ## The sample payload is one click away, per event
 *
 * Not a link to documentation. The sample is the real shape — same keys, same
 * types, money in integer kobo — so a receiver written against it will parse the
 * real thing.
 *
 * ## The secret, after
 *
 * Shown in full with a copy button, and the line beside it is the truth rather
 * than the usual "this will never be shown again": the API returns the secret
 * whenever this webhook is fetched, because it stores it in plain text in order
 * to sign with it. Claiming otherwise would be theatre a customer discovers is
 * false the moment they reopen the page — and it would push somebody who
 * mislaid a copy into rotating a secret, which breaks a working integration for
 * no reason.
 */
export function AddWebhookModal({
  open,
  onClose,
  catalogue,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  catalogue: CatalogueView | null;
  /** Called after a successful create, so the list can reload behind the modal. */
  onCreated: () => void;
}) {
  const { create } = useWebhookActions();

  const [url, setUrl] = useState("");
  const [chosen, setChosen] = useState<string[]>(["webhook.test"]);
  const [saving, setSaving] = useState(false);
  const [urlError, setUrlError] = useState<string | undefined>(undefined);
  const [eventsError, setEventsError] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<ApiWebhookDetail | null>(null);

  const reset = () => {
    setUrl("");
    setChosen(["webhook.test"]);
    setUrlError(undefined);
    setEventsError(undefined);
    setFormError(null);
    setCreated(null);
    setSaving(false);
  };

  const close = () => {
    onClose();
    reset();
  };

  const toggle = (name: string) =>
    setChosen((current) =>
      current.includes(name)
        ? current.filter((item) => item !== name)
        : [...current, name],
    );

  const submit = async () => {
    setUrlError(undefined);
    setEventsError(undefined);
    setFormError(null);
    setSaving(true);
    try {
      const webhook = await create({ url: url.trim(), events: chosen });
      setCreated(webhook);
      onCreated();
    } catch (error) {
      if (error instanceof ApiError) {
        const forUrl = error.messageFor("url");
        const forEvents = error.messageFor("events");
        setUrlError(forUrl);
        setEventsError(forEvents);
        if (!forUrl && !forEvents) setFormError(error.message);
      } else {
        setFormError("Something went wrong. Try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  if (created) {
    return (
      <Modal
        open={open}
        onClose={close}
        title="Endpoint added"
        size="lg"
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" onClick={close}>
              Done
            </Button>
            <ButtonLink
              href={`/settings/webhooks/${created.id}`}
              variant="accent"
              onClick={close}
            >
              Send a test event
            </ButtonLink>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 rounded-md border border-accent-line bg-accent-soft p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <KeyRound aria-hidden="true" className="size-4" />
              Your signing secret
            </p>
            <CodeBlock className="whitespace-pre-wrap break-all">
              {created.secret ?? created.secretHint}
            </CodeBlock>
            {created.secret && (
              <div className="flex flex-wrap items-center gap-3">
                <CopyButton value={created.secret} label="Copy secret" />
                <span className="text-[0.875rem] text-body">
                  Put it in your server&rsquo;s configuration. You can read it
                  again on this endpoint&rsquo;s page, or replace it there if it
                  leaks.
                </span>
              </div>
            )}
          </div>

          <p className="text-[0.875rem] text-body">
            Nothing is sent until you press <strong>Send test event</strong>. How
            to check the signature is on that page too.
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Add an endpoint"
      description="We POST signed JSON to a URL you control."
      size="lg"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={saving}
            disabled={url.trim() === "" || chosen.length === 0}
            onClick={() => void submit()}
          >
            Add endpoint
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <Field
          label="Endpoint URL"
          required
          help="https:// and no username or password in it."
          error={urlError}
        >
          <Input
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://example.com/hooks/approvehr"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </Field>

        <EventPicker
          catalogue={catalogue}
          chosen={chosen}
          onToggle={toggle}
          error={eventsError}
        />

        {formError && (
          <Callout tone="danger" title="That was not accepted">
            {formError}
          </Callout>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ groups */

/**
 * The checkbox list, in two groups.
 *
 * Exported because the detail screen changes an existing endpoint's events with
 * the same control. One list, so the two cannot describe the catalogue
 * differently.
 */
export function EventPicker({
  catalogue,
  chosen,
  onToggle,
  error,
}: {
  catalogue: CatalogueView | null;
  chosen: string[];
  onToggle: (name: string) => void;
  error?: string | undefined;
}) {
  if (!catalogue) {
    return <p className="text-[0.875rem] text-body">Loading the event list…</p>;
  }

  return (
    <FieldSet legend="Which events" error={error}>
      <EventGroup
        heading="Sent today"
        events={catalogue.events.filter((event) => event.wired)}
        chosen={chosen}
        onToggle={onToggle}
      />
      <EventGroup
        heading="Defined, nothing raises them yet"
        note="Subscribe now if you like — your endpoint stays quiet until the module that raises it ships."
        events={catalogue.events.filter((event) => !event.wired)}
        chosen={chosen}
        onToggle={onToggle}
      />
    </FieldSet>
  );
}

function EventGroup({
  heading,
  note,
  events,
  chosen,
  onToggle,
}: {
  heading: string;
  note?: string;
  events: ApiEventDefinition[];
  chosen: string[];
  onToggle: (name: string) => void;
}) {
  if (events.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="mt-2 flex items-center gap-1.5 text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-muted">
        {note && <AlertTriangle aria-hidden="true" className="size-3.5" />}
        {heading}
      </p>
      {note && <p className="-mt-1 text-[0.875rem] text-body">{note}</p>}
      <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
        {events.map((event) => (
          <li key={event.name} className="p-3">
            <EventRow
              event={event}
              checked={chosen.includes(event.name)}
              onToggle={() => onToggle(event.name)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function EventRow({
  event,
  checked,
  onToggle,
}: {
  event: ApiEventDefinition;
  checked: boolean;
  onToggle: () => void;
}) {
  const [showSample, setShowSample] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <Checkbox
        checked={checked}
        onChange={onToggle}
        label={<span className="font-mono text-[0.875rem]">{event.name}</span>}
        description={event.description}
      />
      <div className="pl-7">
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={showSample}
          onClick={() => setShowSample((open) => !open)}
        >
          {showSample ? (
            <ChevronDown aria-hidden="true" className="size-4" />
          ) : (
            <ChevronRight aria-hidden="true" className="size-4" />
          )}
          {showSample ? "Hide sample" : "Sample payload"}
        </Button>
        {showSample && (
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-[0.875rem] text-body">{event.raisedWhen}</p>
            <PayloadBlock value={event.sample} copyLabel="Copy sample" />
          </div>
        )}
      </div>
    </div>
  );
}
