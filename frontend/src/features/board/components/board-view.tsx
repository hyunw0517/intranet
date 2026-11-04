"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { PenSquare, Search } from "lucide-react";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-state";
import { PaginationBar } from "@/components/common/pagination-bar";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api-client";
import type { PostListQuery, PostSortBy } from "@/services/api/posts";
import { BOARD_TYPE_LABEL } from "@/types/board";
import { useBoardNavigation } from "../hooks/use-board-navigation";
import { DEFAULT_POST_QUERY, usePosts } from "../hooks/use-posts";
import { BoardNotFound } from "./board-not-found";
import { PostList } from "./post-list";

const SEARCH_FIELDS = { title: "제목", content: "내용", author: "작성자" } as const;
type SearchField = keyof typeof SEARCH_FIELDS;

const SORTS: Record<PostSortBy, string> = { createdAt: "최신순", viewCount: "조회순", likeCount: "좋아요순" };

// URL 검색 파라미터 → 목록 조건 (상세에서 뒤로 가기·새로고침해도 페이지·검색이 유지된다)
function readFilters(params: URLSearchParams) {
  const field = params.get("field") as SearchField;
  const sort = params.get("sort") as PostSortBy;
  return {
    page: Number(params.get("page")) || 1,
    field: field in SEARCH_FIELDS ? field : "title",
    q: params.get("q") ?? "",
    sort: sort in SORTS ? sort : "createdAt",
  } as { page: number; field: SearchField; q: string; sort: PostSortBy };
}

type Filters = ReturnType<typeof readFilters>;

// 조건이 기본값이면 DEFAULT_POST_QUERY와 같은 객체 모양을 만든다. (글쓰기 화면과 같은 캐시 키)
function toQuery(f: Filters): PostListQuery {
  const query: PostListQuery = { ...DEFAULT_POST_QUERY, page: f.page };
  if (f.q) query[f.field] = f.q;
  if (f.sort !== "createdAt") query.sortBy = f.sort;
  return query;
}

// 직원용 게시판 목록: 고정글 + 페이지 목록, 검색(제목·내용·작성자), 정렬, 글쓰기
// 게시판 이름·권한은 목록 응답(board, perm)으로 받는다. 읽기 권한이 없으면 서버가 404.
export function BoardView({ boardId }: { boardId: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = readFilters(searchParams);
  const { data, isPending, isError, error, refetch, isFetching } = usePosts(boardId, toQuery(filters));
  // 카테고리 이름만 메뉴 캐시에서 찾는다. (사이드바가 이미 받아 둔 데이터라 추가 요청 없음)
  const navigation = useBoardNavigation();

  const updateFilters = (patch: Partial<Filters>) => {
    const next = { ...filters, page: 1, ...patch };
    const params = new URLSearchParams();
    if (next.page > 1) params.set("page", String(next.page));
    if (next.q) {
      params.set("field", next.field);
      params.set("q", next.q);
    }
    if (next.sort !== "createdAt") params.set("sort", next.sort);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  if (isPending) return <LoadingState />;
  if (isError) {
    if (error instanceof ApiError && error.status === 404) return <BoardNotFound />;
    return <ErrorState error={error} onRetry={() => refetch()} />;
  }

  const { board, perm, pinned, meta } = data;
  const navItem = navigation.data?.find((b) => b.id === boardId);
  const category = navItem?.parentBoardId ? navigation.data?.find((b) => b.id === navItem.parentBoardId) : undefined;
  const searching = !!filters.q;

  return (
    <>
      <PageHeader
        title={board.name}
        description={board.description ?? undefined}
        actions={
          // 쓰기 권한이 없으면 버튼을 숨긴다. (작성 API도 서버가 403으로 막는다)
          perm.write && (
            <Button asChild>
              <Link href={`/boards/${boardId}/write`}>
                <PenSquare aria-hidden />
                글쓰기
              </Link>
            </Button>
          )
        }
      />
      <p className="-mt-3 mb-5 text-xs text-muted-foreground">
        {category ? `${category.name} · ` : ""}
        {BOARD_TYPE_LABEL[board.type]} 게시판
        {board.isAnonymous && " · 익명"}
      </p>

      <div className="grid gap-4">
        <BoardToolbar
          key={searchParams.toString()}
          filters={filters}
          allowAuthorSearch={!board.isAnonymous}
          onChange={updateFilters}
        />

        <div className="flex items-center justify-between text-sm text-muted-foreground" aria-live="polite">
          <span>
            {searching ? "검색 결과 " : "전체 "}
            {meta.total.toLocaleString()}건
          </span>
          {searching && (
            <Button variant="link" size="sm" className="h-auto px-0" onClick={() => updateFilters({ q: "" })}>
              검색 해제
            </Button>
          )}
        </div>

        {pinned.length === 0 && data.data.length === 0 ? (
          <EmptyState message={searching ? "검색 결과가 없습니다." : "아직 게시글이 없습니다."} />
        ) : (
          <div className={cn(isFetching && "opacity-60 transition-opacity")}>
            <PostList boardId={boardId} board={board} perm={perm} pinned={pinned} posts={data.data} />
          </div>
        )}

        {meta.total > 0 && <PaginationBar meta={meta} onPageChange={(page) => updateFilters({ page })} />}
      </div>
    </>
  );
}

// 검색어는 [검색]을 눌러야 반영하고, 정렬은 고르는 즉시 반영한다.
// URL이 바뀌면 key로 다시 마운트되어 입력값이 URL과 맞춰진다.
function BoardToolbar({
  filters,
  allowAuthorSearch,
  onChange,
}: {
  filters: Filters;
  allowAuthorSearch: boolean; // 익명 게시판은 작성자 검색 불가 (서버도 400)
  onChange: (patch: Partial<Filters>) => void;
}) {
  const [field, setField] = useState<SearchField>(
    !allowAuthorSearch && filters.field === "author" ? "title" : filters.field,
  );
  const [q, setQ] = useState(filters.q);
  const fields = Object.entries(SEARCH_FIELDS).filter(([key]) => allowAuthorSearch || key !== "author");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onChange({ field, q: q.trim() });
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <form onSubmit={handleSubmit} className="flex gap-2" role="search">
        <Select value={field} onValueChange={(v) => setField(v as SearchField)}>
          <SelectTrigger className="w-24 shrink-0" aria-label="검색 항목">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {fields.map(([value, label]) => (
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
          className="min-w-0 sm:w-56"
        />
        <Button type="submit" variant="outline" className="shrink-0">
          <Search aria-hidden />
          검색
        </Button>
      </form>

      <Select value={filters.sort} onValueChange={(v) => onChange({ sort: v as PostSortBy })}>
        <SelectTrigger className="w-full sm:w-32" aria-label="정렬">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(SORTS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
