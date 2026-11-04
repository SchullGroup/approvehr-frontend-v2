"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FolderTree, Plus } from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  LinkTabs,
  LoadState,
  Skeleton,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ProjectsOff } from "@/components/projects/module-off";
import { ProgramDot, programNote } from "@/components/projects/program-parts";
import {
  ProgramProvider,
  type ProgramContextValue,
} from "@/components/projects/program-context";
import { isModuleOff } from "@/lib/api/projects";
import type { Program } from "@/lib/projects/programs";
import {
  NEW_PROJECT,
  PROGRAM,
  UNASSIGNED,
  UNASSIGNED_ID,
} from "@/lib/projects/terms";
import {
  useProgram,
  useProgramActions,
  useProgramProjects,
} from "@/lib/store/programs";
import {
  usePeople,
  useProjectActor,
  useProjectsGate,
} from "@/lib/store/project-session";
import { useSession } from "@/lib/store/session";
import { NewProjectDialog } from "../../new-project-dialog";
import { DEFAULT_PROGRAM_VIEW, viewById, viewsFor } from "./program-views";

/**
 * `/projects/programs/[id]`: one program and its tabs.
 *
 * The screen resolves what to show in the order the project screen does, and each
 * step is a real state rather than a blank: module off, loading (a skeleton),
 * failed (with a retry), not found (which is also what a program you cannot see
 * looks like, on purpose), and then the program.
 *
 * `/projects/programs/unassigned` is the bucket of projects in no program. It has
 * no record of its own, so the screen builds one that says only what is true of
 * it: no lead, no people list, and no more reach than the person already has.
 */
export function ProgramScreen({ id }: { id: string }) {
  const gate = useProjectsGate();
  if (gate.loading) return <ScreenSkeleton />;
  if (!gate.enabled) return <ProjectsOff />;
  return id === UNASSIGNED_ID ? <UnassignedScreen /> : <RealProgram id={id} />;
}

function ScreenSkeleton() {
  return (
    <>
      <PageHeader title="Program" />
      <PageBody>
        <div
          className="space-y-4"
          aria-busy="true"
          aria-label="Loading the program"
        >
          <Skeleton className="h-8 w-1/3" />
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[0, 1, 2, 3].map((n) => (
              <Skeleton key={n} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-56 w-full" />
        </div>
      </PageBody>
    </>
  );
}

const CRUMBS = [
  { href: "/projects", label: "Projects" },
  { href: "/projects/programs", label: "Programs" },
];

function RealProgram({ id }: { id: string }) {
  const program = useProgram(id);
  if (program.status === "loading") return <ScreenSkeleton />;
  if (program.status === "error" && isModuleOff(program.error)) {
    return <ProjectsOff />;
  }
  if (program.status === "error") {
    return (
      <>
        <PageHeader title="Program" breadcrumb={CRUMBS} />
        <PageBody>
          <LoadState
            loading={false}
            error={program.error}
            subject="this program"
            onRetry={program.reload}
          >
            {null}
          </LoadState>
        </PageBody>
      </>
    );
  }
  if (program.status === "notFound" || !program.data) {
    return (
      <>
        <PageHeader title="Program" breadcrumb={CRUMBS} />
        <PageBody>
          <EmptyState
            icon={<FolderTree />}
            title="This program is not here"
            description={`It may have been deleted, or it is not part of your access. You see the ${PROGRAM.many} you have been given, and the ones that hold a project you are on.`}
          />
        </PageBody>
      </>
    );
  }
  return (
    <Shell
      key={id}
      program={program.data}
      unassigned={false}
      reload={program.reload}
    />
  );
}

/** What the screen knows of the bucket of projects in no program. */
function UnassignedScreen() {
  const actor = useProjectActor();
  const reach = actor.editRecords || actor.seesAll === true ? "all" : "mine";
  const projects = useProgramProjects({ unassigned: true }, reach === "all");
  const manages = (projects.data ?? []).some((p) => p.canManage === true);
  const program: Program = useMemo(
    () => ({
      id: UNASSIGNED_ID,
      name: UNASSIGNED,
      description: `Projects that are not in a ${PROGRAM.one} yet.`,
      color: "#6B7280",
      departmentId: null,
      departmentName: null,
      leadId: "",
      leadName: null,
      archived: false,
      archivedAt: null,
      access: manages ? "MANAGE" : null,
      canManage: manages,
      canCreateProject: false,
      projectCount: projects.data?.length ?? 0,
      openTaskCount: 0,
      accessCount: null,
      createdAt: "",
      updatedAt: "",
    }),
    [manages, projects.data],
  );
  return (
    <Shell
      program={program}
      unassigned
      reload={projects.reload}
      reach={reach}
    />
  );
}

function Shell({
  program,
  unassigned,
  reload,
  reach = "mine",
}: {
  program: Program;
  unassigned: boolean;
  reload: () => void;
  reach?: "mine" | "all";
}) {
  const params = useSearchParams();
  const actions = useProgramActions();
  const people = usePeople();
  const { actingId } = useSession();
  const [creating, setCreating] = useState(false);
  const view = viewById(
    params.get("view") ?? DEFAULT_PROGRAM_VIEW,
    program,
    unassigned,
  );
  const base = `/projects/programs/${program.id}`;
  const hrefFor = (viewId: string) =>
    viewId === DEFAULT_PROGRAM_VIEW ? base : `${base}?view=${viewId}`;
  const View = view.Component;
  const note = unassigned ? null : programNote(program);
  const projects = useProgramProjects(
    unassigned ? { unassigned: true } : { programId: program.id },
    reach === "all",
  );

  const value: ProgramContextValue = useMemo(
    () => ({
      program,
      unassigned,
      actions,
      people,
      reload,
      reach,
      meId: actingId || null,
    }),
    [program, unassigned, actions, people, reload, reach, actingId],
  );

  return (
    <ProgramProvider value={value}>
      <PageHeader
        title={program.name}
        breadcrumb={CRUMBS}
        meta={
          <>
            {!unassigned && (
              <ProgramDot color={program.color} className="size-3" />
            )}
            {program.archived && (
              <Badge tone="neutral" size="sm">
                Archived
              </Badge>
            )}
            {program.departmentName && (
              <Badge tone="neutral" size="sm">
                {program.departmentName}
              </Badge>
            )}
          </>
        }
        {...(program.description ? { description: program.description } : {})}
        {...(program.canCreateProject
          ? {
              action: (
                <Button variant="primary" onClick={() => setCreating(true)}>
                  <Plus aria-hidden="true" className="size-4" />
                  {NEW_PROJECT}
                </Button>
              ),
            }
          : {})}
        tabs={
          <LinkTabs
            items={viewsFor(program, unassigned).map((v) => ({
              href: hrefFor(v.id),
              label: v.label,
            }))}
            activeHref={hrefFor(view.id)}
            className="-mb-5 border-b-0"
          />
        }
      />
      <PageBody className="space-y-5">
        {note && (
          <p className="text-body-sm text-muted" role="note">
            {note}
          </p>
        )}
        {program.archived && (
          <p className="text-body-sm text-muted" role="note">
            This {PROGRAM.one} is archived. It keeps its people and projects,
            and takes no new ones until it is restored.
          </p>
        )}
        <View />
      </PageBody>

      <NewProjectDialog
        open={creating}
        onClose={() => setCreating(false)}
        takenKeys={(projects.data ?? []).map((p) => p.key)}
        defaultProgramId={unassigned ? null : program.id}
      />
    </ProgramProvider>
  );
}
