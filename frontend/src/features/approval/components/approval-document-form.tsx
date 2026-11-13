"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { FormError, FormField } from "@/components/common/form-field";
import { AttachmentField } from "@/features/board/components/attachment-field";
import { RichTextEditor } from "@/features/board/components/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LeaveFields } from "@/features/leave/components/leave-fields";
import { validateLeave, type LeaveFormValues } from "@/features/leave/leave-rules";
import { LINE_SCOPE_LABEL, type ApprovalDocumentType } from "@/types/approval";
import type { FileInfo } from "@/types/file";
import { TITLE_MAX } from "../approval-rules";
import { useUsableLines } from "../hooks/use-approvals";
import { ApprovalLineEditor, groupStepRows, type LineStepGroup } from "./approval-line-editor";

export interface ApprovalFormValues {
  title: string;
  content: string;
  steps: LineStepGroup[]; // 결재 단계 (여러 명 = 병렬)
  templateId: number | null; // 불러온 결재라인 (기록용)
  files: FileInfo[];
  leave: LeaveFormValues | null; // 휴가 신청일 때만 (제목·본문 대신)
}

export const EMPTY_APPROVAL_FORM: ApprovalFormValues = { title: "", content: "", steps: [], templateId: null, files: [], leave: null };

interface ApprovalDocumentFormProps {
  documentType: ApprovalDocumentType; // LEAVE면 제목·본문 대신 휴가 입력 칸 (제목은 서버가 유형·기간으로 만든다)
  initial: ApprovalFormValues;
  requesterId: number; // 기안자 본인은 결재자로 고를 수 없다
  cancelHref: string;
  pending: boolean;
  serverError: string | null;
  onSave: (values: ApprovalFormValues, submit: boolean) => void;
}

// 결재 문서 작성·수정 폼 (임시저장 / 상신)
// - 임시저장: 제목만 있으면 된다 (결재자 0명 허용)
// - 상신: 결재자 1명 이상. 저장 후 상신을 연달아 호출한다 (API가 나뉘어 있음, features.md 7.5)
// - 본문 이미지는 쓰지 않는다 (공개 주소라 결재 문서에 맞지 않음 - 서버도 제거). 파일은 첨부로.
// - 휴가 신청: 제목·본문 대신 휴가 입력 칸. 임시저장도 휴가 항목 검사가 필요하다(서버가 저장 때 일수를 계산).
export function ApprovalDocumentForm({ documentType, initial, requesterId, cancelHref, pending, serverError, onSave }: ApprovalDocumentFormProps) {
  const isLeave = documentType === "LEAVE";
  const [leave, setLeave] = useState(initial.leave);
  const [title, setTitle] = useState(initial.title);
  const [content, setContent] = useState(initial.content);
  const [contentEmpty, setContentEmpty] = useState(!initial.content);
  const [steps, setSteps] = useState(initial.steps);
  const [templateId, setTemplateId] = useState(initial.templateId);
  const [files, setFiles] = useState(initial.files);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; approvers?: string; leave?: string }>({});

  const lines = useUsableLines();

  const loadTemplate = (id: number) => {
    const line = lines.data?.find((l) => l.id === id);
    if (!line) return;
    // 삭제·퇴사한 결재자와 기안자 본인은 빼고 불러온다 (서버 규칙과 같음, 그래서 빈 단계는 없앤다). 단계 묶음은 그대로.
    const groups = groupStepRows(line.steps, (s) =>
      s.usable && s.approverId !== requesterId
        ? { approverId: s.approverId, name: s.approverName ?? "", departmentName: s.departmentName, positionName: s.positionName, jobTitleName: s.jobTitleName }
        : null,
    );
    setSteps(groups);
    setTemplateId(id);
    const loaded = groups.reduce((n, g) => n + g.approvers.length, 0);
    if (loaded < line.steps.length) {
      toast.warning(`결재자로 지정할 수 없는 ${line.steps.length - loaded}명을 빼고 불러왔습니다.`);
    }
    if (errors.approvers) setErrors((prev) => ({ ...prev, approvers: undefined }));
  };

  const save = (submit: boolean) => {
    if (pending || uploading) return;
    const next: typeof errors = {};
    if (isLeave) {
      const leaveError = leave ? validateLeave(leave) : "휴가 정보를 입력하세요.";
      if (leaveError) next.leave = leaveError;
    } else if (!title.trim()) {
      next.title = "제목을 입력하세요.";
    }
    if (submit && steps.length === 0) next.approvers = "상신하려면 결재자를 1명 이상 지정하세요.";
    setErrors(next);
    if (next.title || next.approvers || next.leave) return;

    onSave({ title: title.trim(), content: contentEmpty ? "" : content, steps, templateId, files, leave: isLeave ? leave : null }, submit);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(true);
      }}
      className="grid gap-5"
      noValidate
    >
      <FormError message={serverError} />

      {isLeave && leave ? (
        <LeaveFields
          value={leave}
          onChange={(nextLeave) => {
            setLeave(nextLeave);
            if (errors.leave) setErrors((prev) => ({ ...prev, leave: undefined }));
          }}
          error={errors.leave}
        />
      ) : (
        <FormField id="approval-title" label="제목" required error={errors.title}>
          <Input
            id="approval-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={TITLE_MAX}
            aria-invalid={!!errors.title}
            aria-describedby={errors.title ? "approval-title-message" : undefined}
            className="h-9"
            autoFocus={!initial.title}
          />
        </FormField>
      )}

      <section className="grid gap-2" aria-labelledby="approval-line-label">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <Label id="approval-line-label">
            결재선
            <span className="text-destructive" aria-hidden>
              *
            </span>
          </Label>
          <Select
            value={templateId ? String(templateId) : ""}
            onValueChange={(v) => loadTemplate(Number(v))}
            disabled={!lines.data || lines.data.length === 0}
          >
            <SelectTrigger size="sm" className="w-56" aria-label="결재라인 불러오기">
              <SelectValue placeholder={lines.data?.length === 0 ? "불러올 결재라인 없음" : "결재라인 불러오기"} />
            </SelectTrigger>
            <SelectContent>
              {lines.data?.map((l) => (
                <SelectItem key={l.id} value={String(l.id)}>
                  [{LINE_SCOPE_LABEL[l.scope]}] {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ApprovalLineEditor
          value={steps}
          onChange={(next) => {
            setSteps(next);
            if (errors.approvers && next.length > 0) setErrors((prev) => ({ ...prev, approvers: undefined }));
          }}
          excludeIds={[requesterId]}
          labelledBy="approval-line-label"
        />
        {errors.approvers && (
          <p role="alert" className="text-xs text-destructive">
            {errors.approvers}
          </p>
        )}
      </section>

      {/* 휴가 신청은 본문이 없다 (휴가 정보 + 사유로 결재) */}
      {!isLeave && (
        <div className="grid gap-1.5">
          <Label id="approval-content-label">내용</Label>
          <RichTextEditor
            id="approval-content"
            labelledBy="approval-content-label"
            initialContent={initial.content}
            allowImages={false}
            onChange={(html, isEmpty) => {
              setContent(html);
              setContentEmpty(isEmpty);
            }}
          />
        </div>
      )}

      <AttachmentField value={files} onChange={setFiles} onUploadingChange={setUploading} />

      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        <Button asChild variant="outline">
          <Link href={cancelHref}>취소</Link>
        </Button>
        <Button type="button" variant="outline" disabled={pending || uploading} onClick={() => save(false)}>
          임시저장
        </Button>
        <Button type="submit" disabled={pending || uploading}>
          {(pending || uploading) && <Loader2 className="animate-spin" aria-hidden />}
          {uploading ? "파일 올리는 중" : "상신"}
        </Button>
      </div>
    </form>
  );
}
