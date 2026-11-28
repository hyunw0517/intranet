import { AddonGate } from "@/features/addon/guards/addon-gate";
import { ProjectNav } from "@/features/project/components/project-nav";

// 과제 관리 (애드온 projects, 꺼져 있으면 404)
// 하위 탭만 공통으로 두고 제목은 각 페이지에서 그린다.
export default function ProjectsLayout({ children }: LayoutProps<"/projects">) {
  return (
    <AddonGate name="projects">
      <ProjectNav />
      {children}
    </AddonGate>
  );
}
