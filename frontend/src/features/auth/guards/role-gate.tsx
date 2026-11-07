"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isGuestAllowedPath } from "@/lib/guest-access";
import { useAuth } from "@/providers/auth-provider";

// 직원용 화면: GUEST는 승인 대기 안내만 보여 준다. (마이페이지는 허용)
// 화면만 가리는 것이므로, 업무 API는 백엔드에서 @Roles(USER)로 GUEST를 거부해야 한다.
export function PendingApprovalGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();

  if (user?.role === "GUEST" && !isGuestAllowedPath(pathname)) {
    return (
      <GateMessage
        icon={<Clock className="size-5" />}
        title="관리자 승인 대기 중입니다"
        description="가입 신청이 접수되었습니다. 관리자가 승인하면 인트라넷을 이용할 수 있습니다."
        action={
          <Button asChild variant="outline">
            <Link href="/mypage">내 정보 확인</Link>
          </Button>
        }
      />
    );
  }

  return <>{children}</>;
}

// 관리자 화면: ADMIN만 접근 가능. 최종 권한 검증은 백엔드 RolesGuard가 한다.
export function AdminGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (user?.role !== "ADMIN") {
    return (
      <div className="flex min-h-svh items-center justify-center px-4">
        <GateMessage
          icon={<ShieldX className="size-5" />}
          title="접근 권한이 없습니다"
          description="관리자 화면은 관리자 권한이 있는 계정만 이용할 수 있습니다."
          action={
            <Button asChild variant="outline">
              <Link href="/">직원 화면으로 이동</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return <>{children}</>;
}

function GateMessage({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <div className="mb-4 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </div>
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="mt-2 text-muted-foreground">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
