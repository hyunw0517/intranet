"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchApprovalCounts,
  fetchApprovalDocument,
  fetchApprovalDocuments,
  fetchDocumentTypes,
  type ApprovalListQuery,
} from "@/services/api/approval-documents";
import { fetchManageableLines, fetchUsableLines } from "@/services/api/approval-lines";
import { searchApprovers } from "@/services/api/approvers";
import { fetchMyLineScope } from "@/services/api/line-managers";

// 전자결재 queryKey - 문서·결재라인을 바꾸면 all 접두사로 결재함·상세·결재라인을 함께 다시 조회한다.
// (승인 한 번에 내 결재 대기함·결재 완료함·상세가 모두 바뀌므로 범위를 나누지 않는다)
export const approvalKeys = {
  all: ["approvals"] as const,
  documentTypes: () => [...approvalKeys.all, "document-types"] as const,
  list: (query: ApprovalListQuery) => [...approvalKeys.all, "list", query] as const,
  counts: () => [...approvalKeys.all, "counts"] as const,
  detail: (id: number) => [...approvalKeys.all, "detail", id] as const,
  usableLines: () => [...approvalKeys.all, "lines", "usable"] as const,
  manageableLines: () => [...approvalKeys.all, "lines", "manage"] as const,
  myScope: () => [...approvalKeys.all, "line-managers", "me"] as const,
  approvers: (search: string) => [...approvalKeys.all, "approvers", search] as const,
};

export function useDocumentTypes() {
  return useQuery({ queryKey: approvalKeys.documentTypes(), queryFn: fetchDocumentTypes, staleTime: Infinity });
}

export function useApprovalList(query: ApprovalListQuery) {
  return useQuery({
    queryKey: approvalKeys.list(query),
    queryFn: () => fetchApprovalDocuments(query),
    placeholderData: keepPreviousData,
  });
}

// 결재함 탭 건수 - 상신·승인 등 변경 후에는 approvalKeys.all 무효화로 함께 다시 조회된다
export function useApprovalCounts() {
  return useQuery({ queryKey: approvalKeys.counts(), queryFn: fetchApprovalCounts });
}

export function useApprovalDocument(id: number) {
  return useQuery({ queryKey: approvalKeys.detail(id), queryFn: () => fetchApprovalDocument(id) });
}

// 내가 불러올 수 있는 결재라인 템플릿
export function useUsableLines() {
  return useQuery({ queryKey: approvalKeys.usableLines(), queryFn: fetchUsableLines });
}

// 내 결재라인 관리 범위 (관리할 수 있는 게 없으면 { all: false, departmentIds: [] })
export function useMyLineScope() {
  return useQuery({ queryKey: approvalKeys.myScope(), queryFn: fetchMyLineScope });
}

// 관리할 수 있는 공용·부서 결재라인 (권한이 있을 때만 호출 - 없으면 서버가 403)
export function useManageableLines(enabled: boolean) {
  return useQuery({ queryKey: approvalKeys.manageableLines(), queryFn: fetchManageableLines, enabled });
}

// 결재자 검색 (검색어가 바뀌는 동안 이전 결과 유지)
export function useApproverSearch(search: string, enabled = true) {
  return useQuery({
    queryKey: approvalKeys.approvers(search),
    queryFn: () => searchApprovers(search),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

// 문서·결재라인을 바꾸는 요청 공용 - 성공하면 전자결재 데이터를 모두 다시 조회
export function useApprovalMutation<TVariables = void, TData = unknown>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: approvalKeys.all }),
  });
}
