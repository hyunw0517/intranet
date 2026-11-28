"use client";

import Link from "next/link";
import { EmptyState } from "@/components/common/data-state";
import { useEnabledAddons } from "@/features/addon/hooks/use-addons";
import { MonthlyAmountChart, TopClientsChart } from "@/features/project/components/charts-lazy";
import { useProjectStats } from "@/features/project/hooks/use-projects";
import { hasAdminPermission } from "@/lib/admin-permission";
import { formatDateTime, toKstParts } from "@/lib/format";
import { useAuth } from "@/providers/auth-provider";
import { AUDIT_ACTION_LABEL } from "@/types/audit";
import { todayRange, useAuditLogs, useTodayAdminReservations, useUserStats } from "../hooks/use-dashboard";
import { CardEmpty, CardState, DashboardCard, StatTile } from "./dashboard-card";

const RECENT_AUDIT_COUNT = 6;

// 관리자 대시보드: 카드마다 그 기능을 가진 관리자에게만 보인다
export function AdminDashboard() {
  const { user } = useAuth();
  const { data: addons, isPending } = useEnabledAddons();
  if (isPending) return null;

  const enabled = addons?.enabled ?? [];
  const users = hasAdminPermission(user, "USERS");
  const reservations = enabled.includes("reservations") && hasAdminPermission(user, "RESERVATIONS");
  const projects = enabled.includes("projects") && hasAdminPermission(user, "PROJECTS");
  const audit = hasAdminPermission(user, "AUDIT");

  if (user?.role === "ADMIN" && (user.adminPermissions ?? []).length === 0) {
    return <EmptyState message="지정된 관리자 기능이 없습니다. 슈퍼관리자에게 필요한 기능을 요청하세요." />;
  }
  if (!users && !reservations && !projects && !audit) {
    return <EmptyState message="왼쪽 메뉴에서 관리 화면을 선택하세요." />;
  }

  return (
    <div className="grid gap-4">
      {users && <UserStatTiles />}
      {projects && <ProjectStatCards />}
      <div className="grid gap-4 lg:grid-cols-2">
        {reservations && <TodayReservationsCard />}
        {audit && <RecentAuditCard />}
      </div>
    </div>
  );
}

function UserStatTiles() {
  const { data } = useUserStats();
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile label="가입 승인 대기" value={data?.pending} unit="명" href="/admin/users?role=GUEST" />
      <StatTile label="재직" value={data?.active} unit="명" href="/admin/users?status=ACTIVE" />
      <StatTile label="비활성" value={data?.inactive} unit="명" href="/admin/users?status=INACTIVE" />
      <StatTile label="로그인 잠금" value={data?.locked} unit="명" href="/admin/users" />
    </div>
  );
}

function ProjectStatCards() {
  const { data, isLoading, error, refetch } = useProjectStats({});

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <DashboardCard title="월별 매출" href="/admin/projects">
        <CardState isLoading={isLoading} error={error} onRetry={() => void refetch()}>
          {data && <MonthlyAmountChart data={data.monthlySales} label="매출" emptyMessage="최근 12개월 동안 청구한 매출이 없습니다." />}
        </CardState>
      </DashboardCard>
      <DashboardCard title="월별 지출" href="/admin/projects">
        <CardState isLoading={isLoading} error={error} onRetry={() => void refetch()}>
          {data && <MonthlyAmountChart data={data.monthlyExpenses} label="지출" emptyMessage="최근 12개월 동안 등록한 지출이 없습니다." />}
        </CardState>
      </DashboardCard>
      <DashboardCard title="거래처별 매출 순위" href="/admin/projects">
        <CardState isLoading={isLoading} error={error} onRetry={() => void refetch()}>
          {data && <TopClientsChart data={data.topClients} />}
        </CardState>
      </DashboardCard>
    </div>
  );
}

function TodayReservationsCard() {
  const { data, isLoading, error, refetch } = useTodayAdminReservations(todayRange());
  const total = data?.meta.total ?? 0;

  return (
    <DashboardCard title={data ? `오늘 예약 ${total}건` : "오늘 예약"} href="/admin/reservations">
      <CardState isLoading={isLoading} error={error} onRetry={() => void refetch()}>
        {total === 0 ? (
          <CardEmpty message="오늘 예약이 없습니다." />
        ) : (
          <ul className="divide-y">
            {data?.data.map((reservation) => (
              <li key={reservation.id} className="flex items-center gap-3 py-2">
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                  {toKstParts(reservation.startAt).time}~{toKstParts(reservation.endAt).time}
                </span>
                <span className="min-w-0 flex-1 truncate">{reservation.facility.name}</span>
                <span className="max-w-24 shrink-0 truncate text-xs text-muted-foreground">{reservation.user.name}</span>
              </li>
            ))}
          </ul>
        )}
      </CardState>
    </DashboardCard>
  );
}

function RecentAuditCard() {
  const { data, isLoading, error, refetch } = useAuditLogs({ take: RECENT_AUDIT_COUNT });
  const logs = data?.pages[0]?.data ?? [];

  return (
    <DashboardCard title="최근 관리 활동" href="/admin/audit">
      <CardState isLoading={isLoading} error={error} onRetry={() => void refetch()}>
        {logs.length === 0 ? (
          <CardEmpty message="기록된 활동이 없습니다." />
        ) : (
          <ul className="divide-y">
            {logs.map((log) => (
              <li key={log.id}>
                <Link href="/admin/audit" className="flex items-center gap-3 py-2 hover:bg-muted/50">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{log.content ?? AUDIT_ACTION_LABEL[log.actionType]}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {log.actor?.name ?? "작업자 없음"} · {AUDIT_ACTION_LABEL[log.actionType]}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatDateTime(log.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardState>
    </DashboardCard>
  );
}
