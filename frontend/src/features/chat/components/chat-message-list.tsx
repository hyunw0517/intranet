"use client";

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { ErrorState, LoadingState } from "@/components/common/data-state";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/error-message";
import {
  CHAT_EDIT_LIMIT_MS,
  CHAT_MESSAGE_MAX_LENGTH,
  deleteChatMessage,
  markChatRead,
  updateChatMessage,
  type ChatMessage,
  type ChatRoomDetail,
} from "@/services/api/chats";
import { messageDate, messageTime, unreadReaders } from "../chat-display";
import { chatKeys, patchMessageInCache, useChatMessages } from "../hooks/use-chats";

// 맨 아래에서 이만큼 안쪽이면 "맨 아래를 보고 있다"로 본다 (새 메시지가 오면 따라 내려간다)
const STICK_THRESHOLD = 80;

// 대화 내용 (오래된 것 → 최신, 맨 아래가 최신)
// - 보고 있는 동안 마지막 메시지까지 읽음 처리한다(값은 서버에서 앞으로만 움직인다).
// - 맨 아래를 보고 있거나 내가 보낸 메시지면 새 메시지에 맞춰 내려간다. 위를 읽는 중이면 그대로 둔다.
// - [이전 메시지]로 위에 붙여도 보던 위치가 유지되게 스크롤을 보정한다.
export function ChatMessageList({ room, userId }: { room: ChatRoomDetail; userId: number }) {
  const queryClient = useQueryClient();
  const query = useChatMessages(room.id);
  const now = useNow(30 * 1000);

  // 서버 순서(최신 먼저)를 뒤집는다
  const messages = useMemo(() => (query.data?.pages.flatMap((page) => page.data) ?? []).reverse(), [query.data]);
  const newest = messages.at(-1);
  const oldestId = messages[0]?.id;

  // ── 읽음 ────────────────────────────────────────────
  const myLastRead = room.members.find((m) => m.id === userId)?.lastReadMessageId ?? 0;
  const sentReadRef = useRef(0);
  useEffect(() => {
    if (!newest || newest.id <= myLastRead || newest.id <= sentReadRef.current) return;
    sentReadRef.current = newest.id;
    markChatRead(room.id, newest.id).catch(() => {
      sentReadRef.current = 0; // 실패하면 다음 메시지 때 다시 시도
    });
  }, [newest, myLastRead, room.id]);

  // ── 스크롤 ──────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const restoreFromBottomRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !newest) return;
    if (stickRef.current || newest.sender?.id === userId) el.scrollTop = el.scrollHeight;
  }, [newest, userId]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || restoreFromBottomRef.current === null) return;
    el.scrollTop = el.scrollHeight - restoreFromBottomRef.current;
    restoreFromBottomRef.current = null;
  }, [oldestId]);

  const loadOlder = () => {
    const el = scrollRef.current;
    if (el) restoreFromBottomRef.current = el.scrollHeight - el.scrollTop;
    void query.fetchNextPage();
  };

  // ── 수정·삭제 ───────────────────────────────────────
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<ChatMessage | null>(null);

  const update = useMutation({
    mutationFn: ({ id, content }: { id: number; content: string }) => updateChatMessage(room.id, id, content),
    onSuccess: (message) => {
      patchMessageInCache(queryClient, room.id, message.id, () => message);
      setEditingId(null);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteChatMessage(room.id, id),
    onSuccess: (_, id) => {
      patchMessageInCache(queryClient, room.id, id, (m) => ({ ...m, deleted: true, content: null }));
      void queryClient.invalidateQueries({ queryKey: chatKeys.rooms() });
      setDeleting(null);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  if (query.isPending) return <div className="flex-1"><LoadingState /></div>;
  if (query.isError) {
    return (
      <div className="flex-1 p-4">
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={(e) => {
        const el = e.currentTarget;
        stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD;
      }}
      className="min-h-0 flex-1 overflow-y-auto px-3 py-2"
      role="log"
      aria-label="대화 내용"
    >
      {query.hasNextPage && (
        <div className="flex justify-center py-2">
          <Button variant="ghost" size="sm" onClick={loadOlder} disabled={query.isFetchingNextPage}>
            {query.isFetchingNextPage && <Loader2 className="animate-spin" aria-hidden />}
            이전 메시지
          </Button>
        </div>
      )}
      {messages.length === 0 && <p className="py-16 text-center text-sm text-muted-foreground">첫 메시지를 보내 보세요.</p>}

      {messages.map((message, i) => {
        const prev = messages[i - 1];
        const showDate = !prev || messageDate(prev.createdAt) !== messageDate(message.createdAt);
        const mine = message.sender?.id === userId;
        const showName =
          !mine && message.type !== "SYSTEM" && (showDate || !prev || prev.type === "SYSTEM" || prev.sender?.id !== message.sender?.id);
        const editable =
          mine && message.type === "TEXT" && !message.deleted && now - new Date(message.createdAt).getTime() < CHAT_EDIT_LIMIT_MS;

        return (
          <Fragment key={message.id}>
            {showDate && (
              <p className="my-3 text-center text-xs text-muted-foreground">
                <span className="rounded-full bg-muted px-2.5 py-0.5">{messageDate(message.createdAt)}</span>
              </p>
            )}
            {message.type === "SYSTEM" ? (
              <p className="my-2 text-center text-xs text-muted-foreground">{message.content}</p>
            ) : editingId === message.id ? (
              <MessageEditForm
                initial={message.content ?? ""}
                pending={update.isPending}
                onCancel={() => setEditingId(null)}
                onSave={(content) => update.mutate({ id: message.id, content })}
              />
            ) : (
              <MessageBubble
                message={message}
                mine={mine}
                showName={showName}
                unread={unreadReaders(message, room.members)}
                actions={
                  editable ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                          aria-label="메시지 메뉴"
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditingId(message.id)}>수정</DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(message)}>
                          삭제
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null
                }
              />
            )}
          </Fragment>
        );
      })}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="메시지를 삭제할까요?"
        description="대화 상대에게도 '삭제된 메시지입니다'로 표시됩니다."
        confirmLabel="삭제"
        destructive
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  );
}

// 말풍선: 내 메시지는 오른쪽(강조색), 상대는 왼쪽. 옆에 [안 읽은 사람 수] [수정됨] 시각
function MessageBubble({
  message,
  mine,
  showName,
  unread,
  actions,
}: {
  message: ChatMessage;
  mine: boolean;
  showName: boolean;
  unread: number;
  actions: React.ReactNode;
}) {
  return (
    <div className={cn("group mt-1 flex flex-col", mine ? "items-end" : "items-start", showName && "mt-3")}>
      {showName && <p className="mb-1 px-1 text-xs text-muted-foreground">{message.sender?.name ?? "(알 수 없음)"}</p>}
      <div className={cn("flex max-w-[85%] items-end gap-1.5", mine && "flex-row-reverse")}>
        <p
          className={cn(
            "rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap",
            message.deleted
              ? "border text-muted-foreground italic"
              : mine
                ? "bg-primary text-primary-foreground"
                : "bg-muted",
          )}
        >
          {message.deleted ? "삭제된 메시지입니다" : message.content}
        </p>
        <span className={cn("flex shrink-0 flex-col pb-0.5 text-[11px] leading-tight text-muted-foreground", mine ? "items-end" : "items-start")}>
          {unread > 0 && (
            <span className="font-medium text-primary">
              <span className="sr-only">읽지 않은 사람 </span>
              {unread}
            </span>
          )}
          {message.editedAt && !message.deleted && <span>수정됨</span>}
          <time dateTime={message.createdAt}>{messageTime(message.createdAt)}</time>
        </span>
        {actions}
      </div>
    </div>
  );
}

// 내 메시지 고치기 (Enter 저장 · Shift+Enter 줄바꿈 · Esc 취소)
function MessageEditForm({
  initial,
  pending,
  onCancel,
  onSave,
}: {
  initial: string;
  pending: boolean;
  onCancel: () => void;
  onSave: (content: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const trimmed = value.trim();

  const save = () => {
    if (!trimmed || pending) return;
    if (trimmed === initial.trim()) return onCancel();
    onSave(trimmed);
  };

  return (
    <div className="mt-1 ml-auto w-[85%] space-y-1.5">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={CHAT_MESSAGE_MAX_LENGTH}
        rows={2}
        autoFocus
        aria-label="메시지 수정"
        className="min-h-0 resize-none text-sm"
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            save();
          }
        }}
      />
      <div className="flex justify-end gap-1">
        <Button variant="ghost" size="xs" onClick={onCancel} disabled={pending}>
          취소
        </Button>
        <Button size="xs" onClick={save} disabled={!trimmed || pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          저장
        </Button>
      </div>
    </div>
  );
}

// 현재 시각 (수정·삭제 가능 시간 5분 표시용) - interval마다 다시 그린다. 렌더 중에 Date.now()를 부르지 않기 위해 state로 둔다.
function useNow(interval: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(timer);
  }, [interval]);
  return now;
}
