"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getErrorMessage } from "@/lib/error-message";
import { resetPassword } from "@/services/api/auth";
import { deleteUser, type AdminUserDetail } from "@/services/api/users";
import { adminUserKeys } from "../../hooks/use-admin-users";

// 비밀번호 초기화 + 회원 삭제
export function UserDangerZone({ user, isSelf }: { user: AdminUserDetail; isSelf: boolean }) {
  return (
    <div className="divide-y rounded-lg border">
      <ResetPasswordRow user={user} />
      <DeleteUserRow user={user} isSelf={isSelf} />
    </div>
  );
}

function ActionRow({ title, description, action }: { title: string; description: string; action: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

// 서버가 임시 비밀번호를 만들어 응답으로 한 번만 돌려준다. (DB에는 해시만 저장되어 다시 볼 수 없음)
// 회원 캐시에 영향이 없고 이 화면에서만 쓰므로 useMutation을 컴포넌트 안에 둔다.
function ResetPasswordRow({ user }: { user: AdminUserDetail }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => resetPassword(user.id),
    onSuccess: (result) => {
      setConfirmOpen(false);
      setTemporaryPassword(result.temporaryPassword);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const handleCopy = async () => {
    if (!temporaryPassword) return;
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      toast.success("임시 비밀번호를 복사했습니다.");
    } catch {
      toast.error("복사하지 못했습니다. 직접 선택해 복사해 주세요.");
    }
  };

  return (
    <>
      <ActionRow
        title="비밀번호 초기화"
        description="임시 비밀번호를 발급합니다. 해당 회원의 기존 로그인은 모두 해제됩니다."
        action={
          <Button variant="outline" onClick={() => setConfirmOpen(true)}>
            비밀번호 초기화
          </Button>
        }
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="비밀번호 초기화"
        description={`${user.name} 회원의 비밀번호를 임시 비밀번호로 바꿉니다. 기존 비밀번호로는 더 이상 로그인할 수 없습니다.`}
        confirmLabel="초기화"
        destructive
        pending={mutation.isPending}
        onConfirm={() => mutation.mutate()}
      />

      <Dialog open={temporaryPassword !== null} onOpenChange={(open) => !open && setTemporaryPassword(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>임시 비밀번호</DialogTitle>
            <DialogDescription>
              이 창을 닫으면 다시 확인할 수 없습니다. 회원에게 전달한 뒤 마이페이지에서 비밀번호를 변경하도록 안내하세요.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md border bg-muted/50 px-3 py-2 font-mono text-base tracking-wider select-all">
              {temporaryPassword}
            </code>
            <Button variant="outline" size="icon" onClick={handleCopy} aria-label="임시 비밀번호 복사">
              <Copy />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setTemporaryPassword(null)}>확인</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DeleteUserRow({ user, isSelf }: { user: AdminUserDetail; isSelf: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  // 공용 useAdminUserMutation을 쓰지 않는 이유: 성공 후 바로 다시 불러오면 지금 보고 있는 상세가
  // (삭제된 회원이라) 400이 되어 오류 화면이 잠깐 보인다. 캐시를 만료 표시만 하고 목록으로 이동한다.
  const mutation = useMutation({
    mutationFn: () => deleteUser(user.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminUserKeys.all, refetchType: "none" });
      toast.success(`${user.name} 회원을 삭제했습니다.`);
      router.replace("/admin/users");
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const handleConfirm = () => mutation.mutate();

  return (
    <>
      <ActionRow
        title="회원 삭제"
        description={
          isSelf
            ? "본인 계정은 삭제할 수 없습니다."
            : "삭제하면 로그인할 수 없습니다. 작성 이력은 남고, [삭제된 회원]에서 복구할 수 있습니다."
        }
        action={
          <Button variant="destructive" onClick={() => setConfirmOpen(true)} disabled={isSelf}>
            회원 삭제
          </Button>
        }
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="회원 삭제"
        description={`${user.name}(${user.empNo}) 회원을 삭제합니다. 삭제된 회원은 [삭제된 회원] 목록에서 복구할 수 있습니다.`}
        confirmLabel="삭제"
        destructive
        pending={mutation.isPending}
        onConfirm={handleConfirm}
      />
    </>
  );
}
