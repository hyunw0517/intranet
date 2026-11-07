"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, MoreHorizontal, Search } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-state";
import { PaginationBar } from "@/components/common/pagination-bar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getErrorMessage } from "@/lib/error-message";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";
import {
  restoreUser,
  type AdminUserListItem,
  type SortOrder,
  type UserListQuery,
  type UserSortBy,
} from "@/services/api/users";
import { ROLE_LABEL, STATUS_LABEL, type UserRole, type UserStatus } from "@/types/user";
import { useAdminUserMutation, useAdminUsers } from "../../hooks/use-admin-users";
import { useJobTitles, usePositions } from "../../hooks/use-organization";
import { RoleBadge, StatusBadge } from "./user-badges";
import { UserBulkActions } from "./user-bulk-actions";
import { UserQuickDialog, type QuickDialogState, type QuickDialogType } from "./user-quick-dialog";

// 검색 대상 필드 (백엔드는 필드별로 부분 일치 검색, 부서는 겸직 소속까지 포함)
const SEARCH_FIELDS = { name: "이름", empNo: "사번", email: "이메일", departmentName: "부서" } as const;
type SearchField = keyof typeof SEARCH_FIELDS;

// 표 머리글로 정렬할 수 있는 컬럼 (정렬하지 않으면 백엔드 기본값: 가입일 최신순)
const SORT_FIELDS = ["empNo", "name", "department", "position"] as const satisfies readonly UserSortBy[];
type SortField = (typeof SORT_FIELDS)[number];
type Sort = { field: SortField; order: SortOrder } | null;

function readSort(params: URLSearchParams): Sort {
  const field = params.get("sort") as SortField;
  if (!SORT_FIELDS.includes(field)) return null;
  return { field, order: params.get("order") === "desc" ? "desc" : "asc" };
}

// 같은 컬럼을 누를 때마다 오름차순 → 내림차순 → 정렬 해제(기본 순서)
function nextSort(current: Sort, field: SortField): Sort {
  if (current?.field !== field) return { field, order: "asc" };
  return current.order === "asc" ? { field, order: "desc" } : null;
}

const ALL = "all"; // Select는 빈 문자열 값을 쓸 수 없어 "전체"를 별도 값으로 둔다.

const PAGE_SIZES = [10, 20, 50];
const DEFAULT_SIZE = 20; // 백엔드 기본 take와 같다.

// URL 검색 파라미터 → 목록 조회 조건
// 필터·페이지를 URL에 두어 상세에서 뒤로 가기·새로고침해도 목록 상태가 유지된다.
function readFilters(params: URLSearchParams) {
  const field = (params.get("field") ?? "name") as SearchField;
  return {
    page: Number(params.get("page")) || 1,
    size: Math.min(Math.max(Number(params.get("size")) || DEFAULT_SIZE, 1), 100), // 백엔드 take 최대 100
    field: field in SEARCH_FIELDS ? field : "name",
    q: params.get("q") ?? "",
    role: (params.get("role") ?? ALL) as UserRole | typeof ALL,
    status: (params.get("status") ?? ALL) as UserStatus | typeof ALL,
    // 직급·직책은 id 문자열 (Select 값이 문자열이라 그대로 둔다)
    position: params.get("position") ?? ALL,
    jobTitle: params.get("jobTitle") ?? ALL,
    sort: readSort(params),
    deleted: params.get("deleted") === "1",
  };
}

type Filters = ReturnType<typeof readFilters>;

function toQuery(f: Filters): UserListQuery {
  return {
    page: f.page,
    take: f.size,
    [f.field]: f.q || undefined,
    role: f.role === ALL ? undefined : f.role,
    status: f.status === ALL ? undefined : f.status,
    positionId: f.position === ALL ? undefined : Number(f.position),
    jobTitleId: f.jobTitle === ALL ? undefined : Number(f.jobTitle),
    sortBy: f.sort?.field,
    order: f.sort?.order,
    deletedOnly: f.deleted || undefined,
  };
}

// 관리자 회원 목록: 검색·권한·상태·직급·직책 필터, 머리글 정렬, 표시 개수·페이지 이동, 선택 회원 일괄 처리, 삭제된 회원 보기(복구)
export function UserListView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = readFilters(searchParams);
  const { data, isPending, isError, error, refetch, isFetching } = useAdminUsers(toQuery(filters));

  // 필터를 바꾸면 1페이지부터 다시 본다. (페이지 이동만 page를 유지)
  const updateFilters = (patch: Partial<Filters>) => {
    const next = { ...filters, page: 1, ...patch };
    const params = new URLSearchParams();
    if (next.page > 1) params.set("page", String(next.page));
    if (next.size !== DEFAULT_SIZE) params.set("size", String(next.size));
    if (next.q) {
      params.set("field", next.field);
      params.set("q", next.q);
    }
    if (next.role !== ALL) params.set("role", next.role);
    if (next.status !== ALL) params.set("status", next.status);
    if (next.position !== ALL) params.set("position", next.position);
    if (next.jobTitle !== ALL) params.set("jobTitle", next.jobTitle);
    if (next.sort) {
      params.set("sort", next.sort.field);
      params.set("order", next.sort.order);
    }
    if (next.deleted) params.set("deleted", "1");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div className="grid gap-4">
      <Tabs value={filters.deleted ? "deleted" : "active"} onValueChange={(v) => updateFilters({ deleted: v === "deleted" })}>
        <TabsList>
          <TabsTrigger value="active">회원</TabsTrigger>
          <TabsTrigger value="deleted">삭제된 회원</TabsTrigger>
        </TabsList>
      </Tabs>

      <UserFilters key={searchParams.toString()} filters={filters} onChange={updateFilters} />

      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : data.data.length === 0 ? (
        <EmptyState message={filters.deleted ? "삭제된 회원이 없습니다." : "조건에 맞는 회원이 없습니다."} />
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              총 {data.meta.total.toLocaleString()}명
            </p>
            <PageSizeSelect value={filters.size} onChange={(size) => updateFilters({ size })} />
          </div>
          {/* min-w-0: grid 항목은 기본적으로 내용(넓은 표)보다 줄어들지 않아 화면이 넘친다. 표 안에서 가로 스크롤되게 한다. */}
          <div className={cn("min-w-0", isFetching && "opacity-60 transition-opacity")}>
            {filters.deleted ? (
              <DeletedUserTable users={data.data} />
            ) : (
              // key: 페이지·필터가 바뀌면(URL) 선택 상태를 초기화한다. 다른 페이지의 회원이 선택된 채 남지 않게 한다.
              <UserTable
                key={searchParams.toString()}
                users={data.data}
                sort={filters.sort}
                onSort={(field) => updateFilters({ sort: nextSort(filters.sort, field) })}
              />
            )}
          </div>
          <PaginationBar meta={data.meta} onPageChange={(page) => updateFilters({ page })} />
        </>
      )}
    </div>
  );
}

// 한 페이지에 보여 줄 회원 수 (URL의 size가 목록에 없는 값이면 그 값도 보여 준다)
function PageSizeSelect({ value, onChange }: { value: number; onChange: (size: number) => void }) {
  const sizes = PAGE_SIZES.includes(value) ? PAGE_SIZES : [...PAGE_SIZES, value].sort((a, b) => a - b);
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger size="sm" className="w-28" aria-label="표시 개수">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {sizes.map((n) => (
          <SelectItem key={n} value={String(n)}>
            {n}개씩
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// 검색어는 [검색]을 눌러야 반영하고, 권한·상태·직급·직책은 고르는 즉시 반영한다.
// URL이 바뀌면 key로 다시 마운트되어 입력값이 URL과 맞춰진다.
function UserFilters({ filters, onChange }: { filters: Filters; onChange: (patch: Partial<Filters>) => void }) {
  const [field, setField] = useState<SearchField>(filters.field);
  const [q, setQ] = useState(filters.q);
  const positions = usePositions();
  const jobTitles = useJobTitles();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onChange({ field, q: q.trim() });
  };

  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
      <form onSubmit={handleSubmit} className="flex gap-2" role="search">
        <Select value={field} onValueChange={(v) => setField(v as SearchField)}>
          <SelectTrigger className="w-24 shrink-0" aria-label="검색 항목">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SEARCH_FIELDS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="검색어"
          aria-label="검색어"
          className="min-w-0 lg:w-56"
        />
        <Button type="submit" variant="outline" className="shrink-0">
          <Search aria-hidden />
          검색
        </Button>
      </form>

      {/* 좁은 화면에서는 2열로 배치해 Select 4개가 넘치지 않게 한다. */}
      <div className="grid grid-cols-2 gap-2 lg:flex">
        <Select value={filters.role} onValueChange={(v) => onChange({ role: v as Filters["role"] })}>
          <SelectTrigger className="w-full lg:w-32" aria-label="권한">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>권한 전체</SelectItem>
            {Object.entries(ROLE_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.status} onValueChange={(v) => onChange({ status: v as Filters["status"] })}>
          <SelectTrigger className="w-full lg:w-32" aria-label="상태">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>상태 전체</SelectItem>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.position} onValueChange={(v) => onChange({ position: v })}>
          <SelectTrigger className="w-full lg:w-32" aria-label="직급">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>직급 전체</SelectItem>
            {positions.data?.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.jobTitle} onValueChange={(v) => onChange({ jobTitle: v })}>
          <SelectTrigger className="w-full lg:w-32" aria-label="직책">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>직책 전체</SelectItem>
            {jobTitles.data?.map((j) => (
              <SelectItem key={j.id} value={String(j.id)}>
                {j.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// 대표 소속 "부서 · 직책"
function primaryDepartmentLabel(user: AdminUserListItem) {
  const primary = user.departments[0];
  if (!primary) return "-";
  return primary.jobTitle ? `${primary.department.name} · ${primary.jobTitle.name}` : primary.department.name;
}

// 관리자 화면은 PC 우선이므로 좁은 화면에서는 표를 가로 스크롤한다. (Table 컨테이너가 overflow-x-auto)
// 왼쪽 체크박스로 선택한 회원은 하단 [권한·상태] [삭제]로 일괄 처리하고, 오른쪽 ⋯ 메뉴로 한 명씩 모달에서 변경한다.
// 권한·상태, 직급·소속 변경은 이 목록에서만 한다. (상세 페이지는 조회 + 기본 정보 수정 + 계정 관리)
function UserTable({
  users,
  sort,
  onSort,
}: {
  users: AdminUserListItem[];
  sort: Sort;
  onSort: (field: SortField) => void;
}) {
  const { user: me } = useAuth();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [dialog, setDialog] = useState<QuickDialogState | null>(null);

  // 본인은 서버가 권한·상태 변경과 삭제를 막으므로(checkNotSelf) 선택할 수 없게 한다.
  const selectable = users.filter((u) => u.id !== me?.id);
  // 일괄 삭제 후 목록이 다시 조회되면 사라진 회원은 자연히 선택에서 빠진다.
  const selectedUsers = selectable.filter((u) => selectedIds.has(u.id));
  const allSelected = selectable.length > 0 && selectedUsers.length === selectable.length;
  const headerChecked = allSelected ? true : selectedUsers.length > 0 ? "indeterminate" : false;

  // 전체 선택 → 다시 누르면 전체 해제 (일부만 선택된 상태에서 누르면 전체 선택)
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(selectable.map((u) => u.id)));
  const toggleOne = (id: number, checked: boolean) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  const openDialog = (type: QuickDialogType, user: AdminUserListItem) =>
    setDialog({ type, userId: user.id, userName: user.name, open: true });

  return (
    <div className="grid gap-3">
      <Table className="min-w-[800px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={headerChecked}
                onCheckedChange={toggleAll}
                disabled={selectable.length === 0}
                aria-label="이 페이지 회원 전체 선택"
              />
            </TableHead>
            <SortableHead field="empNo" label="사번" sort={sort} onSort={onSort} className="w-28" />
            <SortableHead field="name" label="이름" sort={sort} onSort={onSort} />
            <TableHead>이메일</TableHead>
            <SortableHead field="department" label="대표 소속" sort={sort} onSort={onSort} />
            <SortableHead field="position" label="직급" sort={sort} onSort={onSort} className="w-24" />
            <TableHead className="w-24">권한</TableHead>
            <TableHead className="w-20">상태</TableHead>
            <TableHead className="w-12">
              <span className="sr-only">도구</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => {
            const isSelf = user.id === me?.id;
            const checked = !isSelf && selectedIds.has(user.id);
            return (
              <TableRow key={user.id} data-state={checked ? "selected" : undefined}>
                <TableCell>
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => toggleOne(user.id, v === true)}
                    disabled={isSelf}
                    aria-label={isSelf ? "본인 계정은 선택할 수 없습니다" : `${user.name} 선택`}
                  />
                </TableCell>
                <TableCell className="tabular-nums">{user.empNo}</TableCell>
                <TableCell>
                  <Link href={`/admin/users/${user.id}`} className="font-medium hover:underline">
                    {user.name}
                  </Link>
                  {user.nickname && <span className="ml-1.5 text-muted-foreground">{user.nickname}</span>}
                </TableCell>
                <TableCell className="text-muted-foreground">{user.email}</TableCell>
                <TableCell>{primaryDepartmentLabel(user)}</TableCell>
                <TableCell>{user.position?.name ?? "-"}</TableCell>
                <TableCell>
                  <RoleBadge role={user.role} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={user.status} />
                </TableCell>
                <TableCell className="text-right">
                  <UserRowMenu user={user} onOpenDialog={openDialog} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <UserBulkActions selectedUsers={selectedUsers} onDone={() => setSelectedIds(new Set())} />

      <UserQuickDialog
        state={dialog}
        onClose={() => setDialog((prev) => (prev ? { ...prev, open: false } : null))}
      />
    </div>
  );
}

// 정렬 가능한 머리글: 누를 때마다 오름차순 → 내림차순 → 해제 (nextSort)
// 정렬 상태는 aria-sort로 스크린리더에 알리고, 아이콘으로 현재 방향을 보여 준다.
function SortableHead({
  field,
  label,
  sort,
  onSort,
  className,
}: {
  field: SortField;
  label: string;
  sort: Sort;
  onSort: (field: SortField) => void;
  className?: string;
}) {
  const order = sort?.field === field ? sort.order : null;
  const Icon = order === "asc" ? ArrowUp : order === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <TableHead
      className={className}
      aria-sort={order === "asc" ? "ascending" : order === "desc" ? "descending" : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className="-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {label}
        <Icon aria-hidden className={cn("size-3.5", order ? "text-foreground" : "text-muted-foreground")} />
      </button>
    </TableHead>
  );
}

// 행 끝 ⋯ 메뉴: 상세보기 / 권한·상태 / 직급·소속 (버튼을 행마다 나열하지 않아 표가 깔끔하다)
// modal={false}: 메뉴 항목에서 모달(Dialog)을 열 때 메뉴의 포커스 잠금과 겹쳐 화면 클릭이 막히는 Radix 문제를 피한다.
function UserRowMenu({
  user,
  onOpenDialog,
}: {
  user: AdminUserListItem;
  onOpenDialog: (type: QuickDialogType, user: AdminUserListItem) => void;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`${user.name} 도구`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuItem asChild>
          <Link href={`/admin/users/${user.id}`}>상세보기</Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onOpenDialog("account", user)}>권한·상태</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onOpenDialog("organization", user)}>직급·소속</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// 삭제된 회원은 상세 조회가 되지 않으므로(서버가 삭제 회원 제외) 목록에서 바로 복구한다.
function DeletedUserTable({ users }: { users: AdminUserListItem[] }) {
  const [target, setTarget] = useState<AdminUserListItem | null>(null);
  const mutation = useAdminUserMutation((id: number) => restoreUser(id));

  const handleConfirm = () => {
    if (!target) return;
    mutation.mutate(target.id, {
      onSuccess: () => {
        toast.success(`${target.name} 회원을 복구했습니다.`);
        setTarget(null);
      },
      onError: (error) => toast.error(getErrorMessage(error)),
    });
  };

  return (
    <>
      <Table className="min-w-[640px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-28">사번</TableHead>
            <TableHead>이름</TableHead>
            <TableHead>이메일</TableHead>
            <TableHead className="w-28">삭제일</TableHead>
            <TableHead className="w-20">
              <span className="sr-only">작업</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="tabular-nums">{user.empNo}</TableCell>
              <TableCell className="font-medium">{user.name}</TableCell>
              <TableCell className="text-muted-foreground">{user.email}</TableCell>
              <TableCell className="tabular-nums">{formatDate(user.deletedAt)}</TableCell>
              <TableCell className="text-right">
                <Button variant="outline" size="sm" onClick={() => setTarget(user)}>
                  복구
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => !open && setTarget(null)}
        title="회원 복구"
        description={`${target?.name ?? ""} 회원을 복구합니다. 권한·상태는 삭제 전 그대로 돌아옵니다.`}
        confirmLabel="복구"
        pending={mutation.isPending}
        onConfirm={handleConfirm}
      />
    </>
  );
}
