"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ErrorState, LoadingState } from "@/components/common/data-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/error-message";
import { useAuth } from "@/providers/auth-provider";
import {
  createApprovalDocument,
  submitApprovalDocument,
  updateApprovalDocument,
  type ApprovalDocumentInput,
} from "@/services/api/approval-documents";
import type { ApprovalDocument } from "@/types/approval";
import { approvalHref } from "../approval-rules";
import { approvalKeys, useApprovalDocument } from "../hooks/use-approvals";
import { ApprovalDocumentForm, EMPTY_APPROVAL_FORM, type ApprovalFormValues } from "./approval-document-form";

function toInput(values: ApprovalFormValues): Omit<ApprovalDocumentInput, "documentType"> {
  return {
    title: values.title,
    content: values.content,
    steps: values.approvers.map((a) => ({ approverId: a.approverId })),
    approvalLineTemplateId: values.templateId,
    attachmentIds: values.files.map((f) => f.id),
  };
}

// 저장(생성·수정) → 상신이면 이어서 상신 → 상세로 이동
// 상신만 실패하면(예: 그사이 결재자가 퇴사) 문서는 임시저장으로 남으므로 수정 화면에서 고치게 한다.
function useSaveAndSubmit() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const run = async (save: () => Promise<ApprovalDocument>, submit: boolean) => {
    setPending(true);
    setServerError(null);
    try {
      const doc = await save();
      if (submit) {
        try {
          await submitApprovalDocument(doc.id);
          toast.success("상신했습니다.");
        } catch (error) {
          await queryClient.invalidateQueries({ queryKey: approvalKeys.all });
          toast.error(`임시저장했지만 상신하지 못했습니다. ${getErrorMessage(error)}`);
          router.replace(`${approvalHref(doc.id)}/edit`);
          setPending(false);
          return;
        }
      } else {
        toast.success("임시저장했습니다.");
      }
      await queryClient.invalidateQueries({ queryKey: approvalKeys.all });
      router.push(approvalHref(doc.id));
    } catch (error) {
      setServerError(getErrorMessage(error));
      setPending(false);
    }
  };

  return { pending, serverError, run };
}

// 새 문서 (일반 문서)
export function ApprovalWriteView() {
  const { user } = useAuth();
  const { pending, serverError, run } = useSaveAndSubmit();

  if (!user) return <LoadingState />;

  return (
    <>
      <PageHeader title="새 결재 문서" description="결재선을 정하고 상신합니다. 임시저장한 문서는 결재함의 임시저장에서 이어서 쓸 수 있습니다." />
      <ApprovalDocumentForm
        initial={EMPTY_APPROVAL_FORM}
        requesterId={user.id}
        cancelHref="/approvals?box=drafts"
        pending={pending}
        serverError={serverError}
        onSave={(values, submit) => void run(() => createApprovalDocument({ documentType: "GENERAL", ...toInput(values) }), submit)}
      />
    </>
  );
}

// 임시저장 문서 수정
export function ApprovalEditView({ id }: { id: number }) {
  const { user } = useAuth();
  const { data, isPending, isError, error, refetch } = useApprovalDocument(id);
  const { pending, serverError, run } = useSaveAndSubmit();

  if (isPending || !user) return <LoadingState />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;

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

  const initial: ApprovalFormValues = {
    title: data.title,
    content: data.content ?? "",
    approvers: data.steps.map((s) => ({
      approverId: s.approverId,
      name: s.approverName,
      departmentName: s.departmentName,
      positionName: s.positionName,
      jobTitleName: s.jobTitleName,
    })),
    templateId: data.sourceTemplate?.id ?? null,
    files: data.files,
  };

  return (
    <>
      <PageHeader title="결재 문서 수정" description="임시저장 문서입니다. 상신하면 더 이상 수정할 수 없습니다." />
      <ApprovalDocumentForm
        key={data.updatedAt} // 다시 불러오면 폼 초기화
        initial={initial}
        requesterId={user.id}
        cancelHref={approvalHref(id)}
        pending={pending}
        serverError={serverError}
        onSave={(values, submit) => void run(() => updateApprovalDocument(id, toInput(values)), submit)}
      />
    </>
  );
}
