"use client";

import { useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { FileDownloadConfirmDialog } from "@/components/common/file-download-confirm-dialog";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/error-message";
import { formatFileSize } from "@/lib/format";
import { downloadPostFile } from "@/services/api/posts";
import type { FileInfo } from "@/types/file";

// 게시글 상세의 첨부파일 목록
// 다운로드는 Bearer 헤더가 필요해 <a href>를 쓸 수 없다. → fetch로 Blob을 받아 임시 주소(blob:)를 만든 뒤 내려받는다.
// 받기 전에 한 번 묻는다 - 채팅과 같은 확인 창·보안 경고 (공용 FileDownloadConfirmDialog, 2026-11-14 사용자 요청)
export function PostAttachments({ boardId, postId, files }: { boardId: number; postId: number; files: FileInfo[] }) {
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  // 확인 창: 대상 파일과 열림을 따로 둔다 (닫히는 동안에도 제목의 파일명이 비지 않게)
  const [target, setTarget] = useState<FileInfo | null>(null);
  const [asking, setAsking] = useState(false);

  if (files.length === 0) return null;

  const download = async (file: FileInfo) => {
    setDownloadingId(file.id);
    try {
      const blob = await downloadPostFile(boardId, postId, file.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.originalName; // 서버 헤더 대신 목록의 원본 파일명을 쓴다.
      document.body.appendChild(a);
      a.click();
      a.remove();
      // 클릭 직후 바로 해제하면 일부 브라우저에서 저장이 시작되기 전에 끊길 수 있어 조금 뒤에 해제
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setDownloadingId(null);
      setAsking(false);
    }
  };

  return (
    <section aria-labelledby="post-attachments-title" className="grid gap-2">
      <h2 id="post-attachments-title" className="text-sm font-medium">
        첨부파일 <span className="font-normal text-muted-foreground tabular-nums">{files.length}</span>
      </h2>
      <ul className="divide-y rounded-lg border">
        {files.map((file) => {
          const ask = () => {
            setTarget(file);
            setAsking(true);
          };
          return (
          <li key={file.id} className="flex items-center gap-2 px-3 py-2 text-sm select-none">
            {/* 파일 아이콘·파일명도 내려받기 링크 (2026-11-14 사용자 요청) */}
            <button
              type="button"
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left hover:underline disabled:cursor-default"
              title={file.originalName}
              disabled={downloadingId === file.id}
              onClick={ask}
            >
              <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{file.originalName}</span>
            </button>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatFileSize(file.size)}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              className="cursor-pointer"
              aria-label={`${file.originalName} 내려받기`}
              title="내려받기"
              disabled={downloadingId === file.id}
              onClick={ask}
            >
              {downloadingId === file.id ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
            </Button>
          </li>
          );
        })}
      </ul>
      {/* 목록 밖에 하나만 둔다 (버튼 안에 두면 [다운로드] 클릭이 바깥 버튼까지 올라가 창이 다시 열림) */}
      <FileDownloadConfirmDialog
        fileName={target?.originalName ?? ""}
        open={asking}
        onOpenChange={setAsking}
        pending={target !== null && downloadingId === target.id}
        onConfirm={() => target && void download(target)}
      />
    </section>
  );
}
