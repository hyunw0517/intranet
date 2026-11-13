"use client";

import { useState } from "react";
import { CalendarOff, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { getErrorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import { createFacility, deleteFacility, updateFacility, type FacilityInput } from "@/services/api/facilities";
import {
  createFacilityCategory,
  deleteFacilityCategory,
  reorderFacilityCategories,
  updateFacilityCategory,
  type FacilityCategoryInput,
} from "@/services/api/facility-categories";
import { WEEKDAY_LABEL, type Facility, type FacilityCategory } from "@/types/reservation";
import { useAdminFacilities, useAdminFacilityCategories, useAdminFacilityMutation } from "../../hooks/use-admin-facilities";
import { SortableList, SortSaveBar, useSortDraft } from "../organization/sortable-list";
import { CategoryFormDialog, type CategoryDialogState } from "./category-form-dialog";
import { FacilityFormDialog, type FacilityDialogState } from "./facility-form-dialog";
import { UnavailableDialog } from "./unavailable-dialog";

// 시설 관리 (관리자): 왼쪽 분류(예약 규칙, 드래그 정렬) / 오른쪽 선택한 분류의 시설
export function FacilityAdminView() {
  const categories = useAdminFacilityCategories();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = categories.data?.find((c) => c.id === selectedId) ?? categories.data?.[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
      <CategoryPanel query={categories} selectedId={selected?.id} onSelect={setSelectedId} />
      <section className="min-w-0">
        {categories.isPending ? null : selected ? (
          <FacilityPanel category={selected} categories={categories.data ?? []} />
        ) : (
          <EmptyState message="먼저 왼쪽에서 시설 분류를 추가해 주세요." />
        )}
      </section>
    </div>
  );
}

//! 분류 패널
function CategoryPanel({
  query,
  selectedId,
  onSelect,
}: {
  query: ReturnType<typeof useAdminFacilityCategories>;
  selectedId: number | undefined;
  onSelect: (id: number) => void;
}) {
  const [dialog, setDialog] = useState<CategoryDialogState>(null);
  const [deleteTarget, setDeleteTarget] = useState<FacilityCategory | null>(null);
  const sort = useSortDraft(query.data?.map((c) => c.id) ?? []);

  const save = useAdminFacilityMutation((input: FacilityCategoryInput) =>
    dialog?.mode === "edit" ? updateFacilityCategory(dialog.category.id, input) : createFacilityCategory(input),
  );
  const remove = useAdminFacilityMutation(deleteFacilityCategory);
  const reorder = useAdminFacilityMutation(reorderFacilityCategories);

  const open = (next: CategoryDialogState) => {
    save.reset();
    setDialog(next);
  };

  const byId = new Map((query.data ?? []).map((c) => [c.id, c]));
  const items = sort.orderedIds.flatMap((id) => byId.get(id) ?? []);

  return (
    <section className="grid content-start gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">시설 분류</h2>
        <Button size="sm" variant="outline" onClick={() => open({ mode: "add" })}>
          <Plus aria-hidden />
          분류 추가
        </Button>
      </div>

      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState message="등록된 분류가 없습니다." />
      ) : (
        <>
          <SortSaveBar
            visible={sort.changed}
            pending={reorder.isPending}
            onCancel={sort.reset}
            onSave={() =>
              reorder.mutate(sort.orderedIds, {
                onSuccess: () => {
                  toast.success("분류 순서를 저장했습니다.");
                  sort.reset();
                },
                onError: (error) => {
                  toast.error(getErrorMessage(error));
                  sort.reset();
                  query.refetch();
                },
              })
            }
          />
          <SortableList
            items={items}
            onReorder={sort.setDraft}
            className="divide-y rounded-lg border"
            itemClassName={"flex items-center gap-2 py-2 pr-2 pl-2"}
            renderItem={(c, handle) => (
              <>
                {handle}
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  aria-current={c.id === selectedId ? "true" : undefined}
                  className={cn(
                    "min-w-0 flex-1 rounded-md px-2 py-1 text-left hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    c.id === selectedId && "bg-accent",
                  )}
                >
                  <div className="truncate font-medium">{c.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {c.openTime}~{c.closeTime} · {c.slotMinutes}분 · {c.operatingDays.map((d) => WEEKDAY_LABEL[d]).join("")} · {c.maxAdvanceDays}일
                  </div>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`${c.name} 관리`}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => open({ mode: "edit", category: c })}>수정</DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(c)}>
                      삭제
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          />
        </>
      )}

      <CategoryFormDialog
        state={dialog}
        onClose={() => setDialog(null)}
        pending={save.isPending}
        error={save.error}
        onSubmit={(input) =>
          save.mutate(input, {
            onSuccess: (result) => {
              toast.success(dialog?.mode === "edit" ? "분류를 수정했습니다." : "분류를 추가했습니다.");
              if (result && typeof result === "object" && "id" in result) onSelect(result.id);
              setDialog(null);
            },
          })
        }
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="시설 분류 삭제"
        description={`${deleteTarget?.name ?? ""} 분류를 삭제합니다. 시설이 남아 있는 분류는 삭제할 수 없습니다.`}
        confirmLabel="삭제"
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          deleteTarget &&
          remove.mutate(deleteTarget.id, {
            onSuccess: () => {
              toast.success("분류를 삭제했습니다.");
              setDeleteTarget(null);
            },
            onError: (error) => {
              toast.error(getErrorMessage(error));
              setDeleteTarget(null);
            },
          })
        }
      />
    </section>
  );
}

//! 시설 패널 (선택한 분류)
function FacilityPanel({ category, categories }: { category: FacilityCategory; categories: FacilityCategory[] }) {
  const facilities = useAdminFacilities(category.id);
  const [dialog, setDialog] = useState<FacilityDialogState>(null);
  const [deleteTarget, setDeleteTarget] = useState<Facility | null>(null);
  const [unavailableTarget, setUnavailableTarget] = useState<Facility | null>(null);

  const save = useAdminFacilityMutation((input: FacilityInput) =>
    dialog?.mode === "edit" ? updateFacility(dialog.facility.id, input) : createFacility(input),
  );
  const remove = useAdminFacilityMutation(deleteFacility);
  const toggleActive = useAdminFacilityMutation((f: Facility) => updateFacility(f.id, { isActive: !f.isActive }));

  const open = (next: FacilityDialogState) => {
    save.reset();
    setDialog(next);
  };

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="truncate font-semibold">{category.name} 시설</h2>
        <Button size="sm" onClick={() => open({ mode: "add", categoryId: category.id })}>
          <Plus aria-hidden />
          시설 추가
        </Button>
      </div>

      {facilities.isPending ? (
        <LoadingState />
      ) : facilities.isError ? (
        <ErrorState error={facilities.error} onRetry={() => facilities.refetch()} />
      ) : facilities.data.length === 0 ? (
        <EmptyState message="이 분류에 등록된 시설이 없습니다." />
      ) : (
        <ul className="divide-y rounded-lg border">
          {facilities.data.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{f.name}</span>
                  {!f.isActive && <Badge variant="secondary">사용 안 함</Badge>}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {[f.location, f.capacity ? `${f.capacity}명` : null].filter(Boolean).join(" · ") || "위치·인원 정보 없음"}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setUnavailableTarget(f)}>
                <CalendarOff aria-hidden />
                <span className="hidden sm:inline">사용 불가 기간</span>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`${f.name} 관리`}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => open({ mode: "edit", facility: f })}>수정</DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      toggleActive.mutate(f, {
                        onSuccess: () => toast.success(f.isActive ? "사용 안 함으로 바꿨습니다. 기존 예약은 유지됩니다." : "다시 사용합니다."),
                        onError: (e) => toast.error(getErrorMessage(e)),
                      })
                    }
                  >
                    {f.isActive ? "사용 안 함으로" : "사용하기"}
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(f)}>
                    삭제
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <FacilityFormDialog
        state={dialog}
        onClose={() => setDialog(null)}
        categories={categories}
        pending={save.isPending}
        error={save.error}
        onSubmit={(input) =>
          save.mutate(input, {
            onSuccess: () => {
              toast.success(dialog?.mode === "edit" ? "시설을 수정했습니다." : "시설을 추가했습니다.");
              setDialog(null);
            },
          })
        }
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="시설 삭제"
        description={`${deleteTarget?.name ?? ""}을(를) 삭제합니다. 앞으로의 예약이 있으면 삭제할 수 없습니다. (사용 안 함으로 바꾸면 기존 예약은 유지하고 새 예약만 막습니다)`}
        confirmLabel="삭제"
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          deleteTarget &&
          remove.mutate(deleteTarget.id, {
            onSuccess: () => {
              toast.success("시설을 삭제했습니다.");
              setDeleteTarget(null);
            },
            onError: (error) => {
              toast.error(getErrorMessage(error));
              setDeleteTarget(null);
            },
          })
        }
      />

      <UnavailableDialog facility={unavailableTarget} onClose={() => setUnavailableTarget(null)} />
    </div>
  );
}
