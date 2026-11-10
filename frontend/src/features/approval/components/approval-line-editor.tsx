"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, UserPlus, X } from "lucide-react";
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
}

// 결재 한 단계 - 여러 명이면 병렬: 모두 승인해야 다음 단계, 한 명이라도 반려하면 문서 반려 (features.md 7.5)
export interface LineStepGroup {
  approvers: LineApprover[];
  stepName?: string | null; // 템플릿 단계명 (결재라인 템플릿만)
}

interface ApprovalLineEditorProps {
  value: LineStepGroup[];
  onChange: (next: LineStepGroup[]) => void;
  excludeIds?: number[]; // 결재자로 고를 수 없는 회원 (문서: 기안자 본인)
  withStepNames?: boolean; // 템플릿만 단계명 입력 (문서 단계에는 단계명 컬럼이 없다)
  labelledBy?: string;
}

// 결재 단계 목록 → 서버 요청 형식 (배열 순서 = 결재 순서)
export function toStepInputs(groups: LineStepGroup[]) {
  return groups.map((g) => ({ approverIds: g.approvers.map((a) => a.approverId), name: g.stepName?.trim() || null }));
}

// 서버의 단계 행(같은 stepOrder = 같은 단계) → 단계 목록
export function groupStepRows<T extends { stepOrder: number }>(rows: T[], toApprover: (row: T) => LineApprover | null, stepName?: (row: T) => string | null) {
  const orders = [...new Set(rows.map((r) => r.stepOrder))].sort((a, b) => a - b);
  return orders
    .map((order) => {
      const inStep = rows.filter((r) => r.stepOrder === order);
      return {
        approvers: inStep.map(toApprover).filter((a): a is LineApprover => a !== null),
        stepName: stepName ? stepName(inStep[0]) : undefined,
      };
    })
    .filter((g) => g.approvers.length > 0); // 뺀 결재자 때문에 빈 단계는 없앤다
}

// 결재선 편집: 단계 순서 = 결재 순서. 단계 추가·위아래 이동·삭제, 단계 안에 결재자 추가·빼기.
// 검사 규칙(전체 1~10명, 중복·본인 불가, 빈 단계 없음)은 화면에서도 막지만 최종 판단은 서버 (features.md 7.5)
export function ApprovalLineEditor({ value, onChange, excludeIds = [], withStepNames = false, labelledBy }: ApprovalLineEditorProps) {
  // 결재자 검색 창의 대상: 새 단계 / 기존 단계 index
  const [picking, setPicking] = useState<"new" | number | null>(null);
  const total = value.reduce((n, g) => n + g.approvers.length, 0);
  const full = total >= MAX_APPROVAL_STEPS;

  const update = (index: number, group: LineStepGroup | null) =>
    onChange(group === null ? value.filter((_, i) => i !== index) : value.map((g, i) => (i === index ? group : g)));

  const move = (index: number, delta: number) => {
    const next = [...value];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    onChange(next);
  };

  return (
    <div className="grid gap-2">
      {value.length > 0 ? (
        <ol aria-labelledby={labelledBy} className="grid gap-2">
          {value.map((g, i) => (
            <li key={i} className="rounded-lg border">
              <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-1.5">
                <span className="text-sm font-medium tabular-nums">{i + 1}단계</span>
                {g.approvers.length > 1 && <span className="text-xs text-muted-foreground">병렬 · 모두 승인해야 다음 단계</span>}
                {withStepNames && (
                  <Input
                    value={g.stepName ?? ""}
                    onChange={(e) => update(i, { ...g, stepName: e.target.value })}
                    placeholder="단계명 (예: 팀장 검토)"
                    aria-label={`${i + 1}단계 단계명`}
                    maxLength={50}
                    className="h-7 w-full sm:w-44"
                  />
                )}
                <span className="ml-auto flex shrink-0 items-center">
                  <Button type="button" variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${i + 1}단계 앞으로`}>
                    <ArrowUp aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={i === value.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label={`${i + 1}단계 뒤로`}
                  >
                    <ArrowDown aria-hidden />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => update(i, null)} aria-label={`${i + 1}단계 삭제`}>
                    <Trash2 aria-hidden />
                  </Button>
                </span>
              </div>

              <ul className="divide-y">
                {g.approvers.map((a) => (
                  <li key={a.approverId} className="flex items-center gap-3 px-3 py-2">
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate text-sm font-medium">{a.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{approverMeta(a)}</span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        const approvers = g.approvers.filter((x) => x.approverId !== a.approverId);
                        update(i, approvers.length > 0 ? { ...g, approvers } : null); // 마지막 사람을 빼면 단계도 없앤다
                      }}
                      aria-label={`${a.name} 빼기`}
                    >
                      <X aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>

              <div className="border-t px-3 py-1.5">
                <Button type="button" variant="ghost" size="sm" disabled={full} onClick={() => setPicking(i)}>
                  <UserPlus aria-hidden />이 단계에 결재자 추가 (병렬)
                </Button>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          결재 단계를 추가하세요. 위 단계부터 순서대로 결재합니다.
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">
          {value.length}단계 · {total}/{MAX_APPROVAL_STEPS}명
        </span>
        <Button type="button" variant="outline" size="sm" disabled={full} onClick={() => setPicking("new")}>
          <Plus aria-hidden />
          단계 추가
        </Button>
      </div>

      <ApproverPickerDialog
        open={picking !== null}
        onOpenChange={(open) => !open && setPicking(null)}
        title={picking === "new" ? "단계 추가" : typeof picking === "number" ? `${picking + 1}단계에 결재자 추가` : "결재자 추가"}
        excludeIds={[...excludeIds, ...value.flatMap((g) => g.approvers.map((a) => a.approverId))]}
        onPick={(a) => {
          const approver: LineApprover = {
            approverId: a.id,
            name: a.name,
            departmentName: a.departmentName,
            positionName: a.positionName,
            jobTitleName: a.jobTitleName,
          };
          if (picking === "new") onChange([...value, { approvers: [approver] }]);
          else if (typeof picking === "number") update(picking, { ...value[picking], approvers: [...value[picking].approvers, approver] });
        }}
      />
    </div>
  );
}
