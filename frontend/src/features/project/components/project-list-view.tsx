"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-state";
import { PaginationBar } from "@/components/common/pagination-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { ProjectListQuery } from "@/services/api/projects";
import { PROJECT_STATUS_LABEL, PROJECT_STATUSES, type ProjectStatus } from "@/types/project";
import { useProjects } from "../hooks/use-projects";
import { formatPeriod, ProgressBar, ProjectStatusBadge } from "./project-badges";
import { ProjectFormDialog, type ProjectFormState } from "./project-form-dialog";

type StatusTab = ProjectStatus | "ALL";

// 프로젝트 목록 - 상태 탭 + 검색 + 범위(내 프로젝트 / 전체 프로젝트)
// 전체 목록은 누구나 본다(2026-11-17 사용자 결정: 목록만 공개). 상세는 참여자·과제 관리 관리자만 들어갈 수 있어서(canOpen)
// 들어갈 수 없는 행은 이름에 링크를 걸지 않는다. 서버도 상세에서 403을 낸다.
// 표는 PC, 좁은 화면에서는 카드 목록으로 바꾼다.
export function ProjectListView() {
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [status, setStatus] = useState<StatusTab>("ALL");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<ProjectFormState>(null);

  const query: ProjectListQuery = {
    scope,
    status: status === "ALL" ? undefined : status,
    search: search || undefined,
    page,
    take: 20,
  };
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useProjects(query);
  const rows = data?.data ?? [];

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={status} onValueChange={(v) => { setStatus(v as StatusTab); setPage(1); }}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="ALL">전체</TabsTrigger>
            {PROJECT_STATUSES.map((s) => (
              <TabsTrigger key={s} value={s}>
                {PROJECT_STATUS_LABEL[s]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={scope} onValueChange={(v) => { setScope(v as "mine" | "all"); setPage(1); }}>
            <TabsList>
              <TabsTrigger value="mine">내 프로젝트</TabsTrigger>
              <TabsTrigger value="all">전체 프로젝트</TabsTrigger>
            </TabsList>
          </Tabs>
          <form onSubmit={submitSearch} className="flex items-center gap-2" role="search">
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="프로젝트명 검색"
              aria-label="프로젝트명 검색"
              className="w-44"
            />
            <Button type="submit" variant="outline" size="icon" aria-label="검색">
              <Search />
            </Button>
          </form>
          <Button onClick={() => setForm({ mode: "create" })}>
            <Plus aria-hidden />새 프로젝트
          </Button>
        </div>
      </div>

      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState message={search ? "검색 결과가 없습니다." : scope === "mine" ? "참여한 프로젝트가 없습니다. 새 프로젝트를 만들어 보세요." : "프로젝트가 없습니다."} />
      ) : (
        <div className={cn("grid gap-4", isPlaceholderData && "opacity-60")}>
          {/* PC: 표 */}
          <div className="hidden rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>프로젝트</TableHead>
                  <TableHead className="w-20">상태</TableHead>
                  <TableHead>거래처</TableHead>
                  <TableHead>책임자</TableHead>
                  <TableHead className="w-48">기간</TableHead>
                  <TableHead className="w-48">진척도</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="max-w-72">
                      {p.canOpen ? (
                        <Link href={`/projects/${p.id}`} className="block truncate font-medium hover:underline">
                          {p.name}
                        </Link>
                      ) : (
                        <span className="block truncate font-medium" title="참여한 프로젝트만 열어 볼 수 있습니다">
                          {p.name}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        참여자 {p.memberCount}명{scope === "all" && p.isMember && " · 참여 중"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <ProjectStatusBadge status={p.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.client?.name ?? "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{p.managers.map((m) => m.name).join(", ") || "-"}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{formatPeriod(p.startDate, p.endDate)}</TableCell>
                    <TableCell>
                      <ProgressBar progress={p.progress} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* 모바일: 카드 */}
          <ul className="grid gap-2 md:hidden">
            {rows.map((p) => {
              const body = (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{p.name}</span>
                    <ProjectStatusBadge status={p.status} />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {p.client?.name ?? "거래처 없음"} · 책임자 {p.managers.map((m) => m.name).join(", ") || "-"}
                    {scope === "all" && p.isMember && " · 참여 중"}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">{formatPeriod(p.startDate, p.endDate)}</span>
                  <ProgressBar progress={p.progress} />
                </>
              );
              return (
                <li key={p.id}>
                  {/* 들어갈 수 없는 프로젝트는 링크 없이 요약만 */}
                  {p.canOpen ? (
                    <Link href={`/projects/${p.id}`} className="grid gap-2 rounded-lg border p-4 hover:bg-muted/50">
                      {body}
                    </Link>
                  ) : (
                    <div className="grid gap-2 rounded-lg border p-4">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>

          {data && <PaginationBar meta={data.meta} onPageChange={setPage} />}
        </div>
      )}

      <ProjectFormDialog state={form} onClose={() => setForm(null)} />
    </div>
  );
}
