"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Paperclip, SendHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/error-message";
import { CHAT_FILE_EXTENSIONS, CHAT_MESSAGE_MAX_LENGTH, sendChatMessage } from "@/services/api/chats";
import type { ChatFileUpload } from "../hooks/use-chat-file-upload";
import { addMessageToCache, chatKeys } from "../hooks/use-chats";

// 메시지 입력 (Enter 보내기 · Shift+Enter 줄바꿈)
// - 한글 입력 중(조합 중) Enter는 글자 확정이라 보내지 않는다(isComposing). 안 막으면 마지막 글자가 한 번 더 보내진다.
// - 보낸 메시지는 응답으로 바로 캐시에 넣는다. 같은 메시지가 소켓으로도 오지만 id로 걸러 한 번만 보인다.
// - 파일: [클립] 버튼(여러 개 선택 가능) 또는 방 화면에 끌어다 놓기. 보내는 동안 버튼 자리에 스피너, 여러 개면 아래에 "3/7"
export function ChatComposer({ roomId, readOnly, upload }: { roomId: number; readOnly: boolean; upload: ChatFileUpload }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const trimmed = value.trim();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { progress } = upload;

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
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={CHAT_FILE_EXTENSIONS.join(",")}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = ""; // 같은 파일을 다시 골라도 change가 오게
          void upload.upload(files);
        }}
      />
      {progress ? (
        <div className="flex h-9 w-9 shrink-0 flex-col items-center justify-center" role="status" aria-live="polite">
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
          {progress.total > 1 && (
            <span className="text-[10px] leading-none text-muted-foreground tabular-nums">
              {progress.done}/{progress.total}
            </span>
          )}
          <span className="sr-only">
            파일 보내는 중{progress.total > 1 ? ` (${progress.done}/${progress.total})` : ""}
          </span>
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground"
          onClick={() => fileInputRef.current?.click()}
          aria-label="파일 보내기"
        >
          <Paperclip />
        </Button>
      )}
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
