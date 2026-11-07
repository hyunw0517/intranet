"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ErrorState, LoadingState } from "@/components/common/data-state";
import { InfoItem, Section } from "@/components/common/section";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import type { AdminUserDetail } from "@/services/api/users";
import { useAuth } from "@/providers/auth-provider";
import { useAdminUser } from "../../hooks/use-admin-users";
import { RoleBadge, StatusBadge } from "./user-badges";
import { UserDangerZone } from "./user-danger-zone";
import { toFormValues, UserInfoForm } from "./user-info-form";

// 관리자 회원 상세: 권한·상태·소속 조회 / 기본 정보 수정 / 계정 관리(비밀번호 초기화, 삭제)
// 권한·상태(가입 승인 포함)와 직급·소속 변경은 회원 목록의 ⋯ 메뉴 모달에서 한다. 상세에서는 조회만 한다.
export function UserDetailView({ userId }: { userId: number }) {
  const { user: me } = useAuth();
  const { data: user, isPending, isError, error, refetch } = useAdminUser(userId);

  const backLink = (
    <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2 text-muted-foreground">
      <Link href="/admin/users">
        <ChevronLeft aria-hidden />
        회원 목록
      </Link>
    </Button>
  );

  if (isPending) return <>{backLink}<LoadingState /></>;
  if (isError) return <>{backLink}<ErrorState error={error} onRetry={() => refetch()} /></>;

  // 본인 계정 삭제는 서버도 막지만(checkNotSelf), 화면에서도 미리 비활성화한다.
  const isSelf = me?.id === user.id;

  return (
    <>
      {backLink}
      <PageHeader title={user.name} description={`사번 ${user.empNo} · ${user.email}`} />

      <div className="grid gap-10">
        <Section title="권한·소속" description="권한·상태와 직급·소속은 회원 목록의 ⋯ 메뉴에서 변경합니다.">
          <UserSummary user={user} />
        </Section>

        <Section title="기본 정보" description="사번, 이름, 연락처, 입사일을 수정합니다.">
          <UserInfoForm key={JSON.stringify(toFormValues(user))} user={user} />
        </Section>

        <Section title="계정 관리" description="비밀번호 초기화와 회원 삭제는 되돌리기 어려우니 확인 후 진행하세요.">
          <UserDangerZone user={user} isSelf={isSelf} />
        </Section>
      </div>
    </>
  );
}

// 권한·상태·직급·소속 조회 (대표 소속이 맨 위로 온다)
function UserSummary({ user }: { user: AdminUserDetail }) {
  return (
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
      <InfoItem label="권한" value={<RoleBadge role={user.role} />} />
      <InfoItem label="상태" value={<StatusBadge status={user.status} />} />
      <InfoItem label="가입일" value={formatDate(user.createdAt)} />
      <InfoItem label="직급" value={user.position?.name ?? "-"} />
      <div className="sm:col-span-2 lg:col-span-4">
        <InfoItem
          label="소속"
          value={
            user.departments.length === 0 ? (
              "-"
            ) : (
              <ul className="grid gap-1.5">
                {user.departments.map((d) => (
                  <li key={d.id} className="flex items-center gap-2">
                    {d.jobTitle ? `${d.department.name} · ${d.jobTitle.name}` : d.department.name}
                    {d.isPrimary && <Badge variant="secondary">대표</Badge>}
                  </li>
                ))}
              </ul>
            )
          }
        />
      </div>
    </dl>
  );
}
