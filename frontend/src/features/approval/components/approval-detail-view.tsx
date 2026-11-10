"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, ArrowLeft, Download, FileText, Loader2, UserRoundCog } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { ErrorState, LoadingState } from "@/components/common/data-state";
import { FormError } from "@/components/common/form-field";
import { RichTextContent } from "@/features/board/components/rich-text-content";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/services/api-client";
import { getErrorMessage } from "@/lib/error-message";
import { formatDateTime, formatFileSize } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  approveApprovalDocument,
  cancelApprovalDocument,
  copyApprovalDocument,
  deleteApprovalDocument,
  downloadApprovalFile,
  rejectApprovalDocument,
  replaceApprover,
  submitApprovalDocument,
} from "@/services/api/approval-documents";
import {
  APPROVAL_STATUS_LABEL,
  DOCUMENT_TYPE_LABEL,
  type ApprovalDocument,
  type ApprovalDocumentStep,
  type ApprovalHistory,
} from "@/types/approval";
import type { FileInfo } from "@/types/file";
import { approvalHref, COMMENT_MAX } from "../approval-rules";
import { useApprovalDocument, useApprovalMutation } from "../hooks/use-approvals";
import { ApprovalStatusBadge, StepStatusText } from "./approval-badges";
import { ApproverPickerDialog } from "./approver-picker-dialog";

type ConfirmKind = "submit" | "cancel" | "delete";

const CONFIRM_TEXT: Record<ConfirmKind, { title: string; description: string; label: string; destructive?: boolean }> = {
  submit: { title: "상신할까요?", description: "상신하면 1단계 결재자에게 알림이 가고, 더 이상 수정할 수 없습니다.", label: "상신" },
  cancel: {
    title: "회수할까요?",
    description: "아직 아무도 승인하지 않은 문서만 회수할 수 있습니다. 회수한 문서는 '다시 기안'으로 고쳐 올릴 수 있습니다.",
    label: "회수",
  },
  delete: { title: "임시저장 문서를 삭제할까요?", description: "삭제한 문서는 되돌릴 수 없습니다.", label: "삭제", destructive: true },
};

// 결재 문서 상세 (알림의 이동 주소 /approvals/:id)
// 버튼은 서버가 준 permissions로만 보여 준다. 최종 판단은 서버(409 = 그사이 상태가 바뀜 → 다시 조회)
export function ApprovalDetailView({ id }: { id: number }) {
  const router = useRouter();
  const { data, isPending, isError, error, refetch } = useApprovalDocument(id);

  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const [replacing, setReplacing] = useState<ApprovalDocumentStep | null>(null);

  // 409(동시 처리로 상태가 바뀜)면 최신 상태를 다시 받아 버튼을 맞춘다.
  const onError = (e: unknown) => {
    toast.error(getErrorMessage(e));
    if (e instanceof ApiError && e.status === 409) void refetch();
  };

  const action = useApprovalMutation<ConfirmKind, unknown>((kind) =>
    kind === "submit" ? submitApprovalDocument(id) : kind === "cancel" ? cancelApprovalDocument(id) : deleteApprovalDocument(id),
  );
  const copy = useApprovalMutation(() => copyApprovalDocument(id));
  const replace = useApprovalMutation((v: { stepOrder: number; approverId: number }) => replaceApprover(id, v.stepOrder, v.approverId));

  if (isPending) return <LoadingState />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;

  const doc = data;
  const p = doc.permissions;

  const runConfirm = (kind: ConfirmKind) =>
    action.mutate(kind, {
      onSuccess: () => {
        setConfirm(null);
        toast.success(`${CONFIRM_TEXT[kind].label}했습니다.`);
        if (kind === "delete") router.replace("/approvals?box=drafts");
      },
      onError: (e) => {
        setConfirm(null);
        onError(e);
      },
    });

  return (
    <article className="grid gap-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 text-muted-foreground">
          <Link href="/approvals">
            <ArrowLeft aria-hidden />
            결재함
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid min-w-0 gap-2">
            <div className="flex items-center gap-2">
              <ApprovalStatusBadge status={doc.status} />
              <span className="text-xs text-muted-foreground">{DOCUMENT_TYPE_LABEL[doc.documentType]}</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight break-words">{doc.title}</h1>
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span>기안 {doc.requester.name}</span>
              {doc.requestedAt && <span>상신 {formatDateTime(doc.requestedAt)}</span>}
              {doc.completedAt && <span>완료 {formatDateTime(doc.completedAt)}</span>}
              {doc.sourceTemplate && <span>결재라인 {doc.sourceTemplate.name}</span>}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {p.canApprove && (
              <>
                <Button variant="outline" onClick={() => setDecision("reject")}>
                  반려
                </Button>
                <Button onClick={() => setDecision("approve")}>승인</Button>
              </>
            )}
            {p.canEdit && (
              <>
                <Button variant="outline" onClick={() => setConfirm("delete")}>
                  삭제
                </Button>
                <Button asChild variant="outline">
                  <Link href={`${approvalHref(id)}/edit`}>수정</Link>
                </Button>
                <Button onClick={() => setConfirm("submit")}>상신</Button>
              </>
            )}
            {p.canCancel && (
              <Button variant="outline" onClick={() => setConfirm("cancel")}>
                회수
              </Button>
            )}
            {p.canCopy && (
              <Button
                disabled={copy.isPending}
                onClick={() =>
                  copy.mutate(undefined, {
                    onSuccess: (created) => {
                      toast.success("새 임시저장 문서로 복사했습니다.");
                      router.push(`${approvalHref(created.id)}/edit`);
                    },
                    onError,
                  })
                }
              >
                {copy.isPending && <Loader2 className="animate-spin" aria-hidden />}
                다시 기안
              </Button>
            )}
          </div>
        </div>
      </div>

      <ApprovalSteps doc={doc} onReplace={setReplacing} />

      <section aria-label="본문" className="border-t pt-6">
        <RichTextContent html={doc.content} />
      </section>

      <ApprovalAttachments docId={id} files={doc.files} />

      <ApprovalHistoryList doc={doc} />

      {confirm && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setConfirm(null)}
          title={CONFIRM_TEXT[confirm].title}
          description={CONFIRM_TEXT[confirm].description}
          confirmLabel={CONFIRM_TEXT[confirm].label}
          destructive={CONFIRM_TEXT[confirm].destructive}
          pending={action.isPending}
          onConfirm={() => runConfirm(confirm)}
        />
      )}

      {decision && (
        <DecisionDialog
          key={decision}
          kind={decision}
          docId={id}
          onClose={() => setDecision(null)}
          onError={(e) => {
            setDecision(null);
            onError(e);
          }}
        />
      )}

      <ApproverPickerDialog
        open={replacing !== null}
        onOpenChange={(open) => !open && setReplacing(null)}
        title={replacing ? `${replacing.stepOrder}단계 결재자 교체` : "결재자 교체"}
        description="퇴사·휴직 등으로 결재할 수 없는 결재자를 바꿉니다. 지금 차례인 단계면 새 결재자에게 알림이 갑니다."
        excludeIds={[doc.requester.id, ...doc.steps.map((s) => s.approverId)]}
        onPick={(a) => {
          if (!replacing) return;
          replace.mutate(
            { stepOrder: replacing.stepOrder, approverId: a.id },
            { onSuccess: () => toast.success(`${a.name}님으로 교체했습니다.`), onError },
          );
          setReplacing(null);
        }}
      />
    </article>
  );
}

// 결재선: 단계마다 결재 당시 이름·소속(스냅샷), 상태, 처리 시각, 의견
function ApprovalSteps({ doc, onReplace }: { doc: ApprovalDocument; onReplace: (step: ApprovalDocumentStep) => void }) {
  if (doc.steps.length === 0) {
    return <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">결재선이 아직 없습니다.</p>;
  }

  const inProgress = doc.status === "REQUESTED" || doc.status === "IN_PROGRESS";

  return (
    <section aria-labelledby="approval-steps-title" className="grid gap-2">
      <h2 id="approval-steps-title" className="text-sm font-medium">
        결재선
      </h2>
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {doc.steps.map((s) => {
          const remaining = s.status === "PENDING" || s.status === "WAITING";
          return (
            <li
              key={s.id}
              aria-current={inProgress && s.status === "PENDING" ? "step" : undefined}
              className={cn("grid gap-1 rounded-lg border p-3", inProgress && s.status === "PENDING" && "border-primary")}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground tabular-nums">{s.stepOrder}단계</span>
                {/* 임시저장 문서의 단계는 아직 상태가 의미 없어 표시하지 않는다 */}
                {doc.status !== "DRAFT" && <StepStatusText status={s.status} />}
              </div>
              <p className="font-medium">{s.approverName}</p>
              <p className="text-xs text-muted-foreground">
                {[s.departmentName, s.positionName, s.jobTitleName].filter(Boolean).join(" · ") || "소속 없음"}
              </p>
              {s.actedAt && <p className="text-xs text-muted-foreground tabular-nums">{formatDateTime(s.actedAt)}</p>}
              {s.comment && <p className="mt-1 rounded-md bg-muted/60 px-2 py-1.5 text-sm break-words whitespace-pre-wrap">{s.comment}</p>}
              {inProgress && remaining && s.approverUsable === false && (
                <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                  <AlertTriangle className="size-3.5" aria-hidden />
                  결재할 수 없는 결재자입니다 (퇴사·휴직 등)
                </p>
              )}
              {doc.permissions.canReplaceApprover && remaining && (
                <Button variant="ghost" size="sm" className="mt-1 justify-self-start" onClick={() => onReplace(s)}>
                  <UserRoundCog aria-hidden />
                  결재자 교체
                </Button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// 승인(의견 선택) / 반려(의견 필수)
function DecisionDialog({
  kind,
  docId,
  onClose,
  onError,
}: {
  kind: "approve" | "reject";
  docId: number;
  onClose: () => void;
  onError: (e: unknown) => void;
}) {
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isReject = kind === "reject";
  const mutation = useApprovalMutation((text: string) =>
    isReject ? rejectApprovalDocument(docId, text) : approveApprovalDocument(docId, text || null),
  );

  const submit = () => {
    const text = comment.trim();
    if (isReject && !text) {
      setError("반려 의견을 입력하세요. 기안자가 고쳐서 다시 올릴 때 참고합니다.");
      return;
    }
    mutation.mutate(text, {
      onSuccess: () => {
        toast.success(isReject ? "반려했습니다." : "승인했습니다.");
        onClose();
      },
      onError,
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isReject ? "반려" : "승인"}</DialogTitle>
          <DialogDescription>
            {isReject ? "반려하면 이후 단계는 진행되지 않고 기안자에게 알림이 갑니다." : "승인하면 다음 결재자에게 차례가 넘어갑니다."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="approval-comment">
            의견
            {isReject ? (
              <span className="text-destructive" aria-hidden>
                *
              </span>
            ) : (
              <span className="font-normal text-muted-foreground">(선택)</span>
            )}
          </Label>
          <Textarea
            id="approval-comment"
            value={comment}
            onChange={(e) => {
              setComment(e.target.value);
              if (error) setError(null);
            }}
            maxLength={COMMENT_MAX}
            rows={4}
            aria-invalid={!!error}
            autoFocus
          />
          <FormError message={error} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            취소
          </Button>
          <Button variant={isReject ? "destructive" : "default"} onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="animate-spin" aria-hidden />}
            {isReject ? "반려" : "승인"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// 첨부 (Bearer 헤더가 필요해 fetch로 받아 저장 - 게시글 첨부와 같은 방식)
function ApprovalAttachments({ docId, files }: { docId: number; files: FileInfo[] }) {
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  if (files.length === 0) return null;

  const download = async (file: FileInfo) => {
    setDownloadingId(file.id);
    try {
      const blob = await downloadApprovalFile(docId, file.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.originalName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <section aria-labelledby="approval-files-title" className="grid gap-2">
      <h2 id="approval-files-title" className="text-sm font-medium">
        첨부파일 <span className="font-normal text-muted-foreground tabular-nums">{files.length}</span>
      </h2>
      <ul className="divide-y rounded-lg border">
        {files.map((file) => (
          <li key={file.id} className="flex items-center gap-2 px-3 py-2 text-sm">
            <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 truncate" title={file.originalName}>
              {file.originalName}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatFileSize(file.size)}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`${file.originalName} 내려받기`}
              disabled={downloadingId === file.id}
              onClick={() => void download(file)}
            >
              {downloadingId === file.id ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// 이력 한 줄의 동작 이름 (서버는 변경 전·후 상태만 저장한다 - 중간 승인은 결재중 → 결재중, 결재자 교체는 같은 상태)
function historyAction(h: ApprovalHistory) {
  if (h.fromStatus === h.toStatus && h.toStatus !== "IN_PROGRESS") return "결재자 변경";
  switch (h.toStatus) {
    case "REQUESTED":
      return "상신";
    case "IN_PROGRESS":
      // 결재중 → 결재중은 중간 승인이거나 결재자 교체(의견에 "결재자 변경" 기록)
      return h.fromStatus === "IN_PROGRESS" && h.comment?.startsWith("결재자 변경") ? "결재자 변경" : "승인";
    case "APPROVED":
      return "최종 승인";
    case "REJECTED":
      return "반려";
    case "CANCELLED":
      return "회수";
    default:
      return APPROVAL_STATUS_LABEL[h.toStatus];
  }
}

// 처리 이력 (상태 변경·승인·결재자 교체)
// 작성(임시저장 생성, 변경 전 상태 없음) 행은 표시하지 않는다 - 상신 이력으로 충분 (2026-11-10 사용자 결정, 서버 데이터는 그대로)
function ApprovalHistoryList({ doc }: { doc: ApprovalDocument }) {
  const histories = doc.histories.filter((h) => h.fromStatus !== null);
  if (histories.length === 0) return null;

  return (
    <section aria-labelledby="approval-history-title" className="grid gap-2 border-t pt-6">
      <h2 id="approval-history-title" className="text-sm font-medium">
        처리 이력
      </h2>
      <ol className="grid gap-2 text-sm">
        {histories.map((h) => (
          <li key={h.id} className="grid gap-0.5 sm:grid-cols-[10rem_1fr] sm:gap-3">
            <time dateTime={h.createdAt} className="text-xs text-muted-foreground tabular-nums sm:pt-0.5">
              {formatDateTime(h.createdAt)}
            </time>
            <span className="break-words">
              <span className="font-medium">{h.actor?.name ?? "-"}</span>{" "}
              <span className="text-muted-foreground">{historyAction(h)}</span>
              {h.comment && <span className="block text-muted-foreground">{h.comment}</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
