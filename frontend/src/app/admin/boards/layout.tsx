import { AdminPermissionGate } from "@/features/auth/guards/role-gate";

// 게시판 관리 - BOARDS 기능을 가진 관리자만 (최종 검증은 백엔드 @RequireAdmin)
export default function AdminBoardsLayout({ children }: LayoutProps<"/admin/boards">) {
  return <AdminPermissionGate permission="BOARDS">{children}</AdminPermissionGate>;
}
