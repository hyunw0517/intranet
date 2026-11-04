"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchBoard } from "@/services/api/boards";
import { fetchComments } from "@/services/api/comments";
import { fetchPost, fetchPosts, type PostListQuery } from "@/services/api/posts";
import type { PostDetail } from "@/types/post";
import { boardKeys } from "./use-board-navigation";

// 게시글·댓글 queryKey (boardKeys.all 아래 → 관리자가 게시판을 바꾸면 함께 무효화)
export const postKeys = {
  all: [...boardKeys.all, "posts"] as const,
  lists: (boardId: number) => [...postKeys.all, "list", boardId] as const,
  list: (boardId: number, query: PostListQuery) => [...postKeys.lists(boardId), query] as const,
  detail: (boardId: number, postId: number) => [...postKeys.all, "detail", boardId, postId] as const,
  comments: (boardId: number, postId: number) => [...postKeys.all, "comments", boardId, postId] as const,
};

// 게시판 설정 + 내 권한 (글쓰기 화면: 게시글이 없어 상세 응답을 쓸 수 없음)
export function useBoardAccess(boardId: number) {
  return useQuery({
    queryKey: boardKeys.access(boardId),
    queryFn: () => fetchBoard(boardId),
  });
}

// 게시글 목록 (+ 게시판 정보·권한) - 페이지·검색을 바꾸는 동안 이전 목록을 유지한다.
export function usePosts(boardId: number, query: PostListQuery) {
  return useQuery({
    queryKey: postKeys.list(boardId, query),
    queryFn: () => fetchPosts(boardId, query),
    placeholderData: keepPreviousData,
  });
}

// 게시글 상세 - 서버가 조회할 때마다 조회수를 올리므로 다시 요청하는 일을 줄인다.
// - 좋아요·고정 후에는 invalidate 대신 setQueryData로 캐시만 고친다. (usePostCache)
// - staleTime: 수정 화면처럼 이미 받은 본문을 다시 쓰는 곳은 Infinity로 넘긴다.
export function usePost(boardId: number, postId: number, options?: { staleTime?: number }) {
  return useQuery({
    queryKey: postKeys.detail(boardId, postId),
    queryFn: () => fetchPost(boardId, postId),
    staleTime: options?.staleTime,
  });
}

// 댓글 트리 전체 (페이지는 화면에서 나눈다)
export function useComments(boardId: number, postId: number) {
  return useQuery({
    queryKey: postKeys.comments(boardId, postId),
    queryFn: () => fetchComments(boardId, postId),
  });
}

// 게시글 캐시 갱신 모음 (변경 요청 성공 후 사용)
export function usePostCache(boardId: number) {
  const queryClient = useQueryClient();
  return {
    // 상세를 다시 요청하지 않고 필요한 값만 바꾼다. (조회수가 오르지 않게)
    patchDetail: (postId: number, patch: (prev: PostDetail) => Partial<PostDetail>) =>
      queryClient.setQueryData<PostDetail>(postKeys.detail(boardId, postId), (prev) =>
        prev ? { ...prev, ...patch(prev) } : prev,
      ),
    // 목록(제목·고정·댓글 수·좋아요 수)은 다시 받아도 부작용이 없다.
    invalidateLists: () => queryClient.invalidateQueries({ queryKey: postKeys.lists(boardId) }),
    // 수정·삭제 후: 지금 보고 있는 화면에서 바로 다시 요청하지 않고(조회수·404 깜빡임 방지) 오래된 값으로 표시만 한다.
    // 다음에 상세에 들어올 때 새로 조회한다.
    markDetailStale: (postId: number) =>
      queryClient.invalidateQueries({ queryKey: postKeys.detail(boardId, postId), refetchType: "none" }),
    invalidateComments: (postId: number) =>
      queryClient.invalidateQueries({ queryKey: postKeys.comments(boardId, postId) }),
  };
}

// 댓글 작성·수정·삭제 공용: 성공하면 댓글 트리와 목록(댓글 수)을 다시 받는다.
export function useCommentMutation<TVariables, TData = unknown>(
  boardId: number,
  postId: number,
  mutationFn: (variables: TVariables) => Promise<TData>,
) {
  const cache = usePostCache(boardId);
  return useMutation({
    mutationFn,
    onSuccess: () => Promise.all([cache.invalidateComments(postId), cache.invalidateLists()]),
  });
}
