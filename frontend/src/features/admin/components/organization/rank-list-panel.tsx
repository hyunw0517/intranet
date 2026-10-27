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
}

type DialogState = { mode: "add" } | { mode: "edit"; item: RankItem } | null;

// 직급·직책 관리 공용 패널 (둘 다 이름 + 정렬 순서만 있는 같은 구조)
// 정렬 순서는 서버가 생성 순서로 정하고 순서 변경 API는 없으므로, 화면에서도 순서만 보여 준다.
export function RankListPanel({ label, description, query, create, update, remove }: RankListPanelProps) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const [deleteTarget, setDeleteTarget] = useState<RankItem | null>(null);

  const saveMutation = useOrganizationMutation((name: string) =>
    dialog?.mode === "edit" ? update(dialog.item.id, name) : create(name),
  );
  const deleteMutation = useOrganizationMutation((id: number) => remove(id));

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
      onError: (error) => toast.error(getErrorMessage(error)),
    });
  };

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
        <ol className="divide-y rounded-lg border">
          {query.data.map((item, index) => (
            <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-6 text-right text-sm text-muted-foreground tabular-nums">{index + 1}</span>
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
            </li>
          ))}
        </ol>
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
        description={`${deleteTarget?.name ?? ""}을(를) 삭제합니다. 뒤 순서의 ${label}은(는) 한 칸씩 앞당겨집니다.`}
        confirmLabel="삭제"
        destructive
        pending={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}
