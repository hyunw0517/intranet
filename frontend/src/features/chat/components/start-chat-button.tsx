"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/error-message";
import { openDirectChat } from "@/services/api/chats";
import { useAuth } from "@/providers/auth-provider";
import { chatKeys } from "../hooks/use-chats";
import { useChat } from "./chat-provider";

// 다른 화면에서 1:1 채팅 열기 (예: 사원 상세 창)
// 채팅을 못 쓰거나 본인이면 그리지 않는다.
export function StartChatButton({ userId, onOpened }: { userId: number; onOpened?: () => void }) {
  const { user } = useAuth();
  const { enabled, openRoom } = useChat();
  const queryClient = useQueryClient();

  const open = useMutation({
    mutationFn: () => openDirectChat(userId),
    onSuccess: (room) => {
      queryClient.setQueryData(chatKeys.room(room.id), room);
      void queryClient.invalidateQueries({ queryKey: chatKeys.rooms() });
      openRoom(room.id);
      onOpened?.();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  if (!enabled || user?.id === userId) return null;

  return (
    <Button onClick={() => open.mutate()} disabled={open.isPending}>
      {open.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <MessageCircle aria-hidden />}
      채팅하기
    </Button>
  );
}
