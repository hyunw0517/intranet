"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getErrorMessage } from "@/lib/error-message";
import {
  CHAT_GROUP_NAME_MAX_LENGTH,
  createGroupChat,
  openDirectChat,
  type ChatRoomDetail,
  type ChatUser,
} from "@/services/api/chats";
import { chatKeys } from "../hooks/use-chats";
import { ChatPanelHeader } from "./chat-window";
import { ChatUserPicker } from "./chat-user-picker";
import { useChat } from "./chat-provider";

// 새 채팅 (features.md 8.3)
// - 1명 고르면 1:1: 두 사람의 방이 이미 있으면 그 방이 열린다(나갔던 방이면 다시 참여, 이전 기록은 보이지 않음).
// - 2명 이상 고르면 그룹: 본인 포함 3명 이상, 이름은 선택(1~50자). 만든 사람이 방장.
//   이름을 비우면 서버가 참여자(본인 포함) 이름으로 만든다. 예) "Michael Johnson, 관리자, 신민아 외 2명"
export function ChatNewRoom() {
  const { showList, openRoom } = useChat();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<ChatUser[]>([]);
  const [name, setName] = useState("");
  const isGroup = selected.length >= 2;

  const create = useMutation({
    mutationFn: (): Promise<ChatRoomDetail> =>
      isGroup
        ? createGroupChat({ name: name.trim() || undefined, userIds: selected.map((u) => u.id) })
        : openDirectChat(selected[0].id),
    onSuccess: (room) => {
      queryClient.setQueryData(chatKeys.room(room.id), room);
      void queryClient.invalidateQueries({ queryKey: chatKeys.rooms() });
      openRoom(room.id);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const canSubmit = selected.length > 0 && !create.isPending;

  return (
    <>
      <ChatPanelHeader title="새 채팅" subtitle="1명은 1:1, 2명 이상은 그룹 채팅" onBack={showList} />
      <ChatUserPicker selected={selected} onChange={setSelected} />
      <form
        className="space-y-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) create.mutate();
        }}
      >
        {isGroup && (
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={CHAT_GROUP_NAME_MAX_LENGTH}
            placeholder="그룹 채팅방 이름 (비우면 참여자 이름)"
            aria-label="그룹 채팅방 이름 (선택)"
          />
        )}
        <Button type="submit" className="w-full" disabled={!canSubmit}>
          {create.isPending && <Loader2 className="animate-spin" aria-hidden />}
          {selected.length === 0 ? "대화 상대를 고르세요" : isGroup ? `그룹 채팅 만들기 (${selected.length + 1}명)` : `${selected[0].name}님과 1:1 채팅`}
        </Button>
      </form>
    </>
  );
}
