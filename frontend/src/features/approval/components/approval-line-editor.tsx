"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_APPROVAL_STEPS } from "../approval-rules";
import { ApproverPickerDialog, approverMeta } from "./approver-picker-dialog";

// 결재선의 한 사람 (문서 작성·결재라인 템플릿 공용)
export interface LineApprover {
  approverId: number;
  name: string;
  departmentName: string | null;
  positionName: string | null;
  jobTitleName: string | null;
  stepName?: string | null; // 템플릿 단계명 (결재라인 템플릿만)
}

interface ApprovalLineEditorProps {
  value: LineApprover[];
  onChange: (next: LineApprover[]) => void;
  excludeIds?: number[]; // 결재자로 고를 수 없는 회원 (문서: 기안자 본인)
  withStepNames?: boolean; // 템플릿만 단계명 입력 (문서 단계에는 단계명 컬럼이 없다)
  labelledBy?: string;
}

// 결재선 편집: 순서 = 결재 순서. 추가(검색)·위아래 이동·빼기.
// 검사 규칙(1~10명, 중복·본인 불가)은 화면에서도 막지만 최종 판단은 서버 (features.md 7.5)
export function ApprovalLineEditor({ value, onChange, excludeIds = [], withStepNames = false, labelledBy }: ApprovalLineEditorProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const full = value.length >= MAX_APPROVAL_STEPS;

  const move = (index: number, delta: number) => {
    const next = [...value];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    onChange(next);
  };

  return (
    <div className="grid gap-2">
      {value.length > 0 ? (
        <ol aria-labelledby={labelledBy} className="divide-y rounded-lg border">
          {value.map((a, i) => (
            <li key={a.approverId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
              <span className="w-5 shrink-0 text-center text-sm text-muted-foreground tabular-nums">{i + 1}</span>
              <span className="grid min-w-0 flex-1 basis-40">
                <span className="truncate text-sm font-medium">{a.name}</span>
                <span className="truncate text-xs text-muted-foreground">{approverMeta(a)}</span>
              </span>
              {withStepNames && (
                <Input
                  value={a.stepName ?? ""}
                  onChange={(e) => onChange(value.map((v, j) => (j === i ? { ...v, stepName: e.target.value } : v)))}
                  placeholder="단계명 (예: 팀장 검토)"
                  aria-label={`${i + 1}단계 단계명`}
                  maxLength={50}
                  className="h-8 w-full sm:w-44"
                />
              )}
              <span className="flex shrink-0 items-center">
                <Button type="button" variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${a.name} 앞으로`}>
                  <ArrowUp aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={i === value.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label={`${a.name} 뒤로`}
                >
                  <ArrowDown aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onChange(value.filter((_, j) => j !== i))}
                  aria-label={`${a.name} 빼기`}
                >
                  <X aria-hidden />
                </Button>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          결재자를 추가하세요. 위에서부터 순서대로 결재합니다.
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">
          {value.length}/{MAX_APPROVAL_STEPS}명
        </span>
        <Button type="button" variant="outline" size="sm" disabled={full} onClick={() => setPickerOpen(true)}>
          <Plus aria-hidden />
          결재자 추가
        </Button>
      </div>

      <ApproverPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        excludeIds={[...excludeIds, ...value.map((a) => a.approverId)]}
        onPick={(a) =>
          onChange([
            ...value,
            { approverId: a.id, name: a.name, departmentName: a.departmentName, positionName: a.positionName, jobTitleName: a.jobTitleName },
          ])
        }
      />
    </div>
  );
}
