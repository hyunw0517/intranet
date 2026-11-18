// 백엔드 common/audit-logs.controller 대응 (/common/audit-logs)
import { apiFetch } from "@/services/api-client";
import type { AuditActionType, AuditLog, AuditTargetType } from "@/types/audit";
import type { CursorResult } from "@/types/pagination";

export interface AuditLogQuery {
  take?: number;
  from?: string; // "YYYY-MM-DD" (KST)
  to?: string;
  actionType?: AuditActionType;
  targetType?: AuditTargetType;
  actor?: string; // 작업자 이름 또는 사번
}

// 최신순 커서 페이지네이션 (cursor = 직전 응답의 meta.nextCursor), AUDIT 기능을 가진 관리자만
export function fetchAuditLogs(query: AuditLogQuery & { cursor?: string }) {
  return apiFetch<CursorResult<AuditLog>>("/common/audit-logs", { query: { ...query } });
}
