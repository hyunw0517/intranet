import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { AuthGate } from "@/features/auth/guards/auth-gate";
import { AdminGate } from "@/features/auth/guards/role-gate";

export const metadata: Metadata = {
  title: { default: "관리자", template: "%s | Intranet 관리자" },
};

// 관리자 레이아웃: 로그인 + ADMIN 권한 필요 (최종 권한 검증은 NestJS RolesGuard)
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <AuthGate>
      <AdminGate>
        <AppShell variant="admin">{children}</AppShell>
      </AdminGate>
    </AuthGate>
  );
}
