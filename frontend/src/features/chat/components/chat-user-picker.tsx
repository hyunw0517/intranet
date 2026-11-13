"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/common/data-state";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { ChatUser } from "@/services/api/chats";
import { userMeta } from "../chat-display";
import { useChatUserSearch } from "../hooks/use-chats";

// 채팅 상대 고르기 (새 채팅·초대 공용) - GET /chats/users (본인 제외, 최대 20명)
// 입력이 멈추고 0.3초 뒤에 검색한다. 고른 사람은 위에 이름표로 남아 검색어를 바꿔도 유지된다.
export function ChatUserPicker({
  selected,
  onChange,
  excludeIds = [],
}: {
  selected: ChatUser[];
  onChange: (users: ChatUser[]) => void;
  excludeIds?: number[]; // 이미 참여 중인 사람 (초대 화면)
}) {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), 300);
    return () => clearTimeout(timer);
  }, [input]);

  const { data, isPending, isError, error, refetch, isFetching } = useChatUserSearch(search);
  const selectedIds = new Set(selected.map((u) => u.id));

  const toggle = (user: ChatUser) =>
    onChange(selectedIds.has(user.id) ? selected.filter((u) => u.id !== user.id) : [...selected, user]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="이름, 사번, 부서"
            aria-label="채팅 상대 검색"
            className="h-9 pl-8"
            autoFocus
          />
          {isFetching && (
            <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />
          )}
        </div>
        {selected.length > 0 && (
          <ul className="flex flex-wrap gap-1" aria-label="선택한 회원">
            {selected.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => toggle(u)}
                  className="inline-flex h-6 items-center gap-1 rounded-full bg-secondary pr-1.5 pl-2.5 text-xs hover:bg-secondary/80"
                  aria-label={`${u.name} 선택 해제`}
                >
                  {u.name}
                  <X className="size-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isPending ? null : isError ? (
          <div className="p-3">
            <ErrorState error={error} onRetry={() => refetch()} />
          </div>
        ) : data.length === 0 ? (
          <div className="p-3">
            <EmptyState message="검색 결과가 없습니다." />
          </div>
        ) : (
          <ul>
            {data.map((user) => {
              const joined = excludeIds.includes(user.id);
              const checked = joined || selectedIds.has(user.id);
              const id = `chat-user-${user.id}`;
              return (
                <li key={user.id}>
                  <label
                    htmlFor={id}
                    className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-muted/50 has-disabled:cursor-default has-disabled:opacity-60"
                  >
                    <Checkbox id={id} checked={checked} disabled={joined} onCheckedChange={() => toggle(user)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{user.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {joined ? "참여 중" : userMeta(user) || "소속 없음"}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
