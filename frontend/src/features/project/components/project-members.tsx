"use client";

import { useState } from "react";
import { Loader2, UserMinus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { FormError } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getErrorMessage } from "@/lib/error-message";
import { formatDateTime } from "@/lib/format";
import { addProjectMember, removeProjectMember, updateProjectMember } from "@/services/api/projects";
import type { UserSearchItem } from "@/services/api/users";
import { MEMBER_ROLE_LABEL, type ProjectDetail, type ProjectMember, type ProjectMemberRole } from "@/types/project";
import { useProjectMutation } from "../hooks/use-projects";
import { UserSearchPicker } from "./user-search-picker";

// 참여자 탭 - 추가·역할·제외는 책임자·관리자만
// - 마지막 책임자는 빼거나 바꿀 수 없다 (서버 400 메시지를 보여 준다).
// - 빠진 참여자가 담당인 과제는 칸반에 "부재"로 표시된다.
export function ProjectMembers({ project }: { project: ProjectDetail }) {
  const canManage = project.myAccess.canManage;
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<ProjectMember | null>(null);

  const update = useProjectMutation(({ memberId, role }: { memberId: number; role: ProjectMemberRole }) =>
    updateProjectMember(project.id, memberId, { role }),
  );
  const remove = useProjectMutation((memberId: number) => removeProjectMember(project.id, memberId));

  const changeRole = async (member: ProjectMember, role: ProjectMemberRole) => {
    try {
      await update.mutateAsync({ memberId: member.id, role });
      toast.success(`${member.user.name}님을 ${MEMBER_ROLE_LABEL[role]}(으)로 바꿨습니다.`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const runRemove = async () => {
    if (!removing) return;
    try {
      await remove.mutateAsync(removing.id);
      toast.success(`${removing.user.name}님을 프로젝트에서 뺐습니다.`);
      setRemoving(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">참여자 {project.members.length}명 · 책임자는 프로젝트 수정·참여자 관리를 할 수 있습니다.</p>
        {canManage && (
          <Button onClick={() => setAdding(true)}>
            <UserPlus aria-hidden />
            참여자 추가
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름</TableHead>
              <TableHead className="w-36">역할</TableHead>
              <TableHead className="w-40">추가일</TableHead>
              {canManage && <TableHead className="w-16"><span className="sr-only">제외</span></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {project.members.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <span className="font-medium">{m.user.name}</span>
                  {m.user.position && <span className="text-muted-foreground"> {m.user.position.name}</span>}
                  {m.user.status === "RESIGNED" && <span className="ml-1 text-xs text-muted-foreground">(퇴사)</span>}
                </TableCell>
                <TableCell>
                  {canManage ? (
                    <Select value={m.role} onValueChange={(v) => v !== m.role && changeRole(m, v as ProjectMemberRole)} disabled={update.isPending}>
                      <SelectTrigger size="sm" aria-label={`${m.user.name} 역할`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MANAGER">{MEMBER_ROLE_LABEL.MANAGER}</SelectItem>
                        <SelectItem value="MEMBER">{MEMBER_ROLE_LABEL.MEMBER}</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    MEMBER_ROLE_LABEL[m.role]
                  )}
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{formatDateTime(m.createdAt)}</TableCell>
                {canManage && (
                  <TableCell>
                    <Button variant="ghost" size="icon-sm" onClick={() => setRemoving(m)} aria-label={`${m.user.name} 제외`}>
                      <UserMinus />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AddMemberDialog project={project} open={adding} onClose={() => setAdding(false)} />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="참여자를 뺄까요?"
        description={`${removing?.user.name ?? ""}님은 더 이상 이 프로젝트를 볼 수 없습니다. 담당하던 과제는 담당자가 그대로 남고 "부재"로 표시되니, 필요하면 다른 참여자에게 넘겨 주세요.`}
        confirmLabel="빼기"
        destructive
        pending={remove.isPending}
        onConfirm={runRemove}
      />
    </div>
  );
}

function AddMemberDialog({ project, open, onClose }: { project: ProjectDetail; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">{open && <AddMemberForm project={project} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function AddMemberForm({ project, onClose }: { project: ProjectDetail; onClose: () => void }) {
  const [selected, setSelected] = useState<UserSearchItem | null>(null);
  const [role, setRole] = useState<ProjectMemberRole>("MEMBER");
  const [error, setError] = useState<string | null>(null);

  const add = useProjectMutation(() => addProjectMember(project.id, { userId: selected!.id, role }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || add.isPending) return;
    setError(null);
    try {
      await add.mutateAsync(undefined);
      toast.success(`${selected.name}님을 추가했습니다. 알림이 갑니다.`);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>참여자 추가</DialogTitle>
        <DialogDescription>재직 중인 회원을 검색해 추가합니다.</DialogDescription>
      </DialogHeader>

      <FormError message={error} />

      <UserSearchPicker excludeIds={project.members.map((m) => m.user.id)} selectedId={selected?.id ?? null} onSelect={setSelected} />

      {selected && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
          <p className="text-sm">
            <span className="font-medium">{selected.name}</span>
            <span className="text-muted-foreground"> {[selected.positionName, selected.departmentName].filter(Boolean).join(" · ")}</span>
          </p>
          <div className="flex items-center gap-2">
            <Label htmlFor="member-role">역할</Label>
            <Select value={role} onValueChange={(v) => setRole(v as ProjectMemberRole)}>
              <SelectTrigger id="member-role" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MEMBER">{MEMBER_ROLE_LABEL.MEMBER}</SelectItem>
                <SelectItem value="MANAGER">{MEMBER_ROLE_LABEL.MANAGER}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={add.isPending}>
          취소
        </Button>
        <Button type="submit" disabled={!selected || add.isPending}>
          {add.isPending && <Loader2 className="animate-spin" aria-hidden />}
          추가
        </Button>
      </DialogFooter>
    </form>
  );
}
