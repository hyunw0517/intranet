"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { ErrorState, LoadingState } from "@/components/common/data-state";
import { RichTextContent } from "@/components/editor/rich-text-content";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getErrorMessage } from "@/lib/error-message";
import { deleteProject } from "@/services/api/projects";
import { MEMBER_ROLE_LABEL, TASK_STATUS_LABEL, TASK_STATUSES, type ProjectDetail, type ProjectTask } from "@/types/project";
import { useProject, useProjectMutation, useProjectTasks } from "../hooks/use-projects";
import { KanbanBoard } from "./kanban-board";
import { formatPeriod, ProgressBar, ProjectStatusBadge } from "./project-badges";
import { ProjectBudget } from "./project-budget";
import { ProjectFormDialog, type ProjectFormState } from "./project-form-dialog";
import { ProjectMembers } from "./project-members";
import { ProjectPartners } from "./project-partners";
import { ProjectQuotes } from "./project-quotes";
import { ProjectSales } from "./project-sales";
import { TaskFormDialog, type TaskFormState } from "./task-form-dialog";

// 프로젝트 상세 - 탭: 칸반 / 개요 / 참여자 / 협력사 / 견적 / 매출 / 예산
// - ?task=로 들어오면 그 과제 창을 연다.
// - 수정·삭제 버튼은 myAccess.canManage일 때만 (서버도 같은 기준)
export function ProjectDetailView({ id }: { id: number }) {
  const project = useProject(id);
  const tasks = useProjectTasks(id);

  if (project.isPending) return <LoadingState />;
  if (project.isError) return <ErrorState error={project.error} onRetry={() => project.refetch()} />;

  return <ProjectDetailContent project={project.data} tasks={tasks.data} tasksError={tasks.isError ? tasks.error : null} onRetryTasks={() => tasks.refetch()} />;
}

function ProjectDetailContent({
  project,
  tasks,
  tasksError,
  onRetryTasks,
}: {
  project: ProjectDetail;
  tasks: ProjectTask[] | undefined;
  tasksError: unknown;
  onRetryTasks: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [form, setForm] = useState<ProjectFormState>(null);
  const [taskForm, setTaskForm] = useState<TaskFormState>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canManage = project.myAccess.canManage;

  const remove = useProjectMutation(deleteProject);

  // 알림에서 들어온 과제는 ?task를 상태로 옮기지 않고 그대로 계산한다 (effect 없음).
  // 창을 닫으면 주소에서 ?task를 지운다. 없는 과제(삭제됨)면 열지 않는다.
  const taskParam = Number(searchParams.get("task"));
  const urlTask = taskParam && tasks ? tasks.find((t) => t.id === taskParam) : undefined;
  const openTask: TaskFormState = taskForm ?? (urlTask ? { mode: "edit", task: urlTask } : null);
  const closeTask = () => {
    setTaskForm(null);
    if (taskParam) router.replace(`/projects/${project.id}`, { scroll: false });
  };

  const runDelete = async () => {
    try {
      await remove.mutateAsync(project.id);
      toast.success("프로젝트를 삭제했습니다.");
      router.push("/projects");
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const columnSize = (status: ProjectTask["status"]) => (tasks ?? []).filter((t) => t.status === status).length;

  return (
    <>
      <Link href="/projects" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        프로젝트 목록
      </Link>
      <PageHeader
        title={project.name}
        description={[project.client?.name, formatPeriod(project.startDate, project.endDate)].filter((v) => v && v !== "-").join(" · ") || undefined}
        actions={
          canManage && (
            <>
              <Button variant="outline" onClick={() => setForm({ mode: "edit", project })}>
                <Pencil aria-hidden />
                수정
              </Button>
              <Button variant="outline" className="text-destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 aria-hidden />
                삭제
              </Button>
            </>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <ProjectStatusBadge status={project.status} />
        <ProgressBar progress={project.progress} className="w-64" />
      </div>

      <Tabs defaultValue="overview">
        {/* 탭이 7개라 좁은 화면에서는 탭 줄만 가로로 넘긴다 */}
        <TabsList className="max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">개요</TabsTrigger>
          <TabsTrigger value="board">진척도</TabsTrigger>
          <TabsTrigger value="members">참여자 {project.members.length}</TabsTrigger>
          <TabsTrigger value="partners">협력사</TabsTrigger>
          <TabsTrigger value="quotes">견적</TabsTrigger>
          <TabsTrigger value="sales">매출</TabsTrigger>
          <TabsTrigger value="budget">예산</TabsTrigger>
        </TabsList>

        <TabsContent value="board" className="mt-4">
          {tasksError ? (
            <ErrorState error={tasksError} onRetry={onRetryTasks} />
          ) : !tasks ? (
            <LoadingState />
          ) : (
            <KanbanBoard
              projectId={project.id}
              tasks={tasks}
              onOpenTask={(task) => setTaskForm({ mode: "edit", task })}
              onAddTask={(status) => setTaskForm({ mode: "create", status })}
            />
          )}
        </TabsContent>

        <TabsContent value="overview" className="mt-4">
          <ProjectOverview project={project} />
        </TabsContent>

        <TabsContent value="members" className="mt-4">
          <ProjectMembers project={project} />
        </TabsContent>

        <TabsContent value="partners" className="mt-4">
          <ProjectPartners projectId={project.id} />
        </TabsContent>

        <TabsContent value="quotes" className="mt-4">
          <ProjectQuotes project={project} />
        </TabsContent>

        <TabsContent value="sales" className="mt-4">
          <ProjectSales projectId={project.id} />
        </TabsContent>

        <TabsContent value="budget" className="mt-4">
          <ProjectBudget projectId={project.id} />
        </TabsContent>
      </Tabs>

      <ProjectFormDialog state={form} onClose={() => setForm(null)} />
      <TaskFormDialog
        projectId={project.id}
        members={project.members}
        canManage={canManage}
        columnSize={columnSize}
        state={openTask}
        onClose={closeTask}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="프로젝트를 삭제할까요?"
        description="참여자 모두 이 프로젝트를 볼 수 없게 됩니다. 데이터는 보관되며 과제 관리 관리자가 복구할 수 있습니다. 끝난 프로젝트는 삭제 대신 상태를 완료·종료로 바꾸는 것을 권합니다."
        confirmLabel="삭제"
        destructive
        pending={remove.isPending}
        onConfirm={runDelete}
      />
    </>
  );
}

// 개요 탭 - 설명, 기본 정보, 진척도, 상태별 과제 수, 내 역할
function ProjectOverview({ project }: { project: ProjectDetail }) {
  const access = project.myAccess;
  const myRole = access.memberRole ? MEMBER_ROLE_LABEL[access.memberRole] : access.isAdmin ? "과제 관리 관리자" : "-";

  const rows: [string, React.ReactNode][] = [
    ["상태", <ProjectStatusBadge key="s" status={project.status} />],
    ["기간", formatPeriod(project.startDate, project.endDate)],
    ["거래처", project.client ? `${project.client.name}${project.client.deleted ? " (삭제된 거래처)" : ""}` : "-"],
    ["책임자", project.members.filter((m) => m.role === "MANAGER").map((m) => m.user.name).join(", ") || "-"],
    ["내 역할", myRole],
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <section className="grid content-start gap-2">
        <h3 className="text-sm font-medium">설명</h3>
        {/* 서버가 저장 시 정제한 에디터 HTML (게시글·결재 문서와 같은 표시 컴포넌트) */}
        <div className="rounded-lg border p-4 text-sm">
          <RichTextContent html={project.description} />
        </div>
      </section>

      <aside className="grid content-start gap-4">
        <dl className="grid gap-3 rounded-lg border p-4 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[72px_1fr] items-center gap-2">
              <dt className="text-muted-foreground">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        <div className="grid gap-3 rounded-lg border p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">진척도</span>
            <span className="text-xs text-muted-foreground">완료 / 전체 과제</span>
          </div>
          <ProgressBar progress={project.progress} />
          <ul className="grid grid-cols-3 gap-2 text-center">
            {TASK_STATUSES.map((s) => (
              <li key={s} className="rounded-md bg-muted/50 py-2">
                <div className="text-lg font-semibold tabular-nums">{project.taskCounts[s]}</div>
                <div className="text-xs text-muted-foreground">{TASK_STATUS_LABEL[s]}</div>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
