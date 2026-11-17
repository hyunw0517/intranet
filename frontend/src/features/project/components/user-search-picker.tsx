"use client";

import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { ErrorState } from "@/components/common/data-state";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { UserSearchItem } from "@/services/api/users";
import { useUserSearch } from "../hooks/use-projects";

// 회원 검색·선택 (참여자 추가) - 공용 회원 검색 GET /users/search (재직 중인 승인 회원, 최대 20명)
// 입력이 멈추고 300ms 뒤에 검색한다. 이미 참여 중인 회원은 고를 수 없게 표시한다.
export function UserSearchPicker({
  excludeIds,
  selectedId,
  onSelect,
}: {
  excludeIds: number[];
  selectedId: number | null;
  onSelect: (user: UserSearchItem) => void;
}) {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setSearch(input), 300);
    return () => clearTimeout(timer);
  }, [input]);

  const { data, isFetching, isError, error, refetch } = useUserSearch(search);
  const users = data ?? [];

  return (
    <div className="grid gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="이름·사번·부서명으로 검색"
          aria-label="회원 검색"
          className="pl-8"
        />
        {isFetching && <Loader2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />}
      </div>

      {search.trim() === "" ? null : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : users.length === 0 && !isFetching ? (
        <p className="py-3 text-center text-sm text-muted-foreground">검색 결과가 없습니다.</p>
      ) : (
        <ul className="max-h-56 overflow-y-auto rounded-md border" role="listbox" aria-label="검색 결과">
          {users.map((u) => {
            const joined = excludeIds.includes(u.id);
            const selected = selectedId === u.id;
            return (
              <li key={u.id} role="option" aria-selected={selected} aria-disabled={joined}>
                <button
                  type="button"
                  disabled={joined}
                  onClick={() => onSelect(u)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50",
                    selected && "bg-muted",
                  )}
                >
                  <span>
                    <span className="font-medium">{u.name}</span>
                    {u.positionName && <span className="text-muted-foreground"> {u.positionName}</span>}
                  </span>
                  <span className="text-xs text-muted-foreground">{joined ? "참여 중" : [u.departmentName, u.empNo].filter(Boolean).join(" · ")}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
