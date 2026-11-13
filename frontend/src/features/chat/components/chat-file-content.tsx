"use client";

import { useEffect, useState } from "react";
import { Download, FileText, FolderArchive, Loader2, Video, X } from "lucide-react";
import { toast } from "sonner";
import { FileDownloadConfirmDialog } from "@/components/common/file-download-confirm-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getErrorMessage } from "@/lib/error-message";
import { formatFileSize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { fetchChatFile, fetchChatThumbnail, type ChatFile, type ChatMessage } from "@/services/api/chats";
import { isArchive, saveBlob } from "../chat-files";

// 파일 메시지 내용 (features.md 8.4)
// - 이미지: 썸네일 격자 (1장은 크게, 2장은 2열, 3장 이상은 3열). 누르면 원본 보기
// - 동영상·그 밖의 파일: 아이콘 + 이름 + 크기, 누르면 내려받기
// 썸네일·원본은 Bearer 헤더가 필요해 Blob으로 받아 임시 blob: 주소로 그린다.
export function ChatFileContent({ message, mine }: { message: ChatMessage; mine: boolean }) {
  const [viewing, setViewing] = useState<ChatFile | null>(null);
  const images = message.files.filter((f) => f.kind === "image");
  const others = message.files.filter((f) => f.kind !== "image");

  return (
    <div className={cn("grid gap-1", mine ? "justify-items-end" : "justify-items-start")}>
      {images.length > 0 && (
        <div className={cn("grid gap-1", images.length === 1 ? "w-52" : images.length === 2 ? "w-56 grid-cols-2" : "w-60 grid-cols-3")}>
          {images.map((file) => (
            <button
              key={file.id}
              type="button"
              onClick={() => setViewing(file)}
              className="block aspect-square w-full cursor-pointer overflow-hidden rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label={`${file.name} 크게 보기`}
            >
              <ChatThumbnail roomId={message.roomId} file={file} />
            </button>
          ))}
        </div>
      )}
      {others.map((file) => (
        <ChatFileRow key={file.id} roomId={message.roomId} file={file} />
      ))}
      {viewing && <ChatImageViewer roomId={message.roomId} file={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

// 미리보기를 만들 수 없는 파일(가짜·깨진 이미지)이나 불러오지 못한 경우: 밝은 회색 바탕 + 가운데 어두운 회색 X (2026-11-13 사용자 결정)
export function BrokenImage({ className }: { className?: string }) {
  return (
    <span className={cn("flex size-full items-center justify-center bg-muted", className)} role="img" aria-label="미리보기 없음">
      <X className="size-1/3 max-h-10 max-w-10 text-muted-foreground" strokeWidth={1.5} aria-hidden />
    </span>
  );
}

// Blob → 임시 주소 (화면에서 사라지면 해제). 실패하면 "error"
function useBlobUrl(load: () => Promise<Blob>, key: string) {
  const [state, setState] = useState<{
    key: string;
    url: string | null;
    failed: boolean;
  }>({ key, url: null, failed: false });

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    load()
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setState({ key, url, failed: false });
      })
      .catch(() => {
        if (!cancelled) setState({ key, url: null, failed: true });
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
    // load는 key가 같으면 같은 요청이다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // 다른 파일로 바뀐 직후에는 이전 결과를 쓰지 않는다
  return state.key === key ? state : { key, url: null, failed: false };
}

export function ChatThumbnail({ roomId, file }: { roomId: number; file: ChatFile }) {
  const { url, failed } = useBlobUrl(() => fetchChatThumbnail(roomId, file.id), `thumb:${roomId}:${file.id}`);
  const [broken, setBroken] = useState(false);

  if (failed || broken) return <BrokenImage />;
  if (!url) return <span className="block size-full animate-pulse bg-muted" aria-hidden />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- blob: 주소라 next/image 최적화 대상이 아니다
    <img src={url} alt={file.name} className="size-full object-cover" onError={() => setBroken(true)} />
  );
}

// 원본 보기 (이미지). 원본을 그릴 수 없으면 엑스박스, 내려받기는 그대로 가능
export function ChatImageViewer({ roomId, file, onClose }: { roomId: number; file: ChatFile; onClose: () => void }) {
  const { url, failed } = useBlobUrl(() => fetchChatFile(roomId, file.id), `file:${roomId}:${file.id}`);
  const [broken, setBroken] = useState(false);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-6 text-base">{file.name}</DialogTitle>
        </DialogHeader>
        <div className="flex max-h-[70dvh] min-h-48 items-center justify-center overflow-hidden rounded-md">
          {failed || broken ? (
            <BrokenImage className="h-48 rounded-md" />
          ) : url ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob: 주소
            <img src={url} alt={file.name} className="max-h-[70dvh] max-w-full object-contain" onError={() => setBroken(true)} />
          ) : (
            <Loader2 className="animate-spin text-muted-foreground" aria-hidden />
          )}
        </div>
        <DialogFooter>
          <DownloadButton roomId={roomId} file={file} variant="outline" />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// 이미지가 아닌 파일의 아이콘: 동영상 · 압축 파일(지퍼 달린 폴더) · 그 밖의 파일 (2026-11-13 사용자 결정)
// (React Compiler 규칙상 렌더 중에 컴포넌트를 골라 담지 않고, 조건부로 바로 그린다)
export function FileKindIcon({ file, className, strokeWidth }: { file: ChatFile; className?: string; strokeWidth?: number }) {
  const props = { className, strokeWidth, "aria-hidden": true } as const;
  if (file.kind === "video") return <Video {...props} />;
  if (isArchive(file.name)) return <FolderArchive {...props} />;
  return <FileText {...props} />;
}

// 파일 내려받기 (줄·칸·원본 보기의 [내려받기] 공용) - 받기 전에 항상 한 번 묻는다 (2026-11-14 사용자 요청, 보안 차원)
// 이미지도 묻는다: 확장자만 이미지인 가짜 파일도 "이미지"로 분류되므로, 이미지만 빼면 그 파일은 묻지 않고 받아진다.
// 확인 창(confirmDialog)은 공용 FileDownloadConfirmDialog(게시판과 같은 문구·경고)이고, 누르는 버튼 "바깥"에 그려야 한다.
export function useChatFileDownload(roomId: number, file: ChatFile) {
  const [pending, setPending] = useState(false);
  const [asking, setAsking] = useState(false);

  const save = async () => {
    if (pending) return;
    setPending(true);
    try {
      saveBlob(await fetchChatFile(roomId, file.id), file.name);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setPending(false);
      setAsking(false);
    }
  };

  const download = () => setAsking(true);

  const confirmDialog = (
    <FileDownloadConfirmDialog fileName={file.name} open={asking} onOpenChange={setAsking} pending={pending} onConfirm={() => void save()} />
  );

  return { download, pending, confirmDialog };
}

// 동영상·파일 한 줄 - 줄 전체(아이콘·이름·크기·다운로드 아이콘)가 하나의 내려받기 버튼 (2026-11-14 사용자 요청)
// 글자는 드래그로 선택되지 않게 한다(select-none). 버튼 안에 버튼을 둘 수 없어 다운로드 아이콘은 표시만 한다.
// 누르면 한 번 묻고 받는다 (확인 창은 버튼 바깥, 위 useChatFileDownload 주석)
function ChatFileRow({ roomId, file }: { roomId: number; file: ChatFile }) {
  const { download, pending, confirmDialog } = useChatFileDownload(roomId, file);
  return (
    <>
      {confirmDialog}
      <button
        type="button"
        onClick={download}
        disabled={pending}
        aria-label={`${file.name} 내려받기`}
        title={file.name}
        className="flex w-60 max-w-full cursor-pointer items-center gap-2 rounded-xl border bg-background px-3 py-2 text-left select-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-wait"
      >
        <FileKindIcon file={file} className="size-5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{file.name}</span>
          <span className="block text-xs text-muted-foreground tabular-nums">{formatFileSize(file.size)}</span>
        </span>
        <span className="flex size-7 shrink-0 items-center justify-center text-muted-foreground" aria-hidden>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        </span>
      </button>
    </>
  );
}

export function DownloadButton({
  roomId,
  file,
  iconOnly = false,
  variant = "ghost",
}: {
  roomId: number;
  file: ChatFile;
  iconOnly?: boolean;
  variant?: "ghost" | "outline";
}) {
  const { download, pending, confirmDialog } = useChatFileDownload(roomId, file);

  return (
    <>
      {confirmDialog}
      <Button
        type="button"
        variant={variant}
        size={iconOnly ? "icon-sm" : "sm"}
        className="cursor-pointer"
        onClick={download}
        disabled={pending}
        aria-label={`${file.name} 내려받기`}
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Download />}
        {!iconOnly && "내려받기"}
      </Button>
    </>
  );
}
