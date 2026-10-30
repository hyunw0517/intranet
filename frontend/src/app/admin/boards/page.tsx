import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { BoardPanel } from "@/features/admin/components/boards/board-panel";

export const metadata: Metadata = { title: "게시판 관리" };

export default function AdminBoardsPage() {
  return (
    <>
      <PageHeader title="게시판 관리" description="카테고리와 게시판을 만들고, 게시판별 열람·작성 권한을 설정합니다." />
      <BoardPanel />
    </>
  );
}
