"use client";

import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/providers/auth-provider";
import type { UserRole } from "@/features/auth/types";
import { ChangePasswordForm } from "./change-password-form";
import { ProfileForm } from "./profile-form";

const ROLE_LABEL: Record<UserRole, string> = {
  GUEST: "승인 대기",
  USER: "직원",
  ADMIN: "관리자",
};

function formatDate(value: string | null) {
  return value ? value.slice(0, 10) : "-";
}

// 마이페이지: 계정 정보(읽기 전용) + 내 정보 수정 + 비밀번호 변경
// GUEST(승인 대기)도 접근 가능하다.
export function MypageView() {
  const { user } = useAuth();
  if (!user) return null; // AuthGate 안에서만 렌더링되므로 실제로는 항상 존재

  return (
    <div className="grid gap-10">
      {user.role === "GUEST" && (
        <p className="rounded-md border bg-muted/50 px-4 py-3 text-muted-foreground">
          관리자 승인 대기 중입니다. 승인되면 인트라넷의 다른 메뉴를 이용할 수 있습니다.
        </p>
      )}

      <Section title="계정 정보" description="사번과 권한은 관리자만 변경할 수 있습니다.">
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <InfoItem label="사번" value={user.empNo} />
          <InfoItem label="권한" value={<Badge variant="secondary">{ROLE_LABEL[user.role]}</Badge>} />
          <InfoItem label="입사일" value={formatDate(user.joinAt)} />
          <InfoItem label="가입일" value={formatDate(user.createdAt)} />
        </dl>
      </Section>

      <Section title="내 정보" description="이름, 연락처 등 개인 정보를 수정합니다.">
        {/* 저장 후 서버 값으로 폼을 다시 채우기 위해 updatedAt을 key로 사용 */}
        <ProfileForm key={user.updatedAt} user={user} />
      </Section>

      <Section title="비밀번호 변경" description="변경하면 다른 기기의 로그인은 모두 해제됩니다.">
        <ChangePasswordForm />
      </Section>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 lg:grid-cols-[14rem_1fr] lg:gap-10">
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-1 text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
