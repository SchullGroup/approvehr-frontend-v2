"use client";

import { useState } from "react";
import {
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Field,
  FieldRow,
  Input,
  LoadState,
  Modal,
  Switch,
  TextLink,
  useToast,
} from "@/components/ui";
import type { ApiQuerySettings } from "@/lib/api/queries";
import { useFeatureSettings } from "@/lib/store/features";
import {
  DEMO_QUERY_HEADING,
  DEMO_QUERY_REASON,
  useQueriesSwitch,
  useQuerySettings,
  useQueryActions,
} from "@/lib/store/queries";
import { actionMessage } from "@/lib/use-action";
import { TemplatesCard } from "./templates-card";

/**
 * Queries in Settings: the switch, and the three rules beside it.
 *
 * ## The switch asks first, and says what it does
 *
 * Off for every company. Turning it **on** opens a confirmation that says what changes, what never
 * does, and ends with the two things nobody should skip: tell staff first, and have counsel review
 * the letter wording and the privacy line before it is used with real staff. Turning it **off** is
 * one press and deletes nothing: the server refuses every query route while it is off and keeps
 * every record. A modal with its own footer rather than a plain confirm, so Cancel and Escape do
 * nothing while the save is out and an answer is never lost behind a closed dialog.
 *
 * ## Three states that are not "off"
 *
 * `queriesSaid` is false when the server did not say: an API one deploy behind, or no server. That
 * is not a company's answer, so no switch is offered for it, and four different sentences say which
 * of loading, could not be read, server behind and no server it is. Showing "off" for any of them
 * would claim a setting that does not exist.
 *
 * ## The rules work while the switch is off
 *
 * A company sets its reply time before it switches on, and nothing here reaches anybody. They are
 * read by `ISSUE_QUERIES`, `DECIDE_QUERIES` and `MANAGE_SETTINGS` and written by `MANAGE_SETTINGS`
 * alone; anybody else reads the server's refusal as it came.
 */
export function QueriesSettingsScreen() {
  const settings = useQuerySettings();
  const switchState = useQueriesSwitch();

  if (settings.unavailable) {
    return (
      <Callout tone="info" title={DEMO_QUERY_HEADING}>
        {DEMO_QUERY_REASON}
      </Callout>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <SwitchCard />
      <LoadState
        loading={settings.loading}
        error={settings.error}
        subject="the rules for queries"
        onRetry={settings.reload}
        hasData={settings.data != null}
        skeleton="list"
      >
        {settings.data && (
          <div className="flex flex-col gap-6">
            <RulesCard
              key={`${settings.data.replyHours}-${settings.data.warnHours}-${String(settings.data.issuerMayDecideIfSole)}`}
              settings={settings.data}
              editable={switchState.editable}
              reload={settings.reload}
            />
            <ManagersCard
              settings={settings.data}
              editable={switchState.editable}
              reload={settings.reload}
            />
          </div>
        )}
      </LoadState>
      <TemplatesCard editable={switchState.editable} />
    </div>
  );
}

function SwitchCard() {
  const features = useFeatureSettings();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const on = features.flags.queries === true;
  const said = features.queriesSaid;
  const reading = features.loading && !said;
  const failed = !features.loading && features.error != null;
  const connected = features.source === "api";
  const saving = features.saving === "queries";

  function close() {
    if (!saving) setAsking(false);
  }

  async function save(next: boolean) {
    setProblem(null);
    try {
      await features.setFeature("queries", next);
      setAsking(false);
      toast.push({
        tone: next ? "success" : "info",
        title: next ? "Queries are on" : "Queries are off",
        detail: next
          ? "People who hold Issue queries now have the Queries register."
          : "Nothing was deleted. Switch it back on any time.",
      });
    } catch (error) {
      setProblem(actionMessage(error, "that setting"));
      setAsking(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Queries"
          level={2}
          description="A query is a written letter asking one person to explain something by a stated time, with their one written reply and the outcome on the same record. It changes no pay, no status and no exit."
        />
        <CardBody className="flex flex-col gap-4">
          {reading ? (
            <p className="text-body-sm text-muted">Reading the setting</p>
          ) : connected && said ? (
            <>
              <Switch
                label="Use queries in this company"
                description="Off for every company until somebody turns it on. Off, nobody sees the register and the server refuses every query request. Turning it off deletes nothing."
                checked={on}
                disabled={!features.editable || saving}
                onChange={(event) => {
                  /* On asks first. Off is one press, and deletes nothing. */
                  if (event.target.checked) setAsking(true);
                  else void save(false);
                }}
              />
              {problem && (
                <p role="alert" className="text-body-sm text-danger-text">
                  {problem}
                </p>
              )}
              {!features.editable && (
                <p className="text-body-sm text-muted">
                  Read-only: changing this needs the Manage settings permission.
                </p>
              )}
              <p className="text-body-sm text-muted">
                Who may write and who may decide queries is set on{" "}
                <TextLink href="/settings/roles">Roles</TextLink>, as Issue
                queries and Decide queries.
              </p>
            </>
          ) : failed ? (
            <p className="text-body-sm text-muted">
              The setting could not be read, so no switch is shown rather than a
              guess. Reload the page to try again.
            </p>
          ) : (
            <p className="text-body-sm text-muted">
              {connected
                ? "This server has not been updated to offer queries yet, so there is no switch to show until it is."
                : "Whether queries are on is a company setting kept on the server, so there is nothing to switch here."}
            </p>
          )}
        </CardBody>
      </Card>

      <Modal
        open={asking}
        onClose={close}
        title="Turn queries on?"
        size="sm"
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={close}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={saving}
              onClick={() => void save(true)}
            >
              Switch it on
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-body-sm leading-relaxed text-body">
          <p>
            From now on, people who hold Issue queries can write a query to a
            member of staff, and that person can read it and send one written
            reply. One outcome, with written reasons, closes it.
          </p>
          <ul className="list-disc pl-5">
            <li>
              Nothing reaches anybody until a query is issued. A notification or
              an email says only that a letter from HR is waiting for them and
              when to reply by, never what it is about.
            </li>
            <li>
              A query changes no pay, no employment status and no exit. Whatever
              follows is a separate decision, made by a person.
            </li>
            <li>
              The person who issued a query cannot decide it, unless nobody else
              could.
            </li>
            <li>Turning it off later deletes nothing.</li>
          </ul>
          <p className="font-medium text-ink">
            Tell your staff before you use it, and have your counsel review the
            letter wording and the privacy line before this is switched on for
            real staff.
          </p>
        </div>
      </Modal>
    </>
  );
}

const HOURS_MAX = 720;

const whole = (text: string): number | null => {
  if (!/^\d+$/.test(text.trim())) return null;
  return Number(text);
};

function RulesCard({
  settings,
  editable,
  reload,
}: {
  settings: ApiQuerySettings;
  editable: boolean;
  reload: () => void;
}) {
  const toast = useToast();
  const actions = useQueryActions();
  const [replyHours, setReplyHours] = useState(String(settings.replyHours));
  const [warnHours, setWarnHours] = useState(String(settings.warnHours));
  const [issuerMayDecide, setIssuerMayDecide] = useState(
    settings.issuerMayDecideIfSole,
  );
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const reply = whole(replyHours);
  const warn = whole(warnHours);
  const valid =
    reply !== null &&
    warn !== null &&
    reply >= 1 &&
    reply <= HOURS_MAX &&
    warn >= 1 &&
    warn <= HOURS_MAX;
  const crossed = valid && warn > reply;
  const dirty =
    reply !== settings.replyHours ||
    warn !== settings.warnHours ||
    issuerMayDecide !== settings.issuerMayDecideIfSole;

  async function save() {
    if (reply === null || warn === null) return;
    setBusy(true);
    setProblem(null);
    try {
      await actions.updateSettings({
        replyHours: reply,
        warnHours: warn,
        issuerMayDecideIfSole: issuerMayDecide,
      });
      toast.push({ tone: "success", title: "Saved" });
      reload();
    } catch (error) {
      /* The server's own sentence, including its refusal of a warning time longer than the reply
         time. */
      setProblem(actionMessage(error, "these rules"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="The rules around queries"
        level={2}
        description="They apply to the next query somebody drafts, and work whether or not queries are switched on."
      />
      <CardBody className="flex flex-col gap-5">
        <FieldRow>
          <Field
            label="Usual time to reply (hours)"
            help="A new query starts with a reply-by time this many hours ahead. The issuer can change it on each one."
          >
            <Input
              inputMode="numeric"
              value={replyHours}
              disabled={!editable}
              onChange={(event) => setReplyHours(event.target.value)}
            />
          </Field>
          <Field
            label="Warn below (hours)"
            help="A query given less time than this shows a warning to its issuer. It never stops one."
          >
            <Input
              inputMode="numeric"
              value={warnHours}
              disabled={!editable}
              onChange={(event) => setWarnHours(event.target.value)}
            />
          </Field>
        </FieldRow>
        {!valid && (
          <p className="text-body-sm text-muted">
            Use whole hours, from 1 to {HOURS_MAX}.
          </p>
        )}
        {crossed && (
          <p className="text-body-sm text-muted">
            The warning time cannot be longer than the usual reply time.
          </p>
        )}

        <Switch
          label="The person who issued a query may decide it if nobody else can"
          description="Whoever issued a query cannot record its outcome, unless nobody else holds Decide queries and could. The server counts that when the outcome is recorded. Off, a second person has to be given the permission first."
          checked={issuerMayDecide}
          disabled={!editable}
          onChange={(event) => setIssuerMayDecide(event.target.checked)}
        />

        {settings.retention === "archive_only" && (
          <p className="text-body-sm text-muted">
            A closed query is archived and never deleted. How long a closed file
            is kept is a matter for your counsel, and the product does not
            guess.
          </p>
        )}

        {problem && (
          <p role="alert" className="text-body-sm text-danger-text">
            {problem}
          </p>
        )}
        {editable ? (
          <div>
            <Button
              onClick={() => void save()}
              disabled={!dirty || !valid || crossed || busy}
              loading={busy}
            >
              Save the rules
            </Button>
          </div>
        ) : (
          <p className="text-body-sm text-muted">
            Read-only: changing these needs the Manage settings permission.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * Whether a line manager may draft a query, and nothing wider.
 *
 * ## What it decides
 *
 * A manager who has been given **Draft queries** (on Roles, held by nobody to begin with) may
 * write the letter of a query about somebody who reports to them. HR reviews and issues it. They
 * cannot issue, extend, decide, withdraw, cite a record or attach a file, and they never see a
 * query once it has been issued. Off, the permission does nothing.
 *
 * ## It asks first
 *
 * Turning it on opens a confirmation that says what a manager can and cannot do and ends with the
 * two things nobody should skip. Turning it off is one press, deletes nothing and cuts every
 * manager off at once (the server re-derives a manager's access on each request).
 *
 * `managersMayDraft` is `null` for a server that did not say (one a deploy behind): no switch is
 * offered for a setting that does not exist, and it is never read as off.
 */
function ManagersCard({
  settings,
  editable,
  reload,
}: {
  settings: ApiQuerySettings;
  editable: boolean;
  reload: () => void;
}) {
  const toast = useToast();
  const actions = useQueryActions();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const on = settings.managersMayDraft === true;

  function close() {
    if (!busy) setAsking(false);
  }

  async function save(next: boolean) {
    setBusy(true);
    setProblem(null);
    try {
      await actions.updateSettings({ managersMayDraft: next });
      setAsking(false);
      toast.push({
        tone: next ? "success" : "info",
        title: next ? "Managers may draft" : "Managers may not draft",
        detail: next
          ? "Only people given Draft queries on Roles can, and only about their own reports."
          : "Drafts already written are kept, and HR still sees them.",
      });
      reload();
    } catch (error) {
      setProblem(actionMessage(error, "that setting"));
      setAsking(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Managers drafting"
          level={2}
          description="Whether a line manager may write the letter of a query about somebody who reports to them, for HR to review and issue."
        />
        <CardBody className="flex flex-col gap-4">
          {settings.managersMayDraft === null ? (
            <p className="text-body-sm text-muted">
              This server has not been updated to offer manager drafting yet,
              so there is no switch to show until it is.
            </p>
          ) : (
            <>
              <Switch
                label="Let managers draft queries"
                description="Off for every company. A manager writes the letter and nothing else: they cannot issue, extend, decide or withdraw it, cite a record or attach a file, and they never see a query once it is issued. Turning it off cuts every manager off at once and deletes nothing."
                checked={on}
                disabled={!editable || busy}
                onChange={(event) => {
                  if (event.target.checked) setAsking(true);
                  else void save(false);
                }}
              />
              {problem && (
                <p role="alert" className="text-body-sm text-danger-text">
                  {problem}
                </p>
              )}
              {!editable && (
                <p className="text-body-sm text-muted">
                  Read-only: changing this needs the Manage settings permission.
                </p>
              )}
              <p className="text-body-sm text-muted">
                Who may draft is set on{" "}
                <TextLink href="/settings/roles">Roles</TextLink>, as Draft
                queries. Nobody holds it until you give it to them.
              </p>
            </>
          )}
        </CardBody>
      </Card>

      <Modal
        open={asking}
        onClose={close}
        title="Let managers draft queries?"
        size="sm"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={busy}
              onClick={() => void save(true)}
            >
              Switch it on
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-body-sm leading-relaxed text-body">
          <p>
            Managers you give Draft queries to can write the letter of a query
            about somebody who reports to them. HR reviews it and issues it.
          </p>
          <ul className="list-disc pl-5">
            <li>
              A manager sees only their own drafts about their own reports, and
              never a query once it has been issued or withdrawn.
            </li>
            <li>
              They cannot issue, extend, decide or withdraw one, cite a record,
              attach a file or ask for a document.
            </li>
            <li>
              The moment the person stops reporting to them, or you switch this
              off, they lose the draft.
            </li>
            <li>Nobody holds Draft queries until you give it on Roles.</li>
          </ul>
          <p className="font-medium text-ink">
            Tell your managers what they may and may not do before you use it,
            and have your counsel review it.
          </p>
        </div>
      </Modal>
    </>
  );
}
