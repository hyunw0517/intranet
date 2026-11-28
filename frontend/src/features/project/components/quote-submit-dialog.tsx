"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { FormError } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApprovalLineEditor, toStepInputs, type LineStepGroup } from "@/features/approval/components/approval-line-editor";
import { getErrorMessage } from "@/lib/error-message";
import { useAuth } from "@/providers/auth-provider";
import { submitQuote } from "@/services/api/project-quotes";
import { useProjectMutation } from "../hooks/use-projects";

// 견적 결재 요청 창 (결재가 켜져 있을 때만)
// 결재라인만 지정하고 제목·본문은 서버가 견적에서 만든다.
// 결재라인 편집은 전자결재 화면의 컴포넌트를 그대로 쓴다.
export function QuoteSubmitDialog({
  open,
  onOpenChange,
  projectId,
  quoteId,
  versionId,
  label,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  quoteId: number;
  versionId: number;
  label: string; // "Q-2026-0001 v2"
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        {open && <SubmitForm projectId={projectId} quoteId={quoteId} versionId={versionId} label={label} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function SubmitForm({ projectId, quoteId, versionId, label, onClose }: { projectId: number; quoteId: number; versionId: number; label: string; onClose: () => void }) {
  const { user } = useAuth();
  const [steps, setSteps] = useState<LineStepGroup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const submit = useProjectMutation(() => submitQuote(projectId, quoteId, versionId, toStepInputs(steps)));

  const run = async () => {
    if (steps.length === 0) return setError("결재자를 1명 이상 지정해 주세요.");
    setError(null);
    try {
      await submit.mutateAsync(undefined);
      toast.success("결재를 요청했습니다. 최종 승인되면 견적이 확정됩니다.");
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>결재 요청 - {label}</DialogTitle>
        <DialogDescription>결재자를 지정해 상신합니다. 결재 중에는 견적을 고칠 수 없고, 반려되면 고쳐서 다시 올릴 수 있습니다.</DialogDescription>
      </DialogHeader>
      <FormError message={error} />
      <ApprovalLineEditor value={steps} onChange={setSteps} excludeIds={user ? [user.id] : []} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={submit.isPending}>
          취소
        </Button>
        <Button type="button" onClick={run} disabled={submit.isPending}>
          {submit.isPending && <Loader2 className="animate-spin" aria-hidden />}
          상신
        </Button>
      </DialogFooter>
    </div>
  );
}
