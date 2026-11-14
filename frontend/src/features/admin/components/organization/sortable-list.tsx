"use client";

import { useId, useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SortableItemData {
  id: number;
  name: string;
}

interface SortableListProps<T extends SortableItemData> {
  items: T[];
  onReorder: (ids: number[]) => void; // 드래그가 끝나면 새 순서의 id 목록
  renderItem: (item: T, handle: React.ReactNode) => React.ReactNode; // handle: 잡고 끄는 손잡이 버튼
  as?: "ul" | "ol";
  className?: string;
  itemClassName?: string;
}

// 드래그로 순서를 바꾸는 목록 (@dnd-kit)
// - 손잡이(⠿)를 잡아야만 끌린다. 행 안의 [수정]·[삭제] 버튼 클릭과 겹치지 않게 하기 위함이다.
// - 키보드: 손잡이에 포커스 → 스페이스/엔터로 잡기 → ↑↓로 이동 → 스페이스/엔터로 놓기 (ESC 취소)
// - 순서를 바꾸기만 하고 저장하지 않는다. 저장은 호출한 쪽이 [순서 저장]에서 한다.
export function SortableList<T extends SortableItemData>({
  items,
  onReorder,
  renderItem,
  as: List = "ul",
  className,
  itemClassName,
}: SortableListProps<T>) {
  // DndContext가 만드는 접근성 id를 서버·클라이언트에서 같게 맞춘다. (없으면 hydration 경고)
  const contextId = useId();
  const sensors = useSensors(
    // 4px 이상 움직여야 드래그 시작 (손잡이를 클릭만 한 경우와 구분)
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = items.map((item) => item.id);
  const nameOf = (id: UniqueIdentifier) => items.find((item) => item.id === id)?.name ?? "";
  const positionOf = (id: UniqueIdentifier) => ids.indexOf(Number(id)) + 1;

  // 스크린 리더 안내 (기본값은 영어)
  const announcements: Announcements = {
    onDragStart: ({ active }) => `${nameOf(active.id)}을(를) 잡았습니다. 현재 ${positionOf(active.id)}번째입니다.`,
    onDragOver: ({ active, over }) =>
      over ? `${nameOf(active.id)}을(를) ${positionOf(over.id)}번째 위치로 옮깁니다.` : undefined,
    onDragEnd: ({ active, over }) =>
      over ? `${nameOf(active.id)}을(를) ${positionOf(over.id)}번째에 놓았습니다.` : `${nameOf(active.id)}을(를) 놓았습니다.`,
    onDragCancel: ({ active }) => `${nameOf(active.id)} 이동을 취소했습니다.`,
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    onReorder(arrayMove(ids, ids.indexOf(Number(active.id)), ids.indexOf(Number(over.id))));
  };

  return (
    <DndContext
      id={contextId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: "스페이스나 엔터로 잡고, 위·아래 화살표로 옮긴 뒤 다시 스페이스나 엔터로 놓습니다. ESC로 취소합니다.",
        },
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <List className={className}>
          {items.map((item) => (
            <SortableItem
              key={item.id}
              item={item}
              sortable={items.length > 1}
              className={itemClassName}
              renderItem={renderItem}
            />
          ))}
        </List>
      </SortableContext>
    </DndContext>
  );
}

function SortableItem<T extends SortableItemData>({
  item,
  sortable,
  className,
  renderItem,
}: {
  item: T;
  sortable: boolean; // 항목이 하나뿐이면 옮길 곳이 없으므로 손잡이를 숨긴다. (자리는 유지해 정렬을 맞춤)
  className?: string;
  renderItem: SortableListProps<T>["renderItem"];
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !sortable,
  });

  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`${item.name} 순서 이동`}
      className={cn(
        "flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing",
        !sortable && "invisible",
      )}
    >
      <GripVertical className="size-4" aria-hidden />
    </button>
  );

  return (
    <li
      ref={setNodeRef}
      // Translate: 높이가 다른 항목(하위 부서를 품은 부서)끼리 바꿀 때 크기가 늘어나 보이지 않게 이동만 적용
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(className, isDragging && "relative z-10 bg-background shadow-md")}
    >
      {renderItem(item, handle)}
    </li>
  );
}

// 임시 순서를 지금 서버 목록에 맞춘다. (저장 전에 항목이 추가·삭제·이동되어도 드래그한 순서를 지키기 위함)
// - 남아 있는 항목은 드래그한 순서 그대로, 사라진 항목은 빼고, 새 항목은 서버 순서대로 끝에 붙인다.
// - 결과는 항상 지금 서버 목록과 id 구성이 같으므로 순서 저장 API의 "전체 일치" 검사를 통과한다.
function mergeDraft(draft: number[], serverIds: number[]) {
  const server = new Set(serverIds);
  const kept = draft.filter((id) => server.has(id));
  const keptSet = new Set(kept);
  return [...kept, ...serverIds.filter((id) => !keptSet.has(id))];
}

const isSameOrder = (a: number[], b: number[]) => a.length === b.length && a.every((id, i) => id === b[i]);

// 드래그로 바꾼 "저장 전 순서" 상태
// - 서버 순서(serverIds)와 다를 때만 changed = true → [순서 저장] 표시
export function useSortDraft(serverIds: number[]) {
  const [draft, setDraft] = useState<number[] | null>(null);

  const orderedIds = draft ? mergeDraft(draft, serverIds) : serverIds;
  const changed = !isSameOrder(orderedIds, serverIds);

  return { orderedIds, changed, setDraft, reset: () => setDraft(null) };
}

// 트리(부서·게시판)의 상위별 "저장 전 순서" - 형제 그룹마다 따로 정렬하므로 그룹별로 보관한다.
// childrenOf: 상위 id(null이면 최상위) → 서버 순서의 하위 목록
// 다른 그룹으로 옮겨진 항목은 원래 그룹에서 빠지고, 옮겨 간 그룹에서는 끝에 붙는다. (mergeDraft)
export function useGroupedSortDrafts<T extends { id: number }>(childrenOf: Map<number | null, T[]>) {
  const [drafts, setDrafts] = useState<Map<number | null, number[]>>(new Map());

  const serverIdsOf = (parentId: number | null) => (childrenOf.get(parentId) ?? []).map((item) => item.id);
  const mergedDraft = (parentId: number | null) => {
    const draft = drafts.get(parentId);
    return draft ? mergeDraft(draft, serverIdsOf(parentId)) : null;
  };

  // 서버 순서와 달라진 그룹만 저장 대상
  const changedGroups = [...drafts.keys()].flatMap((parentId) => {
    const ids = mergedDraft(parentId);
    return ids && !isSameOrder(ids, serverIdsOf(parentId)) ? [{ parentId, ids }] : [];
  });

  const ordered = (parentId: number | null) => {
    const siblings = childrenOf.get(parentId) ?? [];
    const draft = mergedDraft(parentId);
    if (!draft) return siblings;
    const byId = new Map(siblings.map((item) => [item.id, item]));
    return draft.flatMap((id) => byId.get(id) ?? []);
  };

  return {
    ordered,
    changedGroups,
    setDraft: (parentId: number | null, ids: number[]) => setDrafts((prev) => new Map(prev).set(parentId, ids)),
    reset: () => setDrafts(new Map()),
  };
}

// 상위 id → 하위 목록 (서버 응답이 트리 순서라 형제끼리의 순서도 그대로 유지된다)
export function groupByParent<T>(list: T[], getParentId: (item: T) => number | null) {
  const map = new Map<number | null, T[]>();
  for (const item of list) {
    const parentId = getParentId(item);
    const siblings = map.get(parentId) ?? [];
    siblings.push(item);
    map.set(parentId, siblings);
  }
  return map;
}

// 순서가 바뀌었을 때만 보이는 [취소] [순서 저장] 줄
export function SortSaveBar({
  visible,
  pending,
  onCancel,
  onSave,
}: {
  visible: boolean;
  pending: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  if (!visible) return null;

  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm">순서가 변경되었습니다. 저장해야 반영됩니다.</p>
      <div className="flex shrink-0 gap-2 self-end sm:self-auto">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={pending}>
          취소
        </Button>
        <Button size="sm" onClick={onSave} disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          순서 저장
        </Button>
      </div>
    </div>
  );
}
