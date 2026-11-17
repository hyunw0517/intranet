import { AddonGate } from "@/features/addon/guards/addon-gate";
import { AdminPermissionGate } from "@/features/auth/guards/role-gate";

// 프로젝트 관리 (애드온 projects) - 꺼져 있으면 일반 404, PROJECTS 기능을 가진 관리자만
export default function AdminProjectsLayout({ children }: LayoutProps<"/admin/projects">) {
  return (
    <AddonGate name="projects">
      <AdminPermissionGate permission="PROJECTS">{children}</AdminPermissionGate>
    </AddonGate>
  );
}
