"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Lock,
  MapPin,
  Megaphone,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  Picker,
  Select,
  Skeleton,
  Textarea,
  useToast,
  formatMoney,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { SourceBadge } from "@/components/hiring/source-badge";
import { ApiError } from "@/lib/api/client";
import {
  kobo,
  naira,
  type ApiRequisitionDetail,
  type ApiStage,
  type EmploymentType,
  type RequisitionStatus as RealStatus,
  type UpdateRequisitionBody,
} from "@/lib/api/recruitment";
import { usePermissions, useCan } from "@/lib/permissions";
import { pipelineCards, requisitionById } from "@/lib/mock/hiring";
import { employeeById } from "@/lib/mock/people";
import { fullName } from "@/lib/types";
import { useDepartments } from "@/lib/store/departments";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import {
  useRequisitionDetail,
  useRequisitionMutations,
  useStageMutations,
} from "@/lib/store/recruitment";
import { useSession } from "@/lib/store/session";
import { RequisitionScreening, UnknownRequisition } from "./screening";
import { RequisitionWorkspace } from "./workspace";
import { RealRequisitionWorkspace } from "./real-workspace";

/**
 * One role — gated.
 *
 * The salary band, the hiring team's names and every candidate's pipeline
 * record (expected salary included) all render below, so this screen is kept
 * to whoever holds `MANAGE_HIRING`, the same gate every sibling hiring screen
 * uses. See `candidate-screen.tsx` for the pattern this copies.
 */
export function RequisitionScreen({ id }: { id: string }) {
  const { can, loading } = usePermissions();

  if (loading) {
    return (
      <>
        <PageHeader
          breadcrumb={[{ href: "/hiring", label: "Pipeline" }]}
          title="Requisition"
        />
        <PageBody>
          <Skeleton className="h-40 w-full" />
          <span className="sr-only-focusable">Loading this requisition</span>
        </PageBody>
      </>
    );
  }

  if (!can("MANAGE_HIRING") && !can("APPROVE_HIRING")) {
    return (
      <>
        <PageHeader
          breadcrumb={[{ href: "/hiring", label: "Pipeline" }]}
          title="Requisition"
        />
        <PageBody>
          <Card>
            <EmptyState
              icon={<Lock aria-hidden="true" />}
              title="You cannot see this requisition"
              description="A requisition holds the salary band, the hiring team and every candidate's pipeline record, including their expected salary, so it is kept to whoever hires or approves hiring. Ask whoever manages access to add one of those to your role."
              action={
                <ButtonLink href="/hiring" variant="secondary" size="sm">
                  Back to hiring
                </ButtonLink>
              }
            />
          </Card>
        </PageBody>
      </>
    );
  }

  return <RequisitionDetail id={id} />;
}

/* -------------------------------------------------------------------------- */

const REAL_STATUS_TONE = {
  DRAFT: "neutral",
  PENDING_APPROVAL: "warning",
  OPEN: "success",
  ON_HOLD: "warning",
  FILLED: "info",
  CANCELLED: "neutral",
} as const;

const REAL_STATUS_LABEL: Record<RealStatus, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending approval",
  OPEN: "Open",
  ON_HOLD: "On hold",
  FILLED: "Filled",
  CANCELLED: "Cancelled",
};

const STATUS_TONE = {
  draft: "neutral",
  pending_approval: "warning",
  open: "success",
  on_hold: "warning",
  closed: "neutral",
} as const;

const STATUS_LABEL = {
  draft: "Draft",
  pending_approval: "Pending approval",
  open: "Open",
  on_hold: "On hold",
  closed: "Closed",
} as const;

const WORK_MODE = { onsite: "On-site", hybrid: "Hybrid", remote: "Remote" };
const TYPE = {
  full_time: "Full time",
  contract: "Contract",
  internship: "Internship",
};

/**
 * A band, written out in full.
 *
 * Two decimals and thousands separators, never abbreviated: an approved band is
 * the figure an offer gets checked against, and ₦1.8m is not something you can
 * reconcile with.
 */
const band = (min: number, max: number) =>
  `${formatMoney(min, "NGN", { decimals: true })} – ${formatMoney(max, "NGN", { decimals: true })}`;

/**
 * The role itself, once `MANAGE_HIRING` has already been confirmed by
 * `RequisitionScreen` above.
 *
 * ## The page has two halves and only one of them can be live
 *
 * `/api/v1/careers` answers about the **advert** and the applications it brings
 * in. `Requisition`, `PipelineStage`, `Candidate`, the pipeline `Application`,
 * `Interview` and `Scorecard` all exist in Prisma and none of them has a route —
 * so the role facts and the board below are the seeded demo data whatever mode
 * the app is in, and each panel says so. The screening queue in the middle is
 * live whenever the API is up, and it is the one place in the product that can
 * move somebody into a pipeline without asking for a requisition id by hand,
 * because the requisition is the URL.
 *
 * ## Why an unknown id is not a 404
 *
 * Connected, the roles list on `/hiring` is built from adverts, and an advert's
 * `requisitionId` is a real database id this browser's seed has never seen.
 * `notFound()` there would be a dead end reached by following a link the product
 * itself drew — so an unrecognised id renders the half that *is* live.
 */
function RequisitionDetail({ id }: { id: string }) {
  const { isConnected } = useSession();
  if (isConnected) return <RealRequisitionDetail id={id} />;
  return <SeededRequisitionDetail id={id} />;
}

/**
 * A real requisition — facts, lifecycle, stages and the real pipeline board.
 *
 * Nothing here is seeded, unlike the rest of this file: a company that has
 * never opened a role connected has no mock to fall back to, so an unknown
 * id is a genuine 404 rather than `UnknownRequisition`'s "the screening queue
 * still works" compromise, which exists only for the demo's own drift.
 */
function RealRequisitionDetail({ id }: { id: string }) {
  const { requisition, loading, error, notFound, reload } =
    useRequisitionDetail(id);
  const mutations = useRequisitionMutations();
  const stageMutations = useStageMutations();
  const canApprove = useCan("APPROVE_HIRING");
  const canManage = useCan("MANAGE_HIRING");
  const toast = useToast();
  const [addingStage, setAddingStage] = useState(false);
  const [stageName, setStageName] = useState("");
  const [stageScored, setStageScored] = useState(false);
  const [renamingStageId, setRenamingStageId] = useState<string | null>(null);
  const [stageRenameDraft, setStageRenameDraft] = useState("");
  const [editingRole, setEditingRole] = useState(false);
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <PageBody>
        <Skeleton className="h-40 w-full" />
        <span className="sr-only-focusable">Loading this requisition</span>
      </PageBody>
    );
  }

  if (notFound || !requisition) {
    return (
      <PageBody>
        <Card>
          <EmptyState
            title="That requisition is not here"
            description={
              error?.message ??
              "It may have been removed, or this id belongs to another company."
            }
            action={
              <ButtonLink href="/hiring" variant="secondary" size="sm">
                Back to hiring
              </ButtonLink>
            }
          />
        </Card>
      </PageBody>
    );
  }

  const fail = (err: unknown) =>
    toast.push({
      title: "Not done",
      tone: "danger",
      detail:
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Try again.",
    });

  /**
   * Runs a write against this requisition, reloads on success, reports the
   * server's own refusal on failure. Generic rather than tied to
   * `ApiRequisitionDetail`'s shape, because a stage write answers with an
   * `ApiStage`, an `ApiStage[]` or a bare delete receipt — this is the one
   * wrapper every mutation on this screen goes through. Returns whether it
   * went through, so a caller that also owns some local form state (closing
   * a dialog, clearing a draft) knows whether that is safe to do.
   */
  async function run<T>(action: () => Promise<T>): Promise<boolean> {
    setBusy(true);
    try {
      await action();
      reload();
      return true;
    } catch (err) {
      fail(err);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addStage() {
    if (!stageName.trim() || !requisition) return;
    const ok = await run(() =>
      stageMutations.create(id, {
        name: stageName.trim(),
        requiresScorecards: stageScored,
        order: requisition.stages.length,
      }),
    );
    if (ok) {
      setStageName("");
      setStageScored(false);
      setAddingStage(false);
    }
  }

  /**
   * Move one stage a place up or down, then send the whole reordered id
   * list. `reorderStages` on the API takes the full sequence rather than a
   * swap — there is no partial reorder to ask for — so this always builds
   * every id, sorted, with the one row moved.
   */
  async function moveStage(stageId: string, delta: -1 | 1) {
    if (!requisition) return;
    const sorted = [...requisition.stages].sort((a, b) => a.order - b.order);
    const from = sorted.findIndex((s) => s.id === stageId);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= sorted.length) return;
    const reordered = [...sorted];
    const [row] = reordered.splice(from, 1);
    if (!row) return;
    reordered.splice(to, 0, row);
    await run(() =>
      stageMutations.reorder(
        id,
        reordered.map((s) => s.id),
      ),
    );
  }

  function startRenamingStage(stage: ApiStage) {
    setRenamingStageId(stage.id);
    setStageRenameDraft(stage.name);
  }

  async function saveStageRename(stage: ApiStage) {
    const name = stageRenameDraft.trim();
    if (name.length === 0 || name === stage.name) {
      setRenamingStageId(null);
      return;
    }
    const ok = await run(() => stageMutations.update(id, stage.id, { name }));
    if (ok) setRenamingStageId(null);
  }

  /**
   * The API refuses to remove a stage with applications currently sitting in
   * it — an "occupied stage" — and this does not pre-guess that. `run`
   * surfaces the server's own refusal sentence exactly as every other write
   * on this screen does, rather than a client-side guard reasoning about
   * `currentCount` on its own.
   */
  async function removeStage(stage: ApiStage) {
    await run(() => stageMutations.remove(id, stage.id));
  }

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/hiring", label: "Pipeline" },
          {
            href: `/hiring/requisitions/${requisition.id}`,
            label: requisition.reference,
          },
        ]}
        title={requisition.jobTitle}
        meta={
          <>
            <Badge tone={REAL_STATUS_TONE[requisition.status]} dot>
              {REAL_STATUS_LABEL[requisition.status]}
            </Badge>
            <Badge tone="neutral" size="sm">
              {requisition.reference}
            </Badge>
          </>
        }
      />

      <PageBody className="flex flex-col gap-6">
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card>
            {/* Offered only to whoever can manage hiring, and not at all once
                the role is filled or cancelled — the API refuses every field
                at that point, so there is nothing an edit control here could
                honestly do. See `updateRequisition`'s own refusal, which this
                note echoes rather than paraphrases differently. */}
            {canManage && (
              <CardHeader
                title="Role details"
                action={
                  requisition.status === "FILLED" ||
                  requisition.status === "CANCELLED" ? (
                    <span className="text-meta text-muted">
                      {requisition.status === "FILLED" ? "Filled" : "Cancelled"}{" "}
                      — part of the record now.
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setEditingRole(true)}
                    >
                      <Pencil aria-hidden="true" className="size-3.5" />
                      Edit
                    </Button>
                  )
                }
              />
            )}
            <CardBody className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-x-6 gap-y-3 text-body-sm">
                <Fact label="Salary band">
                  <span className="tabular whitespace-nowrap">
                    {requisition.bandMinKobo != null &&
                    requisition.bandMaxKobo != null
                      ? band(
                          naira(requisition.bandMinKobo),
                          naira(requisition.bandMaxKobo),
                        )
                      : "Not set"}
                  </span>
                </Fact>
                <Fact label="Location">
                  {requisition.location ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin
                        aria-hidden="true"
                        className="size-3.5 text-faint"
                      />
                      {requisition.location}
                    </span>
                  ) : (
                    "Not set"
                  )}
                </Fact>
                <Fact label="Type">
                  {EMPLOYMENT_TYPE_LABELS[requisition.employmentType]}
                </Fact>
                <Fact label="Headcount">{requisition.headcount}</Fact>
                {requisition.departmentName && (
                  <Fact label="Department">{requisition.departmentName}</Fact>
                )}
              </div>
              {requisition.description && (
                <p className="whitespace-pre-line border-t border-line pt-4 text-body-sm text-body">
                  {requisition.description}
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody className="flex flex-col gap-3.5">
              <h3 className="text-meta font-semibold text-muted">Lifecycle</h3>
              <Person
                label="Hiring manager"
                name={requisition.hiringManagerName ?? "Not set"}
              />
              {requisition.approvedByName && (
                <Person label="Approved by" name={requisition.approvedByName} />
              )}
              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                {(requisition.status === "DRAFT" ||
                  requisition.status === "PENDING_APPROVAL") && (
                  <>
                    {requisition.status === "DRAFT" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={busy}
                        onClick={() => void run(() => mutations.submit(id))}
                      >
                        Submit
                      </Button>
                    )}
                    {canApprove && (
                      <Button
                        size="sm"
                        variant="approve"
                        loading={busy}
                        onClick={() => void run(() => mutations.approve(id))}
                      >
                        Approve
                      </Button>
                    )}
                  </>
                )}
                {requisition.status === "OPEN" && (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busy}
                      onClick={() => void run(() => mutations.hold(id))}
                    >
                      Put on hold
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busy}
                      onClick={() => void run(() => mutations.fill(id))}
                    >
                      Mark filled
                    </Button>
                  </>
                )}
                {requisition.status === "ON_HOLD" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={busy}
                    onClick={() => void run(() => mutations.reopen(id))}
                  >
                    Reopen
                  </Button>
                )}
                {requisition.status !== "FILLED" &&
                  requisition.status !== "CANCELLED" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={busy}
                      onClick={() => void run(() => mutations.cancel(id))}
                    >
                      Cancel
                    </Button>
                  )}
              </div>
              <div className="border-t border-line pt-3 text-body-sm">
                <p className="tabular flex flex-wrap gap-x-3 gap-y-1 text-meta text-muted">
                  <span>{requisition.applications.inProgress} in progress</span>
                  <span>{requisition.applications.offerMade} offered</span>
                  <span>{requisition.applications.hired} hired</span>
                </p>
              </div>
            </CardBody>
          </Card>
        </div>

        <RequisitionScreening
          requisitionId={requisition.id}
          roleName={requisition.jobTitle}
        />

        <Card>
          <CardHeader
            title="Pipeline stages"
            action={
              canManage ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setAddingStage((v) => !v)}
                >
                  <Plus aria-hidden="true" className="size-3.5" />
                  Add stage
                </Button>
              ) : undefined
            }
          />
          {addingStage && canManage && (
            <CardBody className="flex flex-wrap items-end gap-3 border-b border-line">
              <Field label="Stage name" className="flex-1">
                <Input
                  value={stageName}
                  onChange={(e) => setStageName(e.currentTarget.value)}
                  placeholder="Technical interview"
                />
              </Field>
              <Checkbox
                label="Requires scorecards to leave"
                checked={stageScored}
                onChange={(e) => setStageScored(e.currentTarget.checked)}
              />
              <Button
                variant="accent"
                size="sm"
                loading={busy}
                disabled={!stageName.trim()}
                onClick={() => void addStage()}
              >
                Add
              </Button>
            </CardBody>
          )}
          <CardBody>
            <ul className="flex flex-col gap-2">
              {[...requisition.stages]
                .sort((a, b) => a.order - b.order)
                .map((s, index, sorted) => (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-line p-2.5"
                  >
                    {renamingStageId === s.id ? (
                      <>
                        <Input
                          value={stageRenameDraft}
                          onChange={(e) =>
                            setStageRenameDraft(e.currentTarget.value)
                          }
                          className="flex-1"
                          aria-label={`Rename ${s.name}`}
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={busy}
                          disabled={stageRenameDraft.trim().length === 0}
                          onClick={() => void saveStageRename(s)}
                        >
                          Save
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => setRenamingStageId(null)}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                          <span className="text-body-sm font-medium text-ink">
                            {s.name}
                          </span>
                          {s.requiresScorecards && (
                            <Badge tone="neutral" size="sm">
                              Needs scorecards to leave
                            </Badge>
                          )}
                          {/* Informational only — the count an "occupied
                              stage" refusal would name. Never used to disable
                              Remove here; the server decides that. */}
                          {s.currentCount > 0 && (
                            <Badge tone="neutral" size="sm">
                              {s.currentCount === 1
                                ? "1 person here"
                                : `${String(s.currentCount)} people here`}
                            </Badge>
                          )}
                        </span>
                        {canManage && (
                          <span className="flex items-center gap-1">
                            <IconButton
                              label={`Move ${s.name} up`}
                              size="sm"
                              disabled={busy || index === 0}
                              onClick={() => void moveStage(s.id, -1)}
                            >
                              <ArrowUp aria-hidden="true" />
                            </IconButton>
                            <IconButton
                              label={`Move ${s.name} down`}
                              size="sm"
                              disabled={busy || index === sorted.length - 1}
                              onClick={() => void moveStage(s.id, 1)}
                            >
                              <ArrowDown aria-hidden="true" />
                            </IconButton>
                            <IconButton
                              label={`Rename ${s.name}`}
                              size="sm"
                              disabled={busy}
                              onClick={() => startRenamingStage(s)}
                            >
                              <Pencil aria-hidden="true" />
                            </IconButton>
                            <IconButton
                              label={`Remove ${s.name}`}
                              size="sm"
                              disabled={busy}
                              onClick={() => void removeStage(s)}
                            >
                              <Trash2 aria-hidden="true" />
                            </IconButton>
                          </span>
                        )}
                      </>
                    )}
                  </li>
                ))}
            </ul>
          </CardBody>
        </Card>

        <div className="flex flex-col gap-4">
          <RealRequisitionWorkspace
            requisitionId={requisition.id}
            stages={requisition.stages}
          />
        </div>
      </PageBody>

      {editingRole && (
        <EditRequisitionDialog
          requisition={requisition}
          onClose={() => setEditingRole(false)}
          onSave={async (body) => {
            const ok = await run(() => mutations.update(id, body));
            if (ok) setEditingRole(false);
          }}
        />
      )}
    </>
  );
}

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  FULL_TIME: "Full time",
  PART_TIME: "Part time",
  CONTRACT: "Contract",
  INTERN: "Intern",
  NYSC: "NYSC",
};

/**
 * Editing a role already on file.
 *
 * `requisition` is never null here — the parent only mounts this dialog
 * while a real one is open (see `{editingRole && <EditRequisitionDialog …>}`
 * above), so there is no freeze-the-last-prop dance to do for a subject that
 * might vanish mid-animation, unlike `NewKpiDialog`'s siblings.
 *
 * The freeze mirrors `updateRequisition` on the API exactly: once a role is
 * `OPEN` or `ON_HOLD`, its title, employment type and salary band are
 * frozen — a candidate may already have been screened and offered against
 * those terms — while headcount, department, location, description and the
 * hiring manager stay editable throughout. The four frozen fields are left
 * **out of the body entirely** rather than sent unchanged: the API refuses
 * on a field's presence in the patch, not on whether its value actually
 * moved, so sending the old value back would be refused exactly as loudly as
 * sending a new one.
 */
function EditRequisitionDialog({
  requisition,
  onClose,
  onSave,
}: {
  requisition: ApiRequisitionDetail;
  onClose: () => void;
  onSave: (body: UpdateRequisitionBody) => Promise<void>;
}) {
  const frozen =
    requisition.status === "OPEN" || requisition.status === "ON_HOLD";

  const departments = useDepartments();
  const directory = useEmployeeDirectory({ pageSize: 200 });

  const [jobTitle, setJobTitle] = useState(requisition.jobTitle);
  const [departmentId, setDepartmentId] = useState(
    requisition.departmentId ?? "",
  );
  const [headcount, setHeadcount] = useState(String(requisition.headcount));
  const [employmentType, setEmploymentType] = useState<EmploymentType>(
    requisition.employmentType,
  );
  const [location, setLocation] = useState(requisition.location ?? "");
  const [bandMin, setBandMin] = useState(
    requisition.bandMinKobo != null
      ? String(naira(requisition.bandMinKobo))
      : "",
  );
  const [bandMax, setBandMax] = useState(
    requisition.bandMaxKobo != null
      ? String(naira(requisition.bandMaxKobo))
      : "",
  );
  const [description, setDescription] = useState(requisition.description ?? "");
  const [hiringManagerId, setHiringManagerId] = useState(
    requisition.hiringManagerId ?? "",
  );
  const [saving, setSaving] = useState(false);

  const min = Number(bandMin.replace(/\D/g, "")) || 0;
  const max = Number(bandMax.replace(/\D/g, "")) || 0;
  const bandInvalid = !frozen && min > 0 && max > 0 && min > max;
  const titleMissing = !frozen && jobTitle.trim().length === 0;

  const submit = async () => {
    if (titleMissing || bandInvalid) return;
    setSaving(true);
    try {
      /* Always editable, whatever the status, so these are always sent —
         sending them unchanged costs nothing, since only the four frozen
         fields are refused on presence rather than on a real change. */
      const body: UpdateRequisitionBody = {
        departmentId: departmentId || null,
        headcount: Math.max(1, Number(headcount) || 1),
        location: location.trim() || null,
        description: description.trim() || null,
        hiringManagerId: hiringManagerId || null,
      };
      if (!frozen) {
        body.jobTitle = jobTitle.trim();
        body.employmentType = employmentType;
        body.bandMinKobo = min > 0 ? kobo(min) : null;
        body.bandMaxKobo = max > 0 ? kobo(max) : null;
      }
      await onSave(body);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${requisition.jobTitle}`}
      description={requisition.reference}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            loading={saving}
            disabled={saving || titleMissing || bandInvalid}
            onClick={() => void submit()}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {frozen && (
          <Callout tone="info" title="Title, type and band are frozen">
            {requisition.reference} is already open, so these cannot change here
            — candidates have already been screened and offered against these
            terms. Cancel this requisition and open a new one if the role has
            genuinely changed.
          </Callout>
        )}

        <Field label="Job title" required={!frozen}>
          <Input
            value={jobTitle}
            onChange={(e) => setJobTitle(e.currentTarget.value)}
            disabled={frozen}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Department"
            {...(departments.error
              ? {
                  help: `${departments.error.message} Departments are unavailable.`,
                }
              : {})}
          >
            <Picker
              value={departmentId}
              onChange={setDepartmentId}
              placeholder="Not assigned"
              loading={departments.loading}
              options={departments.flat.map((d) => ({
                value: d.id,
                label: d.name,
              }))}
            />
          </Field>
          <Field label="Headcount" required>
            <Input
              type="number"
              min={1}
              value={headcount}
              onChange={(e) => setHeadcount(e.currentTarget.value)}
            />
          </Field>
        </div>

        <Field label="Employment type" required={!frozen}>
          <Select
            value={employmentType}
            disabled={frozen}
            onChange={(e) =>
              setEmploymentType(e.currentTarget.value as EmploymentType)
            }
          >
            {Object.entries(EMPLOYMENT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Band minimum"
            help={frozen ? undefined : "Gross monthly, in naira."}
          >
            <Input
              inputMode="numeric"
              value={bandMin}
              onChange={(e) => setBandMin(e.currentTarget.value)}
              disabled={frozen}
              placeholder="Not set"
            />
          </Field>
          <Field
            label="Band maximum"
            error={bandInvalid ? "Must be at least the minimum." : undefined}
          >
            <Input
              inputMode="numeric"
              value={bandMax}
              onChange={(e) => setBandMax(e.currentTarget.value)}
              disabled={frozen}
              placeholder="Not set"
            />
          </Field>
        </div>

        <Field label="Location">
          <Input
            value={location}
            onChange={(e) => setLocation(e.currentTarget.value)}
          />
        </Field>

        <Field label="Hiring manager">
          <Select
            value={hiringManagerId}
            onChange={(e) => setHiringManagerId(e.currentTarget.value)}
          >
            <option value="">Not set</option>
            {directory.employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {fullName(employee)} — {employee.jobTitle}
              </option>
            ))}
          </Select>
        </Field>

        <Field optional label="Description">
          <Textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

/** The seeded requisition, exactly as before this cutover. */
function SeededRequisitionDetail({ id }: { id: string }) {
  const req = requisitionById(id);
  if (!req) return <UnknownRequisition id={id} />;

  const cards = pipelineCards(req.id);
  const manager = employeeById(req.hiringManagerId);
  const recruiter = employeeById(req.recruiterId);

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/hiring", label: "Pipeline" },
          { href: `/hiring/requisitions/${req.id}`, label: req.reference },
        ]}
        title={req.title}
        meta={
          <>
            <Badge tone={STATUS_TONE[req.status]} dot>
              {STATUS_LABEL[req.status]}
            </Badge>
            <Badge tone="neutral" size="sm">
              {req.reference}
            </Badge>
          </>
        }
        action={
          <ButtonLink href="/hiring/postings" variant="secondary" size="sm">
            <Megaphone aria-hidden="true" className="size-3.5" />
            Job adverts
          </ButtonLink>
        }
      />

      <PageBody className="flex flex-col gap-6">
        {/* Role facts. Kept above the pipeline because a recruiter screening a
            CV needs the band and the must-haves in the same glance. */}
        {/* Scoped to the two cards it sits above. The panels further down carry
            their own badge — the applications one is live when the API is up,
            and a note here claiming that would be wrong in demo mode. */}
        <SourceBadge live={false} note="The role's own details." />

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card>
            <CardBody className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-x-6 gap-y-3 text-body-sm">
                <Fact label="Salary band">
                  <span className="tabular whitespace-nowrap">
                    {band(req.salaryMin, req.salaryMax)}
                  </span>
                </Fact>
                <Fact label="Location">
                  <span className="inline-flex items-center gap-1">
                    <MapPin
                      aria-hidden="true"
                      className="size-3.5 text-faint"
                    />
                    {req.location}
                  </span>
                </Fact>
                <Fact label="Type">
                  {TYPE[req.employmentType]} · {WORK_MODE[req.workMode]}
                </Fact>
                <Fact label="Opened">{req.openedAt}</Fact>
              </div>

              <div className="grid gap-5 border-t border-line pt-4 sm:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-meta font-semibold text-muted">
                    Must have
                  </h3>
                  <ul className="flex flex-col gap-1.5">
                    {req.mustHaves.map((m) => (
                      <li key={m} className="flex gap-2 text-body-sm text-body">
                        <span aria-hidden="true" className="text-success-text">
                          ✓
                        </span>
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
                {req.niceToHaves.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-meta font-semibold text-muted">
                      Nice to have
                    </h3>
                    <ul className="flex flex-col gap-1.5">
                      {req.niceToHaves.map((m) => (
                        <li
                          key={m}
                          className="flex gap-2 text-body-sm text-body"
                        >
                          <span aria-hidden="true" className="text-faint">
                            +
                          </span>
                          {m}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="flex flex-col gap-3.5">
              <h3 className="text-meta font-semibold text-muted">
                Hiring team
              </h3>
              <Person
                label="Hiring manager"
                name={manager ? fullName(manager) : "—"}
                role={manager?.jobTitle}
              />
              <Person
                label="Recruiter"
                name={recruiter ? fullName(recruiter) : "—"}
                role={recruiter?.jobTitle}
              />
              <div className="border-t border-line pt-3">
                <p className="flex items-center gap-1.5 text-meta text-muted">
                  <Users aria-hidden="true" className="size-3.5" />
                  {req.activeStages.length} of 5 pipeline stages in use
                </p>
              </div>
            </CardBody>
          </Card>
        </div>

        <RequisitionScreening requisitionId={req.id} roleName={req.title} />

        <div className="flex flex-col gap-4">
          <SourceBadge live={false} note="The pipeline board." />
          <RequisitionWorkspace
            initialCards={cards}
            activeStages={[...req.activeStages]}
          />
        </div>
      </PageBody>
    </>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-meta text-faint">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink">{children}</dd>
    </div>
  );
}

function Person({
  label,
  name,
  role,
}: {
  label: string;
  name: string;
  role?: string;
}) {
  return (
    <div>
      <p className="text-meta text-faint">{label}</p>
      <p className="mt-0.5 text-body-sm font-medium text-ink">{name}</p>
      {role && <p className="text-meta text-muted">{role}</p>}
    </div>
  );
}
