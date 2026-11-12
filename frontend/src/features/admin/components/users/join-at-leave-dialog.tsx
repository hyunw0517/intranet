"use client";

import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { getErrorMessage } from "@/lib/error-message";
import { recalculateLeaveGrants } from "@/services/api/leave-grants";
import { useAdminLeaveMutation } from "../../hooks/use-admin-leaves";

// 관리자가 회원 입사일을 바꾼 뒤 띄우는 안내 (휴가 옵션이 켜져 있을 때만 - 부모가 판단)
// 연차 부여는 입사일로 계산하지만 저장해 둔 값이라, 입사일을 바꿔도 다음 월 배치(매월 1일 00시) 전까지는 그대로다.
// [지금 재계산]은 전체 회원의 올해(12월이면 다음 해도) 계산값을 다시 계산한다(관리자 조정값은 유지, 백엔드 leave-grants.service).
export function JoinAtLeaveDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  // 연차 관리 화면 목록도 함께 다시 조회되게 같은 mutation 훅을 쓴다
  const recalc = useAdminLeaveMutation(recalculateLeaveGrants);
  const mutation = {
    isPending: recalc.isPending,
    mutate: () =>
      recalc.mutate(undefined, {
        onSuccess: (result) => {
          toast.success(`연차를 다시 계산했습니다. (${result.years.map((y) => `${y.year}년 ${y.count}명`).join(", ")})`);
          onOpenChange(false);
        },
        onError: (error) => toast.error(getErrorMessage(error)),
      }),
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="입사일이 변경되었습니다"
      description={
        <>
          연차 부여 일수는 입사일로 계산합니다. 바뀐 입사일은 다음 달 1일 00시 연차 재계산 때 반영됩니다.
          <br />
          지금 바로 반영하려면 [지금 재계산]을 누르세요. 관리자가 조정한 일수는 그대로 유지됩니다.
        </>
      }
      confirmLabel="지금 재계산"
      pending={mutation.isPending}
      onConfirm={() => mutation.mutate()}
    />
  );
}
