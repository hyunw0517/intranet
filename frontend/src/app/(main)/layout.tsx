import { AppShell } from "@/components/layout/app-shell";
import { AuthGate } from "@/features/auth/guards/auth-gate";
import { PendingApprovalGate } from "@/features/auth/guards/role-gate";

// 로그인 이후 직원용 공통 레이아웃
// AuthGate: 로그인 필요 / PendingApprovalGate: 승인 전(GUEST)은 마이페이지 외 승인 대기 안내
export default function MainLayout({ children }: LayoutProps<"/">) {
  return (
    <AuthGate>
      <AppShell variant="main">
        <PendingApprovalGate>{children}</PendingApprovalGate>
      </AppShell>
    </AuthGate>
  );
}
