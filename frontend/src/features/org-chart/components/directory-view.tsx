"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-state";
import { PaginationBar } from "@/components/common/pagination-bar";
import { UserAvatar } from "@/components/common/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { DirectoryUser } from "@/services/api/org-chart";
import { useDirectory } from "../hooks/use-org-chart";
import { DirectoryUserDialog } from "./directory-user-dialog";

const PAGE_SIZE = 20;

// 사원 검색 - 이름·사번·부서명(겸직 포함), 이름순 20명씩. 행을 누르면 상세 창
// 데스크톱은 표, 모바일(md 미만)은 카드 목록
export function DirectoryView() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<DirectoryUser | null>(null);

  const directory = useDirectory({ search: search || undefined, page, take: PAGE_SIZE });
  const rows = directory.data?.data ?? [];

  return (
    <div className="grid gap-4">
      <form
        role="search"
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(searchInput.trim());
          setPage(1);
        }}
      >
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="이름·사번·부서명"
          aria-label="사원 검색"
          maxLength={50}
          className="w-full sm:w-64"
        />
        <Button type="submit" variant="outline" size="icon" aria-label="검색">
          <Search />
        </Button>
      </form>

      {directory.isPending ? (
        <LoadingState />
      ) : directory.isError ? (
        <ErrorState error={directory.error} onRetry={() => directory.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState message={search ? "검색 결과가 없습니다." : "등록된 사원이 없습니다."} />
      ) : (
        <div className={cn("grid gap-4", directory.isPlaceholderData && "opacity-60")}>
          {/* 데스크톱: 표 */}
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead className="w-28">직급</TableHead>
                  <TableHead>소속</TableHead>
                  <TableHead>이메일</TableHead>
                  <TableHead className="w-36">전화</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <button type="button" className="flex items-center gap-2 font-medium hover:underline" onClick={() => setDetail(u)}>
                        <UserAvatar name={u.name} imageUrl={u.profileImageUrl} className="size-7" />
                        {u.name}
                      </button>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{u.positionName ?? "-"}</TableCell>
                    <TableCell>
                      <DepartmentSummary user={u} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{u.tel ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* 모바일: 카드 */}
          <ul className="grid gap-2 md:hidden">
            {rows.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => setDetail(u)}
                  className="flex w-full items-center gap-3 rounded-lg border p-3 text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <UserAvatar name={u.name} imageUrl={u.profileImageUrl} className="size-10" fallbackClassName="text-sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-medium">{u.name}</span>
                      {u.positionName && <span className="shrink-0 text-sm text-muted-foreground">{u.positionName}</span>}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      <DepartmentSummary user={u} />
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {directory.data && <PaginationBar meta={directory.data.meta} onPageChange={setPage} />}
        </div>
      )}

      <DirectoryUserDialog user={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

// 대표 소속(직책) + 겸직 수
function DepartmentSummary({ user }: { user: DirectoryUser }) {
  const [primary, ...others] = user.departments;
  if (!primary) return <span className="text-muted-foreground">소속 없음</span>;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span>
        {primary.departmentName}
        {primary.jobTitleName && <span className="text-muted-foreground"> · {primary.jobTitleName}</span>}
      </span>
      {others.length > 0 && <Badge variant="outline">겸직 {others.length}</Badge>}
    </span>
  );
}
