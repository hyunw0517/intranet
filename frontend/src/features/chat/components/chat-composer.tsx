"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, SendHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/error-message";
import { CHAT_MESSAGE_MAX_LENGTH, sendChatMessage } from "@/services/api/chats";
import { addMessageToCache, chatKeys } from "../hooks/use-chats";

// 메시지 입력 (Enter 보내기 · Shift+Enter 줄바꿈)
// - 한글 입력 중(조합 중) Enter는 글자 확정이라 보내지 않는다(isComposing). 안 막으면 마지막 글자가 한 번 더 보내진다.
// - 보낸 메시지는 응답으로 바로 캐시에 넣는다. 같은 메시지가 소켓으로도 오지만 id로 걸러 한 번만 보인다.
export function ChatComposer({ roomId, readOnly }: { roomId: number; readOnly: boolean }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const trimmed = value.trim();

  const send = useMutation({
    mutationFn: (content: string) => sendChatMessage(roomId, content),
    onSuccess: (message) => {
      addMessageToCache(queryClient, message);
      void queryClient.invalidateQueries({ queryKey: chatKeys.rooms() });
      setValue("");
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  if (readOnly) {
    return (
      <p className="shrink-0 border-t px-4 py-3 text-center text-sm text-muted-foreground">
        대화 상대가 채팅을 사용할 수 없어 메시지를 보낼 수 없습니다.
      </p>
    );
  }

  const submit = () => {
    if (!trimmed || send.isPending) return;
    send.mutate(trimmed);
  };

  return (
    <form
      className="flex shrink-0 items-end gap-2 border-t p-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={CHAT_MESSAGE_MAX_LENGTH}
        rows={1}
        placeholder="메시지 입력"
        aria-label="메시지 입력"
        className="max-h-32 min-h-9 resize-none py-2 text-sm field-sizing-content"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <Button type="submit" size="icon" disabled={!trimmed || send.isPending} aria-label="보내기">
        {send.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <SendHorizontal />}
      </Button>
    </form>
  );
}
