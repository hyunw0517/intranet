"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Loader2, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/error-message";
import { formatFileSize } from "@/lib/format";
import {
  ATTACHMENT_EXTENSIONS,
  checkUploadFile,
  MAX_ATTACHMENT_SIZE,
  MAX_ATTACHMENTS,
  uploadAttachment,
} from "@/services/api/files";
import type { FileInfo } from "@/types/file";

interface AttachmentFieldProps {
  value: FileInfo[]; // 수정: 기존 첨부 + 새로 올린 파일 / 작성: 새로 올린 파일
  onChange: (files: FileInfo[]) => void;
  onUploadingChange?: (uploading: boolean) => void; // 업로드 중에는 폼 제출을 막는다.
}

// 게시글 첨부파일 입력
// 고르는 즉시 하나씩 업로드하고(POST /common/files/attachments), 응답 id 목록을 글 저장 시 attachmentIds로 보낸다.
// 목록에서 빼면 저장할 때 서버가 연결을 끊고 삭제한다. (저장 전에는 서버에 아무 변화 없음)
export function AttachmentField({ value, onChange, onUploadingChange }: AttachmentFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  // 업로드 중 onChange가 여러 번 불려도 최신 목록에 이어 붙이도록 ref로 들고 있는다.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);

  useEffect(() => {
    onUploadingChange?.(uploading);
  }, [uploading, onUploadingChange]);

  const full = value.length >= MAX_ATTACHMENTS;

  const handleFiles = async (picked: File[]) => {
    const room = MAX_ATTACHMENTS - latest.current.length;
    if (picked.length > room) {
      toast.error(`첨부파일은 최대 ${MAX_ATTACHMENTS}개까지 등록할 수 있습니다.`);
    }
    const files = picked.slice(0, Math.max(room, 0));
    if (files.length === 0) return;

    setUploading(true);
    try {
      for (const file of files) {
        const message = checkUploadFile(file, ATTACHMENT_EXTENSIONS, MAX_ATTACHMENT_SIZE);
        if (message) {
          toast.error(message);
          continue;
        }
        try {
          const uploaded = await uploadAttachment(file);
          const next = [...latest.current, uploaded];
          latest.current = next;
          onChange(next);
        } catch (error) {
          toast.error(`${file.name}: ${getErrorMessage(error)}`);
        }
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label id="post-attachments-label">
          첨부파일
          <span className="ml-1 font-normal text-muted-foreground tabular-nums">
            {value.length}/{MAX_ATTACHMENTS}
          </span>
        </Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading || full}
          onClick={() => inputRef.current?.click()}
          aria-describedby="post-attachments-hint"
        >
          {uploading ? <Loader2 className="animate-spin" aria-hidden /> : <Paperclip aria-hidden />}
          {uploading ? "올리는 중" : "파일 추가"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          accept={ATTACHMENT_EXTENSIONS.join(",")}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = ""; // 같은 파일을 다시 고를 수 있게
            if (files.length > 0) void handleFiles(files);
          }}
        />
      </div>
      <p id="post-attachments-hint" className="text-xs text-muted-foreground">
        파일당 100MB 이하 · 문서(pdf, hwp, office), 이미지, 동영상, txt, csv, zip
      </p>

      {value.length > 0 && (
        <ul aria-labelledby="post-attachments-label" className="divide-y rounded-lg border">
          {value.map((file) => (
            <li key={file.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate" title={file.originalName}>
                {file.originalName}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatFileSize(file.size)}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`${file.originalName} 빼기`}
                title="빼기"
                onClick={() => onChange(value.filter((f) => f.id !== file.id))}
              >
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
