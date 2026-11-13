"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ErrorState, LoadingState } from "@/components/common/data-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { useLeaveByDocument } from "@/features/leave/hooks/use-leaves";
import { emptyLeaveForm, type LeaveFormValues } from "@/features/leave/leave-rules";
import { getErrorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";
import {
  createApprovalDocument,
  submitApprovalDocument,
  updateApprovalDocument,
  type ApprovalDocumentInput,
} from "@/services/api/approval-documents";
import { createLeave, updateLeave, type LeaveInput } from "@/services/api/leaves";
import type { ApprovalDocumentType } from "@/types/approval";
import { approvalHref } from "../approval-rules";
import { approvalKeys, useApprovalDocument, useDocumentTypes } from "../hooks/use-approvals";
import { ApprovalDocumentForm, EMPTY_APPROVAL_FORM, type ApprovalFormValues } from "./approval-document-form";
import { groupStepRows } from "./approval-line-editor";

function toInput(values: ApprovalFormValues): Omit<ApprovalDocumentInput, "documentType"> {
  return {
    title: values.title,
    content: values.content,
    steps: values.steps.map((g) => ({ approverIds: g.approvers.map((a) => a.approverId) })), // 문서에는 단계명이 없다
    approvalLineTemplateId: values.templateId,
    attachmentIds: values.files.map((f) => f.id),
  };
}

// 휴가 신청: 휴가 항목 + 결재선·첨부 (제목·본문은 보내지 않는다 - 서버가 제목을 만든다)
function toLeaveInput(values: ApprovalFormValues): LeaveInput {
  const leave = values.leave as LeaveFormValues;
  const full = leave.unit === "FULL";
  return {
    type: leave.type,
    unit: leave.unit,
    startDate: leave.startDate,
    endDate: full ? leave.endDate : null,
    startTime: full ? null : leave.startTime,
    reason: leave.reason.trim() || null,
    steps: values.steps.map((g) => ({ approverIds: g.approvers.map((a) => a.approverId) })),
    approvalLineTemplateId: values.templateId,
    attachmentIds: values.files.map((f) => f.id),
  };
}

// 저장(생성·수정) → 상신이면 이어서 상신 → 상세로 이동
// 상신만 실패하면(예: 그사이 결재자가 퇴사, 연차 부족) 문서는 임시저장으로 남으므로 수정 화면에서 고치게 한다.
// save는 결재 문서 id를 돌려준다 (휴가 신청은 휴가 API 응답의 documentId)
function useSaveAndSubmit() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const run = async (save: () => Promise<number>, submit: boolean) => {
    setPending(true);
    setServerError(null);
    try {
      const id = await save();
      if (submit) {
        try {
          await submitApprovalDocument(id);
          toast.success("상신했습니다.");
        } catch (error) {
          await queryClient.invalidateQueries({ queryKey: approvalKeys.all });
          toast.error(`임시저장했지만 상신하지 못했습니다. ${getErrorMessage(error)}`);
          router.replace(`${approvalHref(id)}/edit`);
          setPending(false);
          return;
        }
      } else {
        toast.success("임시저장했습니다.");
      }
      await queryClient.invalidateQueries({ queryKey: approvalKeys.all });
      router.push(approvalHref(id));
    } catch (error) {
      setServerError(getErrorMessage(error));
      setPending(false);
    }
  };

  return { pending, serverError, run };
}

// 새 문서 - 문서 유형: 일반 / 휴가 신청(휴가 옵션이 켜져 있을 때만, ?type=leave)
// 유형은 URL에 두어 [휴가내역]의 "휴가 신청" 링크로 바로 들어올 수 있게 한다.
export function ApprovalWriteView() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const types = useDocumentTypes();
  const { pending, serverError, run } = useSaveAndSubmit();

  if (!user || types.isPending) return <LoadingState />;

  const leaveEnabled = types.data?.some((t) => t.type === "LEAVE") ?? false;
  const documentType: ApprovalDocumentType = leaveEnabled && searchParams.get("type") === "leave" ? "LEAVE" : "GENERAL";
  const isLeave = documentType === "LEAVE";

  return (
    <>
      <PageHeader
        title={isLeave ? "휴가 신청" : "새 결재 문서"}
        description={
          isLeave
            ? "휴가 정보와 결재선을 정하고 상신합니다. 최종 승인되면 연차에서 차감됩니다."
            : "결재선을 정하고 상신합니다. 임시저장한 문서는 결재함의 임시저장에서 이어서 쓸 수 있습니다."
        }
      />
      {leaveEnabled && (
        <div role="group" aria-label="문서 유형" className="mb-5 flex w-fit rounded-lg border p-0.5">
          {(
            [
              { type: "GENERAL", label: "일반 문서", query: "" },
              { type: "LEAVE", label: "휴가 신청", query: "?type=leave" },
            ] as const
          ).map((t) => (
            <Button
              key={t.type}
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={documentType === t.type}
              onClick={() => router.replace(`${pathname}${t.query}`, { scroll: false })}
              className={cn("h-7 px-3", documentType === t.type && "bg-accent text-foreground")}
            >
              {t.label}
            </Button>
          ))}
        </div>
      )}
      <ApprovalDocumentForm
        key={documentType} // 유형을 바꾸면 입력을 새로 시작
        documentType={documentType}
        initial={isLeave ? { ...EMPTY_APPROVAL_FORM, leave: emptyLeaveForm() } : EMPTY_APPROVAL_FORM}
        requesterId={user.id}
        cancelHref={isLeave ? "/leaves" : "/approvals?box=drafts"}
        pending={pending}
        serverError={serverError}
        onSave={(values, submit) =>
          void run(
            isLeave
              ? async () => (await createLeave(toLeaveInput(values))).documentId
              : async () => (await createApprovalDocument({ documentType: "GENERAL", ...toInput(values) })).id,
            submit,
          )
        }
      />
    </>
  );
}

// 임시저장 문서 수정 (휴가 문서는 휴가 정보를 함께 불러와 휴가 API로 저장)
export function ApprovalEditView({ id }: { id: number }) {
  const { user } = useAuth();
  const { data, isPending, isError, error, refetch } = useApprovalDocument(id);
  const isLeave = data?.documentType === "LEAVE";
  const leave = useLeaveByDocument(id, isLeave);
  const { pending, serverError, run } = useSaveAndSubmit();

  if (isPending || !user || (isLeave && leave.isPending)) return <LoadingState />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isLeave && leave.isError) return <ErrorState error={leave.error} onRetry={() => leave.refetch()} />;

  if (!data.permissions.canEdit) {
    return (
      <div className="grid justify-items-center gap-3 rounded-lg border px-4 py-10 text-center">
        <p className="text-muted-foreground">임시저장 상태의 내 문서만 수정할 수 있습니다.</p>
        <Button asChild variant="outline" size="sm">
          <Link href={approvalHref(id)}>문서로 돌아가기</Link>
        </Button>
      </div>
    );
  }

  const leaveData = isLeave ? leave.data : undefined;
  const initial: ApprovalFormValues = {
    title: data.title,
    content: data.content ?? "",
    steps: groupStepRows(data.steps, (s) => ({
      approverId: s.approverId,
      name: s.approverName,
      departmentName: s.departmentName,
      positionName: s.positionName,
      jobTitleName: s.jobTitleName,
    })),
    templateId: data.sourceTemplate?.id ?? null,
    files: data.files,
    leave: leaveData
      ? {
          type: leaveData.type,
          unit: leaveData.unit,
          startDate: leaveData.startDate,
          endDate: leaveData.endDate,
          startTime: leaveData.startTime ?? "09:00",
          reason: leaveData.reason ?? "",
        }
      : null,
  };

  return (
    <>
      <PageHeader
        title={isLeave ? "휴가 신청 수정" : "결재 문서 수정"}
        description="임시저장 문서입니다. 상신하면 더 이상 수정할 수 없습니다."
      />
      <ApprovalDocumentForm
        key={data.updatedAt} // 다시 불러오면 폼 초기화
        documentType={data.documentType}
        initial={initial}
        requesterId={user.id}
        cancelHref={approvalHref(id)}
        pending={pending}
        serverError={serverError}
        onSave={(values, submit) =>
          void run(
            isLeave
              ? async () => (await updateLeave(id, toLeaveInput(values))).documentId
              : async () => (await updateApprovalDocument(id, toInput(values))).id,
            submit,
          )
        }
      />
    </>
  );
}
