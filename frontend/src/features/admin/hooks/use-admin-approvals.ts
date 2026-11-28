"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { approvalKeys } from "@/features/approval/hooks/use-approvals";
import { fetchLineManagers } from "@/services/api/line-managers";

// 결재라인 관리자 규칙 (바꾸면 관리 범위도 달라져서 전자결재 키도 같이 무효화)
export const adminApprovalKeys = {
  all: ["admin", "approvals"] as const,
  lineManagers: () => [...adminApprovalKeys.all, "line-managers"] as const,
};

export function useLineManagers() {
  return useQuery({ queryKey: adminApprovalKeys.lineManagers(), queryFn: fetchLineManagers });
}

export function useLineManagerMutation<TVariables = void, TData = unknown>(mutationFn: (variables: TVariables) => Promise<TData>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminApprovalKeys.all });
      await queryClient.invalidateQueries({ queryKey: approvalKeys.all });
    },
  });
}
