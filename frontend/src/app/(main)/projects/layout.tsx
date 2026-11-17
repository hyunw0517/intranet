import { AddonGate } from "@/features/addon/guards/addon-gate";
import { ProjectNav } from "@/features/project/components/project-nav";

// 과제 관리 (애드온 projects) - 꺼져 있으면 일반 404 (AddonGate)
// 제목은 화면마다 다르므로(목록·상세) 각 페이지에서 그리고, 하위 탭(프로젝트 / 내 할 일 / 거래처)만 공통으로 둔다.
export default function ProjectsLayout({ children }: LayoutProps<"/projects">) {
  return (
    <AddonGate name="projects">
      <ProjectNav />
      {children}
    </AddonGate>
  );
}
