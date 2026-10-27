"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createJobTitle, deleteJobTitle, updateJobTitle } from "@/services/api/job-titles";
import { createPosition, deletePosition, updatePosition } from "@/services/api/positions";
import { useJobTitles, usePositions } from "../../hooks/use-organization";
import { DepartmentPanel } from "./department-panel";
import { RankListPanel } from "./rank-list-panel";

// 조직 관리: 부서 / 직급 / 직책 탭 (셋 다 이름 중심의 단순 CRUD라 한 페이지에 둔다)
export function OrganizationView() {
  const positions = usePositions();
  const jobTitles = useJobTitles();

  return (
    <Tabs defaultValue="departments" className="gap-4">
      <TabsList>
        <TabsTrigger value="departments">부서</TabsTrigger>
        <TabsTrigger value="positions">직급</TabsTrigger>
        <TabsTrigger value="job-titles">직책</TabsTrigger>
      </TabsList>

      <TabsContent value="departments">
        <DepartmentPanel />
      </TabsContent>

      <TabsContent value="positions">
        <RankListPanel
          label="직급"
          description="사원·대리·과장처럼 사람에게 붙는 등급입니다. 목록 순서는 등록 순서이며 직급 비교 기준(sortOrder)으로 쓰입니다."
          query={positions}
          create={createPosition}
          update={updatePosition}
          remove={deletePosition}
        />
      </TabsContent>

      <TabsContent value="job-titles">
        <RankListPanel
          label="직책"
          description="팀장·본부장처럼 소속 부서에서 맡는 역할입니다."
          query={jobTitles}
          create={createJobTitle}
          update={updateJobTitle}
          remove={deleteJobTitle}
        />
      </TabsContent>
    </Tabs>
  );
}
