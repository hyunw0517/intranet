"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-state";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/error-message";
import { useOrganizationMutation } from "../../hooks/use-organization";
import { NameDialog } from "./name-dialog";
import { SortableList, SortSaveBar, useSortDraft } from "./sortable-list";

interface RankItem {
  id: number;
  name: string;
  sortOrder: number;
}

interface RankListPanelProps {
  label: string; // "직급" | "직책"
  description: string;
  query: { data?: RankItem[]; isPending: boolean; isError: boolean; error: unknown; refetch: () => void };
  create: (name: string) => Promise<unknown>;
  update: (id: number, name: string) => Promise<unknown>;
  remove: (id: number) => Promise<unknown>;
  reorder: (ids: number[]) => Promise<unknown>;
}

type DialogState = { mode: "add" } | { mode: "edit"; item: RankItem } | null;

// 직급·직책 관리 공용 패널 (둘 다 이름 + 정렬 순서만 있는 같은 구조)
// 손잡이를 끌어 순서를 바꾸면 [순서 저장]이 나타나고, 저장할 때 화면 순서대로 id 전체를 보낸다.
export function RankListPanel({ label, description, query, create, update, remove, reorder }: RankListPanelProps) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const [deleteTarget, setDeleteTarget] = useState<RankItem | null>(null);
  const sort = useSortDraft(query.data?.map((item) => item.id) ?? []);

  const saveMutation = useOrganizationMutation((name: string) =>
    dialog?.mode === "edit" ? update(dialog.item.id, name) : create(name),
  );
  const deleteMutation = useOrganizationMutation((id: number) => remove(id));
  // 성공 시 공용 훅이 목록을 다시 받은 뒤에 아래 onSuccess가 실행되므로, 임시 순서를 지워도 화면이 되돌아가지 않는다.
  const orderMutation = useOrganizationMutation((ids: number[]) => reorder(ids));

  const openDialog = (next: DialogState) => {
    saveMutation.reset(); // 이전 오류 메시지 지우기
    setDialog(next);
  };

  const handleSave = (name: string) =>
    saveMutation.mutate(name, {
      onSuccess: () => {
        toast.success(dialog?.mode === "edit" ? `${label}을(를) 수정했습니다.` : `${label}을(를) 추가했습니다.`);
        setDialog(null);
      },
    });

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success(`${deleteTarget.name}을(를) 삭제했습니다.`);
        setDeleteTarget(null);
      },
      // 사용 중이면 서버가 400으로 거부한다. 다시 눌러도 같은 결과이므로 모달을 닫고 메시지만 보여 준다. (부서 패널과 동일)
      onError: (error) => {
        toast.error(getErrorMessage(error));
        setDeleteTarget(null);
      },
    });
  };

  const handleSaveOrder = () =>
    orderMutation.mutate(sort.orderedIds, {
      onSuccess: () => {
        toast.success(`${label} 순서를 저장했습니다.`);
        sort.reset();
      },
      // 그 사이 다른 관리자가 추가·삭제했다면 서버가 거부한다. 최신 목록으로 다시 시작한다.
      onError: (error) => {
        toast.error(getErrorMessage(error));
        sort.reset();
        query.refetch();
      },
    });

  const byId = new Map((query.data ?? []).map((item) => [item.id, item]));
  const items = sort.orderedIds.flatMap((id) => byId.get(id) ?? []);

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground">{description}</p>
        <Button onClick={() => openDialog({ mode: "add" })} className="shrink-0 self-start sm:self-auto">
          <Plus aria-hidden />
          {label} 추가
        </Button>
      </div>

      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : !query.data?.length ? (
        <EmptyState message={`등록된 ${label}이(가) 없습니다.`} />
      ) : (
        <>
          <SortSaveBar
            visible={sort.changed}
            pending={orderMutation.isPending}
            onCancel={sort.reset}
            onSave={handleSaveOrder}
          />
          <SortableList
            as="ol"
            items={items}
            onReorder={sort.setDraft}
            className="divide-y rounded-lg border"
            itemClassName="flex items-center justify-between gap-3 py-2 pr-4 pl-2"
            renderItem={(item, handle) => (
              <>
                <div className="flex min-w-0 items-center gap-2">
                  {handle}
                  <span className="w-6 text-right text-sm text-muted-foreground tabular-nums">
                    {sort.orderedIds.indexOf(item.id) + 1}
                  </span>
                  <span className="truncate font-medium">{item.name}</span>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openDialog({ mode: "edit", item })}>
                    수정
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteTarget(item)}>
                    삭제
                  </Button>
                </div>
              </>
            )}
          />
        </>
      )}

      <NameDialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        title={dialog?.mode === "edit" ? `${label} 수정` : `${label} 추가`}
        description={dialog?.mode === "edit" ? `${label} 이름을 바꿉니다.` : `새 ${label}은(는) 목록 맨 아래에 추가됩니다.`}
        label={`${label}명`}
        initialName={dialog?.mode === "edit" ? dialog.item.name : ""}
        submitLabel={dialog?.mode === "edit" ? "저장" : "추가"}
        pending={saveMutation.isPending}
        error={saveMutation.error}
        onSubmit={handleSave}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`${label} 삭제`}
        description={`${deleteTarget?.name ?? ""}을(를) 삭제합니다. 사용 중인 ${label}은(는) 삭제할 수 없으며, 뒤 순서는 한 칸씩 앞당겨집니다.`}
        confirmLabel="삭제"
        destructive
        pending={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}
