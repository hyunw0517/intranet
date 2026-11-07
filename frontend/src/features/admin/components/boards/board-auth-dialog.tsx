"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { LoadingState } from "@/components/common/data-state";
import { FormError, FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getErrorMessage } from "@/lib/error-message";
import type { BoardAuthInput } from "@/services/api/board-auths";
import type { BoardAuthRule } from "@/types/board";
import { useDepartments, useJobTitles, usePositions } from "../../hooks/use-organization";
import { describeRuleTarget } from "./board-auth-rule";

const NONE = "none"; // 조건 없음. Select는 빈 문자열 값을 쓸 수 없어 별도 값으로 둔다.

type Permission = "authRead" | "authWrite" | "authComment" | "authAdmin";

const PERMISSIONS: { key: Permission; label: string; hint: string }[] = [
  { key: "authRead", label: "읽기", hint: "게시판과 게시글을 볼 수 있습니다." },
  { key: "authWrite", label: "글쓰기", hint: "게시글을 작성할 수 있습니다." },
  { key: "authComment", label: "댓글", hint: "댓글을 작성할 수 있습니다." },
  { key: "authAdmin", label: "게시판 관리", hint: "모든 권한에 더해 다른 사람이 쓴 게시글·댓글을 삭제할 수 있습니다." },
];

// 권한 포함 관계 (서버 normalizeRule과 같은 규칙)
// - 게시판 관리는 읽기·글쓰기·댓글을 모두 포함한다.
// - 글쓰기·댓글은 읽기가 있어야 의미가 있으므로 읽기를 함께 켠다.
function normalizePerms(perms: Record<Permission, boolean>): Record<Permission, boolean> {
  const next = { ...perms };
  if (next.authAdmin) {
    next.authWrite = true;
    next.authComment = true;
  }
  if (next.authWrite || next.authComment || next.authAdmin) next.authRead = true;
  return next;
}

interface BoardAuthDialogProps {
  open: boolean;
  rule: BoardAuthRule | null; // null이면 추가
  onClose: () => void;
  pending: boolean;
  error: unknown;
  onSubmit: (input: BoardAuthInput) => void;
}

// 게시판 권한 규칙 추가·수정 모달 (백엔드 CreateBoardAuthDto / UpdateBoardAuthDto)
export function BoardAuthDialog({ open, onClose, ...props }: BoardAuthDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !props.pending && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {/* 열릴 때마다 새로 마운트해 이전 입력값이 남지 않게 한다. */}
        {open && <BoardAuthForm onCancel={onClose} {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function BoardAuthForm({
  rule,
  pending,
  error,
  onSubmit,
  onCancel,
}: Omit<BoardAuthDialogProps, "open" | "onClose"> & { onCancel: () => void }) {
  const departments = useDepartments();
  const positions = usePositions();
  const jobTitles = useJobTitles();

  const [departmentValue, setDepartmentValue] = useState(rule?.departmentId ? String(rule.departmentId) : NONE);
  const [includeSub, setIncludeSub] = useState(rule?.includeSubDepartment ?? false);
  const [positionValue, setPositionValue] = useState(rule?.positionId ? String(rule.positionId) : NONE);
  const [jobTitleIds, setJobTitleIds] = useState<number[]>(rule?.jobTitles.map((j) => j.id) ?? []);
  // 새 규칙의 기본값은 서버 DTO 기본값과 같다. (읽기·댓글 허용, 글쓰기·관리 불가)
  // 기존 규칙도 포함 관계로 맞춰서 시작한다. (관리만 켜진 채 저장된 예전 규칙 대비)
  const [perms, setPerms] = useState<Record<Permission, boolean>>(() =>
    normalizePerms({
      authRead: rule?.authRead ?? true,
      authWrite: rule?.authWrite ?? false,
      authComment: rule?.authComment ?? true,
      authAdmin: rule?.authAdmin ?? false,
    }),
  );
  const [permError, setPermError] = useState<string>();

  const loading = departments.isPending || positions.isPending || jobTitles.isPending;
  const hasDepartment = departmentValue !== NONE;
  // 포함된 권한은 켜진 채로 잠근다. (끄려면 그 권한을 포함하는 상위 권한을 먼저 끈다)
  const lockedHint: Partial<Record<Permission, string>> = {};
  if (perms.authAdmin) {
    lockedHint.authWrite = "게시판 관리 권한에 포함됩니다.";
    lockedHint.authComment = "게시판 관리 권한에 포함됩니다.";
  }
  if (perms.authWrite || perms.authComment || perms.authAdmin) {
    lockedHint.authRead = "다른 권한이 있으면 읽기는 항상 포함됩니다.";
  }

  const togglePerm = (key: Permission, checked: boolean) =>
    setPerms((prev) => normalizePerms({ ...prev, [key]: checked }));

  const toggleJobTitle = (id: number, checked: boolean) =>
    setJobTitleIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));

  // 미리보기 문장용 (현재 선택값 → 이름)
  const preview = describeRuleTarget({
    department: departments.data?.find((d) => String(d.id) === departmentValue) ?? null,
    includeSubDepartment: hasDepartment && includeSub,
    position: positions.data?.find((p) => String(p.id) === positionValue) ?? null,
    jobTitles: (jobTitles.data ?? []).filter((j) => jobTitleIds.includes(j.id)),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!perms.authRead) return setPermError("최소 하나의 권한을 선택해 주세요.");
    setPermError(undefined);
    onSubmit({
      departmentId: hasDepartment ? Number(departmentValue) : null,
      includeSubDepartment: hasDepartment && includeSub,
      positionId: positionValue === NONE ? null : Number(positionValue),
      jobTitleIds,
      ...perms,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-5" noValidate>
      <DialogHeader>
        <DialogTitle>{rule ? "권한 규칙 수정" : "권한 규칙 추가"}</DialogTitle>
        <DialogDescription>
          아래 조건에 모두 해당하는 회원에게 선택한 권한을 줍니다. 조건을 비우면 그 조건은 검사하지 않습니다.
        </DialogDescription>
      </DialogHeader>

      <FormError message={error ? getErrorMessage(error) : null} />

      {loading ? (
        <LoadingState label="조직 정보를 불러오는 중입니다" />
      ) : (
        <>
          <fieldset className="grid gap-4">
            <legend className="mb-1 text-sm font-medium">대상 조건</legend>

            <div className="grid gap-2">
              <FormField id="auth-department" label="부서">
                <Select value={departmentValue} onValueChange={setDepartmentValue}>
                  <SelectTrigger id="auth-department" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>조건 없음 (모든 부서)</SelectItem>
                    {(departments.data ?? []).map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {d.path}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="auth-include-sub"
                  checked={hasDepartment && includeSub}
                  onCheckedChange={(v) => setIncludeSub(v === true)}
                  disabled={!hasDepartment}
                />
                <Label htmlFor="auth-include-sub" className="font-normal">
                  하위 부서 포함
                </Label>
              </div>
            </div>

            <FormField id="auth-position" label="최소 직급" hint="선택한 직급과 그보다 높은 직급(직급 순서 기준)이 해당합니다.">
              <Select value={positionValue} onValueChange={setPositionValue}>
                <SelectTrigger id="auth-position" className="w-full" aria-describedby="auth-position-message">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>조건 없음 (모든 직급)</SelectItem>
                  {(positions.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name} 이상
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <div className="grid gap-1.5">
              <p id="auth-job-titles-label" className="text-sm font-medium">
                허용 직책
              </p>
              {(jobTitles.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">등록된 직책이 없습니다.</p>
              ) : (
                <div
                  role="group"
                  aria-labelledby="auth-job-titles-label"
                  className="grid max-h-40 gap-2 overflow-y-auto rounded-md border p-3 sm:grid-cols-2"
                >
                  {(jobTitles.data ?? []).map((j) => (
                    <div key={j.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`auth-job-title-${j.id}`}
                        checked={jobTitleIds.includes(j.id)}
                        onCheckedChange={(v) => toggleJobTitle(j.id, v === true)}
                      />
                      <Label htmlFor={`auth-job-title-${j.id}`} className="font-normal">
                        {j.name}
                      </Label>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                선택하지 않으면 직책을 검사하지 않습니다. 여러 개를 고르면 그중 하나만 맡고 있어도 해당합니다.
              </p>
            </div>
          </fieldset>

          <fieldset className="grid gap-2.5">
            <legend className="mb-1 text-sm font-medium">권한</legend>
            {PERMISSIONS.map((p) => (
              <div key={p.key} className="flex items-start gap-2">
                <Checkbox
                  id={`auth-${p.key}`}
                  checked={perms[p.key]}
                  onCheckedChange={(v) => togglePerm(p.key, v === true)}
                  disabled={!!lockedHint[p.key]}
                  aria-describedby={`auth-${p.key}-hint`}
                  className="mt-0.5"
                />
                <div className="grid gap-0.5">
                  <Label htmlFor={`auth-${p.key}`} className="font-normal">
                    {p.label}
                  </Label>
                  <p id={`auth-${p.key}-hint`} className="text-xs text-muted-foreground">
                    {lockedHint[p.key] ?? p.hint}
                  </p>
                </div>
              </div>
            ))}
            {permError && (
              <p role="alert" className="text-xs text-destructive">
                {permError}
              </p>
            )}
          </fieldset>

          <p className="rounded-md bg-muted/60 px-3 py-2 text-sm">
            <span className="text-muted-foreground">대상: </span>
            {preview}
          </p>
        </>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          취소
        </Button>
        <Button type="submit" disabled={pending || loading}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {rule ? "저장" : "추가"}
        </Button>
      </DialogFooter>
    </form>
  );
}
