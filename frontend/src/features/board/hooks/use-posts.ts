"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { fetchBoard } from "@/services/api/boards";
import { fetchComments } from "@/services/api/comments";
import { fetchPost, fetchPosts, type PostListQuery } from "@/services/api/posts";
import type { PostDetail, PostListItem, PostListResult } from "@/types/post";
import { boardKeys } from "./use-board-navigation";

// 게시글·댓글 queryKey (boardKeys.all 아래 → 관리자가 게시판을 바꾸면 함께 무효화)
export const postKeys = {
  all: [...boardKeys.all, "posts"] as const,
  lists: (boardId: number) => [...postKeys.all, "list", boardId] as const,
  list: (boardId: number, query: PostListQuery) => [...postKeys.lists(boardId), query] as const,
  // 캘린더 일정은 목록과 응답 모양이 달라 lists 아래에 두지 않는다. (syncListAfterView가 lists 아래를 목록 모양으로 고침)
  events: (boardId: number) => [...postKeys.all, "events", boardId] as const,
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
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: postKeys.detail(boardId, postId),
    queryFn: async () => {
      const post = await fetchPost(boardId, postId);
      syncListAfterView(queryClient, boardId, post);
      return post;
    },
    staleTime: options?.staleTime,
  });
}

// 상세를 조회하면 서버의 조회수가 올라간다. 목록 캐시는 그대로라서 뒤로 가면 이전 조회수가 보인다.
// 1) 캐시된 목록에서 이 글의 조회수·좋아요 수를 상세 응답 값으로 바로 고치고 (돌아왔을 때 이전 숫자가 깜빡이지 않게)
// 2) 목록을 오래된 값으로 표시해 목록 화면에 돌아오면 다시 받는다. (다른 사람이 올린 글·댓글 수 반영)
//    목록은 지금 화면에 없으므로 refetchType: "none" - 바로 요청하지 않고 다음 마운트 때 요청한다.
function syncListAfterView(queryClient: QueryClient, boardId: number, post: PostDetail) {
  queryClient.setQueriesData<PostListResult>({ queryKey: postKeys.lists(boardId) }, (prev) => {
    if (!prev) return prev;
    const patch = (row: PostListItem) =>
      row.id === post.id ? { ...row, viewCount: post.viewCount, likeCount: post.likeCount } : row;
    return { ...prev, pinned: prev.pinned.map(patch), data: prev.data.map(patch) };
  });
  queryClient.invalidateQueries({ queryKey: postKeys.lists(boardId), refetchType: "none" });
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
    // 글 작성·수정·삭제 후 호출하므로 캘린더 일정(일정 날짜·제목)도 함께 다시 받는다.
    invalidateLists: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: postKeys.lists(boardId) }),
        queryClient.invalidateQueries({ queryKey: postKeys.events(boardId) }),
      ]),
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
