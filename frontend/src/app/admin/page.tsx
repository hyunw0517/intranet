import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";

// 구현된 관리 화면 바로가기 (기능이 생기면 항목 추가)
const ADMIN_LINKS = [
  { href: "/admin/users", title: "회원 관리", description: "가입 승인, 권한·상태, 직급·소속, 비밀번호 초기화" },
  { href: "/admin/organization", title: "조직 관리", description: "부서 트리, 직급, 직책" },
  { href: "/admin/boards", title: "게시판 관리", description: "카테고리·게시판, 게시판별 권한 규칙" },
];

export default function AdminHomePage() {
  return (
    <>
      <PageHeader title="관리자 홈" description="회원·조직·게시판 등 인트라넷 설정을 관리합니다." />
      <ul className="grid gap-3 sm:grid-cols-2">
        {ADMIN_LINKS.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="flex items-center justify-between gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <div>
                <p className="font-medium">{link.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{link.description}</p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
