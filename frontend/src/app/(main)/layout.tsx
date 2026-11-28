import { AppShell } from "@/components/layout/app-shell";
import { BoardNavGroup } from "@/features/board/components/board-nav-group";
import { AuthGate } from "@/features/auth/guards/auth-gate";
import { PendingApprovalGate } from "@/features/auth/guards/role-gate";

// 로그인 이후 직원용 공통 레이아웃
// AuthGate는 로그인 필요, PendingApprovalGate는 승인 전(GUEST)을 마이페이지 외 안내로 막는다.
export default function MainLayout({ children }: LayoutProps<"/">) {
  return (
    <AuthGate>
      <AppShell variant="main" extraNav={<BoardNavGroup />}>
        <PendingApprovalGate>{children}</PendingApprovalGate>
      </AppShell>
    </AuthGate>
  );
}
