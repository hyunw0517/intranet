"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, CopyPlus, ExternalLink, Pencil, Printer, Send, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { ErrorState, LoadingState } from "@/components/common/data-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getErrorMessage } from "@/lib/error-message";
import {
  cancelQuoteConfirm,
  confirmQuote,
  createQuoteVersion,
  deleteQuote,
  deleteQuoteVersion,
} from "@/services/api/project-quotes";
import { QUOTE_STATUS_LABEL, type QuoteDetail } from "@/types/project";
import { useProject, useProjectMutation, useQuote } from "../hooks/use-projects";
import { QuoteDocument } from "./quote-document";
import { QuoteEditor } from "./quote-editor";
import { QuoteStatusBadge } from "./quote-status-badge";
import { QuoteSubmitDialog } from "./quote-submit-dialog";

type Pending = "newVersion" | "deleteVersion" | "deleteQuote" | "confirm" | "cancel" | null;

// 견적 상세 - 버전 선택, 견적서 양식(인쇄 영역), 상태별 버튼 (docs/design/projects.md 5-1장)
// - 고치기·결재 요청·확정·버전 삭제: 최신 버전이 작성 중이거나 반려일 때만
// - 새 버전: 최신이 확정·결재 중이 아닐 때 / 확정 취소: 확정된 버전
// - 결재가 켜져 있으면 [결재 요청], 꺼져 있으면 [확정] (approvalEnabled)
export function QuoteDetailView({ projectId, quoteId }: { projectId: number; quoteId: number }) {
  const quote = useQuote(projectId, quoteId);
  const project = useProject(projectId);

  if (quote.isPending || project.isPending) return <LoadingState />;
  if (quote.isError) return <ErrorState error={quote.error} onRetry={() => quote.refetch()} />;
  if (project.isError) return <ErrorState error={project.error} onRetry={() => project.refetch()} />;

  return <QuoteDetailContent quote={quote.data} clientId={project.data.clientId} />;
}

function QuoteDetailContent({ quote, clientId }: { quote: QuoteDetail; clientId: number | null }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState<Pending>(null);

  const latest = quote.versions[0];
  const version = quote.versions.find((v) => v.id === selectedId) ?? latest;
  const status = version.displayStatus;
  const editable = version.isLatest && (status === "DRAFT" || status === "REJECTED");
  const label = `${quote.quoteNo} v${version.version}`;

  const mutation = useProjectMutation(async (kind: Exclude<Pending, null>) => {
    if (kind === "newVersion") return createQuoteVersion(quote.projectId, quote.id);
    if (kind === "deleteVersion") return deleteQuoteVersion(quote.projectId, quote.id, version.id);
    if (kind === "deleteQuote") return deleteQuote(quote.projectId, quote.id);
    if (kind === "confirm") return confirmQuote(quote.projectId, quote.id, version.id);
    return cancelQuoteConfirm(quote.projectId, quote.id, version.id);
  });

  const MESSAGES: Record<Exclude<Pending, null>, { title: string; description: string; confirm: string; done: string; destructive?: boolean }> = {
    newVersion: { title: "새 버전을 만들까요?", description: `v${latest.version}을 복사해 v${latest.version + 1}(작성 중)을 만듭니다. 이전 버전은 그대로 남습니다.`, confirm: "새 버전", done: "새 버전을 만들었습니다." },
    deleteVersion: { title: `v${version.version}을 삭제할까요?`, description: "작성 중인 이 버전을 지웁니다. 이전 버전이 최신이 됩니다.", confirm: "삭제", done: "버전을 삭제했습니다.", destructive: true },
    deleteQuote: { title: "견적을 삭제할까요?", description: "모든 버전이 목록에서 사라집니다. 확정된 버전이 있으면 삭제할 수 없습니다.", confirm: "삭제", done: "견적을 삭제했습니다.", destructive: true },
    confirm: { title: "견적을 확정할까요?", description: "확정하면 고칠 수 없고, 합계가 프로젝트 계약 금액에 더해집니다.", confirm: "확정", done: "견적을 확정했습니다." },
    cancel: { title: "확정을 취소할까요?", description: "작성 중으로 돌아가지 않고 '확정 취소'로 남습니다. 계약 금액에서 빠집니다.", confirm: "확정 취소", done: "확정을 취소했습니다.", destructive: true },
  };

  const run = async () => {
    if (!pending) return;
    try {
      await mutation.mutateAsync(pending);
      toast.success(MESSAGES[pending].done);
      if (pending === "deleteQuote") return router.push(`/projects/${quote.projectId}`);
      if (pending === "newVersion" || pending === "deleteVersion") setSelectedId(null); // 최신 버전으로
      setPending(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <>
      <Link href={`/projects/${quote.projectId}`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden">
        <ArrowLeft className="size-4" aria-hidden />
        {quote.projectName}
      </Link>
      <PageHeader title={quote.title} description={`${quote.quoteNo} · 버전 ${quote.versions.length}개`} />

      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Select value={String(version.id)} onValueChange={(v) => { setSelectedId(Number(v)); setEditing(false); }}>
          <SelectTrigger className="w-56" aria-label="버전 선택">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {quote.versions.map((v) => (
              <SelectItem key={v.id} value={String(v.id)}>
                v{v.version} · {QUOTE_STATUS_LABEL[v.displayStatus]}
                {v.isLatest ? " (최신)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <QuoteStatusBadge status={status} />
        {version.approvalDocument && (
          <Link href={`/approvals/${version.approvalDocument.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            결재 문서 <ExternalLink className="size-3.5" aria-hidden />
          </Link>
        )}

        {!editing && (
          <div className="ml-auto flex flex-wrap gap-2">
            {editable && (
              <>
                <Button variant="outline" onClick={() => setEditing(true)} disabled={!clientId}>
                  <Pencil aria-hidden />
                  고치기
                </Button>
                {quote.approvalEnabled ? (
                  <Button onClick={() => setSubmitting(true)}>
                    <Send aria-hidden />
                    결재 요청
                  </Button>
                ) : (
                  <Button onClick={() => setPending("confirm")}>
                    <CheckCircle2 aria-hidden />
                    확정
                  </Button>
                )}
              </>
            )}
            {version.isLatest && status !== "CONFIRMED" && status !== "IN_APPROVAL" && (
              <Button variant="outline" onClick={() => setPending("newVersion")}>
                <CopyPlus aria-hidden />새 버전
              </Button>
            )}
            {status === "CONFIRMED" && (
              <Button variant="outline" className="text-destructive" onClick={() => setPending("cancel")}>
                <Undo2 aria-hidden />
                확정 취소
              </Button>
            )}
            <Button variant="outline" onClick={() => window.print()}>
              <Printer aria-hidden />
              인쇄
            </Button>
            {editable && version.version > 1 && (
              <Button variant="ghost" className="text-destructive" onClick={() => setPending("deleteVersion")}>
                <Trash2 aria-hidden />
                버전 삭제
              </Button>
            )}
            {version.version === 1 && version.isLatest && editable && (
              <Button variant="ghost" className="text-destructive" onClick={() => setPending("deleteQuote")}>
                <Trash2 aria-hidden />
                견적 삭제
              </Button>
            )}
          </div>
        )}
      </div>

      {status === "REJECTED" && !editing && (
        <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive print:hidden">
          결재가 반려되었습니다. 결재 문서에서 의견을 확인하고, 고친 뒤 다시 결재를 요청해 주세요.
        </p>
      )}

      {editing && clientId ? (
        <QuoteEditor projectId={quote.projectId} clientId={clientId} quoteId={quote.id} title={quote.title} version={version} onDone={() => setEditing(false)} />
      ) : (
        <QuoteDocument quoteNo={quote.quoteNo} title={quote.title} version={version} />
      )}

      <QuoteSubmitDialog open={submitting} onOpenChange={setSubmitting} projectId={quote.projectId} quoteId={quote.id} versionId={version.id} label={label} />
      {pending && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setPending(null)}
          title={MESSAGES[pending].title}
          description={MESSAGES[pending].description}
          confirmLabel={MESSAGES[pending].confirm}
          destructive={MESSAGES[pending].destructive}
          pending={mutation.isPending}
          onConfirm={run}
        />
      )}
    </>
  );
}
