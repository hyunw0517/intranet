"use client";

import { useMemo, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { ErrorState, LoadingState } from "@/components/common/data-state";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/lib/format";
import type { ChatRoomDetail, ChatRoomFile } from "@/services/api/chats";
import { messageDate, roomTitle } from "../chat-display";
import { useChatRoomFiles } from "../hooks/use-chats";
import { ChatImageViewer, ChatThumbnail, FileKindIcon, useChatFileDownload } from "./chat-file-content";
import { ChatPanelHeader } from "./chat-window";

// 파일 보관함 (방 메뉴 → 파일 보관함, 2026-11-13 사용자 결정)
// - 이 방에서 주고받은 파일을 최신순 격자로. 이미지는 미리보기(없으면 엑스박스), 그 밖의 파일은 아이콘(동영상 · 압축 · 파일) + 이름
// - 이미지를 누르면 원본 보기, 그 밖의 파일은 [내려받기]
// - 보이는 범위는 대화와 같다(참여 시점 이후, 삭제된 메시지의 파일은 빠짐)
export function ChatRoomFilesPanel({ room, onBack }: { room: ChatRoomDetail; onBack: () => void }) {
  const query = useChatRoomFiles(room.id);
  const files = useMemo(() => query.data?.pages.flatMap((page) => page.data) ?? [], [query.data]);
  const [viewing, setViewing] = useState<ChatRoomFile | null>(null);

  return (
    <>
      <ChatPanelHeader title="파일 보관함" subtitle={roomTitle(room)} onBack={onBack} />
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : files.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">주고받은 파일이 없습니다.</p>
        ) : (
          <>
            <ul className="grid grid-cols-3 gap-1.5" aria-label="파일 목록">
              {files.map((file) => (
                <li key={file.id}>
                  {file.kind === "image" ? (
                    <button
                      type="button"
                      onClick={() => setViewing(file)}
                      className="block aspect-square w-full cursor-pointer overflow-hidden rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      aria-label={`${file.name} 크게 보기`}
                      title={`${file.name} · ${file.senderName ?? ""} · ${messageDate(file.createdAt)}`}
                    >
                      <ChatThumbnail roomId={room.id} file={file} />
                    </button>
                  ) : (
                    <FileTile roomId={room.id} file={file} />
                  )}
                </li>
              ))}
            </ul>
            {query.hasNextPage && (
              <div className="flex justify-center pt-3">
                <Button variant="ghost" size="sm" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
                  {query.isFetchingNextPage && <Loader2 className="animate-spin" aria-hidden />}더 보기
                </Button>
              </div>
            )}
          </>
        )}
      </div>
      {viewing && <ChatImageViewer roomId={room.id} file={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

// 이미지가 아닌 파일 칸: 가운데 회색 아이콘 + 이름 · 크기, 오른쪽 위 다운로드 아이콘
// 칸 전체가 하나의 내려받기 버튼이고, 글자는 드래그로 선택되지 않는다 (2026-11-14 사용자 요청)
// 누르면 한 번 묻고 받는다. 확인 창은 버튼 바깥에 그린다 (useChatFileDownload 주석)
function FileTile({ roomId, file }: { roomId: number; file: ChatRoomFile }) {
  const { download, pending, confirmDialog } = useChatFileDownload(roomId, file);
  return (
    <>
      {confirmDialog}
      <button
        type="button"
        onClick={download}
        disabled={pending}
        aria-label={`${file.name} 내려받기`}
        title={`${file.name} · ${file.senderName ?? ""} · ${messageDate(file.createdAt)}`}
        className="relative flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-md border bg-muted/40 p-1.5 text-center select-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-wait"
      >
        <FileKindIcon file={file} className="size-7 text-muted-foreground" strokeWidth={1.5} />
        <span className="line-clamp-2 w-full text-[11px] leading-tight break-all">{file.name}</span>
        <span className="text-[10px] text-muted-foreground tabular-nums">{formatFileSize(file.size)}</span>
        <span className="absolute top-1.5 right-1.5 text-muted-foreground" aria-hidden>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        </span>
      </button>
    </>
  );
}
