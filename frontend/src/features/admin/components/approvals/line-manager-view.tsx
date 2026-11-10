"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-state";
import { FormError, FormField } from "@/components/common/form-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApproverPickerDialog, approverMeta } from "@/features/approval/components/approver-picker-dialog";
import { getErrorMessage } from "@/lib/error-message";
import { createLineManager, deleteLineManager, type LineManagerInput } from "@/services/api/line-managers";
import { LINE_MANAGER_SCOPE_LABEL, type Approver, type LineManagerRule, type LineManagerScope } from "@/types/approval";
import { useLineManagerMutation, useLineManagers } from "../../hooks/use-admin-approvals";
import { useDepartments, useJobTitles } from "../../hooks/use-organization";

// 결재라인 관리자 (공용·부서 결재라인을 관리할 수 있는 사람을 지정, features.md 7.5)
// 한 규칙 = 대상(회원 또는 직책) + 범위(전체 / 특정 부서 / 본인 부서). 관리자(ADMIN)는 규칙 없이도 항상 관리한다.
export function LineManagerView() {
  const { data, isPending, isError, error, refetch } = useLineManagers();
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<LineManagerRule | null>(null);
  const remove = useLineManagerMutation((id: number) => deleteLineManager(id));

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus aria-hidden />
          규칙 추가
        </Button>
      </div>

      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : data.length === 0 ? (
        <EmptyState message="지정한 결재라인 관리자가 없습니다. 지금은 관리자만 공용·부서 결재라인을 관리합니다." />
      ) : (
        <ul className="divide-y rounded-lg border">
          {data.map((rule) => (
            <li key={rule.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <div className="grid min-w-0 flex-1 basis-60 gap-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">{rule.user ? "회원" : "직책"}</span>
                  <span className="font-medium">
                    {rule.user ? `${rule.user.name} (${rule.user.empNo})` : rule.jobTitle?.name}
                    {(rule.user?.deleted || rule.jobTitle?.deleted) && " (삭제됨)"}
                  </span>
                  {rule.inactive && <Badge variant="secondary">적용 안 됨</Badge>}
                </p>
                <p className="text-sm text-muted-foreground">
                  {rule.scope === "DEPARTMENT"
                    ? `부서: ${rule.department?.name ?? "-"}${rule.department?.deleted ? " (삭제된 부서)" : ""}`
                    : LINE_MANAGER_SCOPE_LABEL[rule.scope]}
                </p>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label="규칙 해제" onClick={() => setDeleting(rule)}>
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {adding && <AddRuleDialog onClose={() => setAdding(false)} />}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="규칙을 해제할까요?"
        description="해제하면 바로 그 대상은 공용·부서 결재라인을 관리할 수 없습니다."
        confirmLabel="해제"
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success("해제했습니다.");
              setDeleting(null);
            },
            onError: (e) => toast.error(getErrorMessage(e)),
          })
        }
      />
    </div>
  );
}

type TargetKind = "user" | "jobTitle";

// 규칙 추가 - 회원 대상은 "본인 부서" 범위를 쓸 수 없다 (겸직 시 뜻이 모호, 서버 CHECK와 같음)
function AddRuleDialog({ onClose }: { onClose: () => void }) {
  const [target, setTarget] = useState<TargetKind>("jobTitle");
  const [user, setUser] = useState<Approver | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [jobTitleId, setJobTitleId] = useState("");
  const [scope, setScope] = useState<LineManagerScope>("MY_DEPARTMENT");
  const [departmentId, setDepartmentId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const jobTitles = useJobTitles();
  const departments = useDepartments();
  const mutation = useLineManagerMutation((input: LineManagerInput) => createLineManager(input));

  const scopes: LineManagerScope[] = target === "user" ? ["ALL", "DEPARTMENT"] : ["MY_DEPARTMENT", "DEPARTMENT", "ALL"];

  const submit = () => {
    if (target === "user" && !user) return setError("회원을 고르세요.");
    if (target === "jobTitle" && !jobTitleId) return setError("직책을 고르세요.");
    if (scope === "DEPARTMENT" && !departmentId) return setError("부서를 고르세요.");
    setError(null);
    mutation.mutate(
      {
        ...(target === "user" ? { userId: user!.id } : { jobTitleId: Number(jobTitleId) }),
        scope,
        ...(scope === "DEPARTMENT" && { departmentId: Number(departmentId) }),
      },
      {
        onSuccess: () => {
          toast.success("규칙을 추가했습니다.");
          onClose();
        },
        onError: (e) => setError(getErrorMessage(e)),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>결재라인 관리자 추가</DialogTitle>
          <DialogDescription>
            예: 직책 &lsquo;팀장&rsquo; + 본인 부서 → 각 팀장이 자기 부서의 부서 결재라인을 관리합니다. 인사이동을 자동으로 따라갑니다.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <FormError message={error} />

          <div className="grid gap-1.5">
            <span className="text-sm font-medium">대상</span>
            <Tabs
              value={target}
              onValueChange={(v) => {
                setTarget(v as TargetKind);
                setScope(v === "user" ? "ALL" : "MY_DEPARTMENT");
              }}
            >
              <TabsList>
                <TabsTrigger value="jobTitle">직책</TabsTrigger>
                <TabsTrigger value="user">회원</TabsTrigger>
              </TabsList>
            </Tabs>
            {target === "user" ? (
              <Button type="button" variant="outline" className="h-auto justify-start py-2" onClick={() => setPickerOpen(true)}>
                <UserRound aria-hidden />
                {user ? (
                  <span className="grid text-left">
                    <span>
                      {user.name} <span className="text-muted-foreground tabular-nums">{user.empNo}</span>
                    </span>
                    <span className="text-xs font-normal text-muted-foreground">{approverMeta(user)}</span>
                  </span>
                ) : (
                  "회원 선택"
                )}
              </Button>
            ) : (
              <Select value={jobTitleId} onValueChange={setJobTitleId}>
                <SelectTrigger className="w-full" aria-label="직책">
                  <SelectValue placeholder="직책 선택" />
                </SelectTrigger>
                <SelectContent>
                  {jobTitles.data?.map((j) => (
                    <SelectItem key={j.id} value={String(j.id)}>
                      {j.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <FormField id="rule-scope" label="관리 범위">
            <Select value={scope} onValueChange={(v) => setScope(v as LineManagerScope)}>
              <SelectTrigger id="rule-scope" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {scopes.map((s) => (
                  <SelectItem key={s} value={s}>
                    {LINE_MANAGER_SCOPE_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {scope === "DEPARTMENT" && (
            <FormField id="rule-department" label="부서">
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger id="rule-department" className="w-full">
                  <SelectValue placeholder="부서 선택" />
                </SelectTrigger>
                <SelectContent>
                  {departments.data?.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.path.replaceAll("/", " › ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            취소
          </Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="animate-spin" aria-hidden />}
            추가
          </Button>
        </DialogFooter>

        <ApproverPickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          title="회원 선택"
          description="재직 중인 직원·관리자만 고를 수 있습니다."
          excludeIds={user ? [user.id] : []}
          onPick={setUser}
        />
      </DialogContent>
    </Dialog>
  );
}
