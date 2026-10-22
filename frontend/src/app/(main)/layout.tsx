import { AppShell } from "@/components/layout/app-shell";

// 로그인 이후 직원용 공통 레이아웃
export default function MainLayout({ children }: LayoutProps<"/">) {
  return <AppShell variant="main">{children}</AppShell>;
}
