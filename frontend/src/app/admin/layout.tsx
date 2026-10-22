import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";

export const metadata: Metadata = {
  title: { default: "관리자", template: "%s | Intranet 관리자" },
};

// 관리자 레이아웃. ADMIN 권한 확인은 인증(FE-01) 구현 시 추가한다. (최종 권한 검증은 NestJS RolesGuard)
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <AppShell variant="admin">{children}</AppShell>;
}
