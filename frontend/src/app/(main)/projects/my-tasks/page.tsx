import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { MyTasksView } from "@/features/project/components/my-tasks-view";

export const metadata: Metadata = { title: "내 할 일" };

export default function MyTasksPage() {
  return (
    <>
      <PageHeader title="내 할 일" description="내가 담당인 미완료 과제입니다. 마감일이 가까운 순으로 보여 줍니다." />
      <MyTasksView />
    </>
  );
}
