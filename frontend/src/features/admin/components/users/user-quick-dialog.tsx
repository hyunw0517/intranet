"use client";

import { ErrorState, LoadingState } from "@/components/common/data-state";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/providers/auth-provider";
import { useAdminUser } from "../../hooks/use-admin-users";
import { UserAccountSection } from "./user-account-section";
import { UserOrganizationSection } from "./user-organization-section";

export type QuickDialogType = "account" | "organization";

export interface QuickDialogState {
  type: QuickDialogType;
  userId: number;
  userName: string;
  open: boolean; // 닫힐 때 내용이 먼저 사라지지 않도록 대상과 열림 상태를 따로 둔다.
}

const DIALOG_TEXT: Record<QuickDialogType, { title: string; description: string }> = {
  account: { title: "권한·상태", description: "가입 승인, 권한과 재직 상태를 변경합니다." },
  organization: {
    title: "직급·소속",
    description: "직급과 소속 부서·직책을 지정합니다. 첫 소속은 대표 소속이 됩니다.",
  },
};

// 회원 목록의 [권한·상태] / [직급·소속] 모달
// 상세 페이지의 구역 컴포넌트를 그대로 재사용한다. 목록 응답에는 입사일·전체 소속이 없으므로 모달을 열 때 상세를 조회한다.
// 변경은 같은 useAdminUserMutation을 쓰므로 성공하면 목록·상세 캐시가 함께 갱신된다.
export function UserQuickDialog({ state, onClose }: { state: QuickDialogState | null; onClose: () => void }) {
  const text = state ? DIALOG_TEXT[state.type] : DIALOG_TEXT.account;

  return (
    <Dialog open={state?.open ?? false} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {text.title}
            {state && <span className="ml-1.5 font-normal text-muted-foreground">{state.userName}</span>}
          </DialogTitle>
          <DialogDescription>{text.description}</DialogDescription>
        </DialogHeader>
        {state && <QuickDialogBody type={state.type} userId={state.userId} />}
      </DialogContent>
    </Dialog>
  );
}

function QuickDialogBody({ type, userId }: { type: QuickDialogType; userId: number }) {
  const { user: me } = useAuth();
  const { data: user, isPending, isError, error, refetch } = useAdminUser(userId);

  if (isPending) return <LoadingState />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;

  return type === "account" ? (
    <UserAccountSection user={user} isSelf={me?.id === user.id} />
  ) : (
    <UserOrganizationSection user={user} />
  );
}
