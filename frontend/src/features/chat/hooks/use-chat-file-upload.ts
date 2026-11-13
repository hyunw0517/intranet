"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/error-message";
import { sendChatFile, sendChatImages } from "@/services/api/chats";
import { fileKindOf, filesSent, groupForSend, validateChatFiles } from "../chat-files";
import { addMessageToCache, chatKeys } from "./use-chats";

export interface ChatUploadProgress {
  done: number; // 업로드가 끝난 파일 수
  total: number; // 이번에 고른 파일 수
}

// 파일 보내기 (첨부 버튼·끌어다 놓기 공용) - 방 화면이 만들어 입력란에 넘긴다.
// - 이미지는 한 요청(묶음 메시지), 동영상·그 밖의 파일은 하나씩 차례로 보낸다.
// - 진행 상황: 파일 하나가 끝날 때마다 done이 1씩 오른다 → 여러 개면 스피너 아래 "3/7", 다 끝나면 null
// - 보낸 메시지는 응답으로 바로 캐시에 넣는다 (소켓으로 같은 메시지가 와도 id로 걸러짐)
// - 하나가 실패해도 나머지는 계속 보내고, 실패한 것만 안내한다.
export function useChatFileUpload(roomId: number) {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<ChatUploadProgress | null>(null);

  const upload = async (picked: File[]) => {
    if (progress || picked.length === 0) return;

    const error = validateChatFiles(picked);
    if (error) {
      toast.error(error);
      return;
    }

    const total = picked.length;
    let done = 0;
    setProgress({ done, total });

    try {
      for (const files of groupForSend(picked)) {
        try {
          const onProgress = (loaded: number) => setProgress({ done: done + filesSent(files, loaded), total });
          // 이미지 묶음은 이미지 경로(장당 20MB), 나머지는 파일 경로(200MB)
          const message =
            fileKindOf(files[0].name) === "image"
              ? await sendChatImages(roomId, files, onProgress)
              : await sendChatFile(roomId, files[0], onProgress);
          done += files.length;
          setProgress({ done, total });
          addMessageToCache(queryClient, message);
        } catch (e) {
          const label = files.length > 1 ? `이미지 ${files.length}장` : files[0].name;
          toast.error(`${label}: ${getErrorMessage(e)}`);
        }
      }
    } finally {
      setProgress(null);
      void queryClient.invalidateQueries({ queryKey: chatKeys.rooms() });
    }
  };

  return { upload, progress };
}

export type ChatFileUpload = ReturnType<typeof useChatFileUpload>;
