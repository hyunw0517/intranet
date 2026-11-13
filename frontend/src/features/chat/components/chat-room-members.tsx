"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/error-message";
import { inviteChatMembers, kickChatMember, type ChatRoomDetail, type ChatRoomMember, type ChatUser } from "@/services/api/chats";
import { roomTitle, userMeta } from "../chat-display";
import { chatKeys } from "../hooks/use-chats";
import { ChatPanelHeader } from "./chat-window";
import { ChatUserPicker } from "./chat-user-picker";

// 참여자 목록 - 그룹 방장은 다른 사람을 내보낼 수 있다(본인은 나가기 사용)
export function ChatMembersPanel({ room, userId, onBack }: { room: ChatRoomDetail; userId: number; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [kicking, setKicking] = useState<ChatRoomMember | null>(null);
  const canKick = room.type === "GROUP" && room.myRole === "OWNER";

  const kick = useMutation({
    mutationFn: (targetId: number) => kickChatMember(room.id, targetId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.room(room.id) });
      setKicking(null);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <>
      <ChatPanelHeader title={`참여자 ${room.members.length}명`} subtitle={roomTitle(room)} onBack={onBack} />
      <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
        {room.members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm">
                <span className="truncate">{m.name}</span>
                {m.id === userId && <span className="text-xs text-muted-foreground">(나)</span>}
                {room.type === "GROUP" && m.role === "OWNER" && <Badge variant="secondary">방장</Badge>}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {m.active ? userMeta(m) || "소속 없음" : "채팅을 사용할 수 없는 회원"}
              </span>
            </span>
            {canKick && m.id !== userId && (
              <Button variant="ghost" size="xs" className="text-destructive" onClick={() => setKicking(m)}>
                내보내기
              </Button>
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={kicking !== null}
        onOpenChange={(open) => !open && setKicking(null)}
        title={`${kicking?.name ?? ""}님을 내보낼까요?`}
        description="내보낸 사람의 목록에서 이 채팅방이 사라집니다. 다시 초대할 수 있습니다."
        confirmLabel="내보내기"
        destructive
        pending={kick.isPending}
        onConfirm={() => kicking && kick.mutate(kicking.id)}
      />
    </>
  );
}

// 초대 (그룹, 참여자 누구나) - 다시 초대된 사람은 초대 시점 이후 메시지만 본다.
export function ChatInvitePanel({ room, onDone }: { room: ChatRoomDetail; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<ChatUser[]>([]);

  const invite = useMutation({
    mutationFn: () => inviteChatMembers(room.id, selected.map((u) => u.id)),
    onSuccess: (updated) => {
      queryClient.setQueryData(chatKeys.room(room.id), updated);
      void queryClient.invalidateQueries({ queryKey: chatKeys.rooms() });
      onDone();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <>
      <ChatPanelHeader title="대화 상대 초대" subtitle={roomTitle(room)} onBack={onDone} />
      <ChatUserPicker selected={selected} onChange={setSelected} excludeIds={room.members.map((m) => m.id)} />
      <div className="border-t p-3">
        <Button className="w-full" disabled={selected.length === 0 || invite.isPending} onClick={() => invite.mutate()}>
          {invite.isPending && <Loader2 className="animate-spin" aria-hidden />}
          {selected.length === 0 ? "초대할 사람을 고르세요" : `${selected.length}명 초대`}
        </Button>
      </div>
    </>
  );
}
