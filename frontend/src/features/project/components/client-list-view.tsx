"use client";

import { useState } from "react";
import { Plus, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-state";
import { PaginationBar } from "@/components/common/pagination-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getErrorMessage } from "@/lib/error-message";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { restoreProjectClient } from "@/services/api/project-clients";
import { formatBusinessNo, type ProjectClient } from "@/types/project";
import { useClientMutation, useDeletedProjectClients, useProjectClients } from "../hooks/use-projects";
import { ClientDetailDialog } from "./client-detail-dialog";
import { ClientFormDialog, type ClientFormState } from "./client-form-dialog";

type Tab = "active" | "deleted";

// 거래처 - [거래처] / [삭제된 거래처]
// 발주처·하청기업을 한 목록에 두고, 역할은 연결에서 계산해 "발주 / 협력 프로젝트" 수로 보여 준다
export function ClientListView() {
  const [tab, setTab] = useState<Tab>("active");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<ClientFormState>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [restoring, setRestoring] = useState<ProjectClient | null>(null);

  const query = { search: search || undefined, page, take: 20 };
  const active = useProjectClients(query, tab === "active");
  const deleted = useDeletedProjectClients(query, tab === "deleted");
  const current = tab === "active" ? active : deleted;
  const rows = current.data?.data ?? [];

  const restore = useClientMutation(restoreProjectClient);

  const changeTab = (next: Tab) => {
    setTab(next);
    setPage(1);
  };

  const runRestore = async () => {
    if (!restoring) return;
    try {
      await restore.mutateAsync(restoring.id);
      toast.success(`${restoring.name}을(를) 복구했습니다.`);
      setRestoring(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={(v) => changeTab(v as Tab)}>
          <TabsList>
            <TabsTrigger value="active">거래처</TabsTrigger>
            <TabsTrigger value="deleted">삭제된 거래처</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-center gap-2">
          <form
            role="search"
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(searchInput.trim());
              setPage(1);
            }}
          >
            <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="회사명·사업자번호" aria-label="거래처 검색" className="w-48" />
            <Button type="submit" variant="outline" size="icon" aria-label="검색">
              <Search />
            </Button>
          </form>
          {tab === "active" && (
            <Button onClick={() => setForm({ mode: "create" })}>
              <Plus aria-hidden />
              거래처 등록
            </Button>
          )}
        </div>
      </div>

      {current.isPending ? (
        <LoadingState />
      ) : current.isError ? (
        <ErrorState error={current.error} onRetry={() => current.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState message={search ? "검색 결과가 없습니다." : tab === "active" ? "등록된 거래처가 없습니다." : "삭제된 거래처가 없습니다."} />
      ) : (
        <div className={cn("grid gap-4", current.isPlaceholderData && "opacity-60")}>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>회사명</TableHead>
                  <TableHead className="w-36">사업자등록번호</TableHead>
                  {tab === "active" ? (
                    <>
                      <TableHead className="w-28">대표자</TableHead>
                      <TableHead className="w-20 text-right">담당자</TableHead>
                      <TableHead className="w-24 text-right">발주 프로젝트</TableHead>
                      <TableHead className="w-24 text-right">협력 프로젝트</TableHead>
                    </>
                  ) : (
                    <>
                      <TableHead className="w-28">삭제한 사람</TableHead>
                      <TableHead className="w-40">삭제 시각</TableHead>
                      <TableHead className="w-20"><span className="sr-only">복구</span></TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <button type="button" className="font-medium hover:underline" onClick={() => setDetailId(c.id)}>
                        {c.name}
                      </button>
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{formatBusinessNo(c.businessNo)}</TableCell>
                    {tab === "active" ? (
                      <>
                        <TableCell className="text-muted-foreground">{c.ceoName ?? "-"}</TableCell>
                        <TableCell className="text-right tabular-nums">{c._count?.contacts ?? 0}</TableCell>
                        <TableCell className="text-right tabular-nums">{c._count?.projects ?? 0}</TableCell>
                        <TableCell className="text-right tabular-nums">{c._count?.partners ?? 0}</TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="text-muted-foreground">{c.deletedBy?.name ?? "-"}</TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">{formatDateTime(c.deletedAt)}</TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" onClick={() => setRestoring(c)}>
                            <RotateCcw aria-hidden />
                            복구
                          </Button>
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {current.data && <PaginationBar meta={current.data.meta} onPageChange={setPage} />}
        </div>
      )}

      <ClientFormDialog state={form} onClose={() => setForm(null)} />
      <ClientDetailDialog
        clientId={detailId}
        onClose={() => setDetailId(null)}
        onEdit={(client) => {
          setDetailId(null);
          setForm({ mode: "edit", client });
        }}
      />
      <ConfirmDialog
        open={restoring !== null}
        onOpenChange={(open) => !open && setRestoring(null)}
        title="거래처를 복구할까요?"
        description="거래처 목록에 다시 보이고 새 프로젝트에서 고를 수 있습니다. 같은 사업자등록번호의 거래처가 이미 있으면 복구할 수 없습니다."
        confirmLabel="복구"
        pending={restore.isPending}
        onConfirm={runRestore}
      />
    </div>
  );
}
