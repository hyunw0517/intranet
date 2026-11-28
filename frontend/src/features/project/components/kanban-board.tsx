"use client";

import { useId, useState } from "react";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarDays, Plus, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import { moveProjectTask } from "@/services/api/projects";
import { TASK_STATUS_LABEL, TASK_STATUSES, type ProjectTask, type ProjectTaskStatus } from "@/types/project";
import { projectKeys, useProjectMutation } from "../hooks/use-projects";

const COLUMN_PREFIX = "column:";

interface KanbanBoardProps {
  projectId: number;
  tasks: ProjectTask[];
  onOpenTask: (task: ProjectTask) => void;
  onAddTask: (status: ProjectTaskStatus) => void;
}

// 오늘(KST) "YYYY-MM-DD" - 마감 지남 표시용
const kstToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());

// 칸반 보드 (할 일 / 진행 / 완료)
// - 카드를 놓으면 서버에 이동(상태 + 위치)을 요청한다.
// - 캐시를 먼저 바꾸고(낙관적 업데이트), 실패하면 알리고 서버 값으로 다시 조회한다.
// - 드래그가 어려우면 과제 창에서 상태를 바꿀 수 있다.
export function KanbanBoard({ projectId, tasks, onOpenTask, onAddTask }: KanbanBoardProps) {
  const contextId = useId();
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), // 클릭(과제 열기)과 드래그 구분
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const move = useProjectMutation(({ taskId, status, index }: { taskId: number; status: ProjectTaskStatus; index: number }) =>
    moveProjectTask(projectId, taskId, { status, index }),
  );

  const column = (status: ProjectTaskStatus) => tasks.filter((t) => t.status === status);
  const today = kstToday();

  const handleDragStart = ({ active }: DragStartEvent) => setActiveId(Number(active.id));

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over) return;

    const taskId = Number(active.id);
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    // 놓은 곳: 컬럼 빈 자리(column:STATUS) 또는 다른 카드 위(그 카드 자리에 들어간다)
    const overId = String(over.id);
    let status: ProjectTaskStatus;
    let index: number;
    if (overId.startsWith(COLUMN_PREFIX)) {
      status = overId.slice(COLUMN_PREFIX.length) as ProjectTaskStatus;
      index = column(status).filter((t) => t.id !== taskId).length; // 맨 끝
    } else {
      const overTask = tasks.find((t) => t.id === Number(over.id));
      if (!overTask) return;
      status = overTask.status;
      index = column(status).findIndex((t) => t.id === overTask.id);
    }

    const current = column(task.status).findIndex((t) => t.id === taskId);
    if (status === task.status && index === current) return; // 제자리

    // 낙관적 업데이트: 서버 규칙(reorderColumn)과 같은 방식으로 캐시 순서를 바꾼다
    const key = projectKeys.tasks(projectId);
    const previous = queryClient.getQueryData<ProjectTask[]>(key);
    queryClient.setQueryData<ProjectTask[]>(key, (old) => {
      if (!old) return old;
      const rest = old.filter((t) => t.id !== taskId);
      const target = rest.filter((t) => t.status === status);
      const at = Math.max(0, Math.min(index, target.length));
      const reordered = [...target.slice(0, at), { ...task, status }, ...target.slice(at)];
      return TASK_STATUSES.flatMap((s) => (s === status ? reordered : rest.filter((t) => t.status === s)));
    });

    move.mutate(
      { taskId, status, index },
      {
        onError: (err) => {
          queryClient.setQueryData(key, previous);
          toast.error(getErrorMessage(err));
        },
      },
    );
  };

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  return (
    <DndContext
      id={contextId}
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
      accessibility={{
        screenReaderInstructions: {
          draggable: "스페이스나 엔터로 잡고 화살표로 옮긴 뒤 다시 스페이스나 엔터로 놓습니다. ESC로 취소합니다. 카드를 열어 상태를 바꿀 수도 있습니다.",
        },
      }}
    >
      {/* 좁은 화면에서는 컬럼을 가로로 넘겨 본다 (명시적 가로 스크롤) */}
      <div className="-mx-1 overflow-x-auto px-1 pb-2">
        <div className="grid min-w-[720px] grid-cols-3 gap-4">
          {TASK_STATUSES.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              tasks={column(status)}
              today={today}
              onOpenTask={onOpenTask}
              onAddTask={() => onAddTask(status)}
            />
          ))}
        </div>
      </div>

      <DragOverlay>{activeTask && <TaskCard task={activeTask} today={today} overlay />}</DragOverlay>
    </DndContext>
  );
}

function KanbanColumn({
  status,
  tasks,
  today,
  onOpenTask,
  onAddTask,
}: {
  status: ProjectTaskStatus;
  tasks: ProjectTask[];
  today: string;
  onOpenTask: (task: ProjectTask) => void;
  onAddTask: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${COLUMN_PREFIX}${status}` });

  return (
    <section aria-label={`${TASK_STATUS_LABEL[status]} 컬럼`} className="flex min-h-64 flex-col rounded-lg bg-muted/40">
      <header className="flex items-center justify-between px-3 py-2">
        <h3 className="text-sm font-medium">
          {TASK_STATUS_LABEL[status]} <span className="tabular-nums text-muted-foreground">{tasks.length}</span>
        </h3>
        <Button variant="ghost" size="icon-sm" onClick={onAddTask} aria-label={`${TASK_STATUS_LABEL[status]}에 과제 추가`}>
          <Plus />
        </Button>
      </header>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className={cn("grid flex-1 content-start gap-2 p-2", isOver && "rounded-b-lg bg-muted")}>
          {tasks.map((task) => (
            <SortableTaskCard key={task.id} task={task} today={today} onOpen={() => onOpenTask(task)} />
          ))}
          {tasks.length === 0 && <li className="py-6 text-center text-xs text-muted-foreground">과제를 여기로 끌어 놓을 수 있습니다</li>}
        </ul>
      </SortableContext>
    </section>
  );
}

function SortableTaskCard({ task, today, onOpen }: { task: ProjectTask; today: string; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "opacity-40")}
      {...attributes}
      {...listeners}
      aria-roledescription="이동할 수 있는 과제"
    >
      <TaskCard task={task} today={today} onOpen={onOpen} />
    </li>
  );
}

// 카드: 제목, 담당자(부재면 경고), 마감일(지났으면 강조, 완료 과제 제외)
function TaskCard({ task, today, onOpen, overlay }: { task: ProjectTask; today: string; onOpen?: () => void; overlay?: boolean }) {
  const due = task.dueDate?.slice(0, 10) ?? null;
  const overdue = !!due && task.status !== "DONE" && due < today;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "grid w-full gap-2 rounded-md border bg-card p-3 text-left text-sm shadow-xs transition-colors hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        overlay && "cursor-grabbing shadow-md",
      )}
    >
      <span className={cn("font-medium", task.status === "DONE" && "text-muted-foreground line-through")}>{task.title}</span>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {task.assignee ? (
          <span className={cn("inline-flex items-center gap-1", task.assigneeAbsent && "text-amber-600 dark:text-amber-400")}>
            {task.assigneeAbsent ? <AlertTriangle className="size-3.5" aria-hidden /> : <UserRound className="size-3.5" aria-hidden />}
            {task.assignee.name}
            {task.assigneeAbsent && " (부재)"}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <UserRound className="size-3.5" aria-hidden />
            담당자 없음
          </span>
        )}
        {due && (
          <span className={cn("inline-flex items-center gap-1 tabular-nums", overdue && "text-destructive")}>
            <CalendarDays className="size-3.5" aria-hidden />
            {due}
            {overdue && " 지남"}
          </span>
        )}
      </span>
    </button>
  );
}
